// ============================================================
// Bridge for Claude Code — Figma Plugin
//
// Receives commands from the UI (WebSocket relay) and executes
// them against the Figma Plugin API.
//
// Supported actions:
//   - getSelection: info about current selection
//   - getNodeInfo: info about a specific node
//   - getChildren: list children of a node
//   - findByName: find nodes by name
//   - rename: rename a node
//   - resize: resize a node
//   - addComponentProperty: add boolean/text/instance-swap property
//   - linkPropertyToVisibility: link a boolean property to layer visibility
//   - setLayoutSizing: change layout sizing mode
//   - batchSetLayoutSizing: change layout sizing on multiple nodes
//   - cloneNode: clone a node N times (with optional visibility)
//   - setVariantName: rename a variant in a component set
//   - deleteNode: delete a node
//   - setPluginData: store data on a node
//   - runScript: execute arbitrary JS (for complex operations)
//   - ping: check connection
// ============================================================

figma.showUI(__html__, { width: 320, height: 200, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.id || !msg.action) return;

  try {
    const result = await executeCommand(msg);
    figma.ui.postMessage({ id: msg.id, result: result });
  } catch (e) {
    figma.ui.postMessage({ id: msg.id, error: String(e.message || e) });
  }
};

// ─────────────────────────────────────────────
// Command Router
// ─────────────────────────────────────────────

async function executeCommand(cmd) {
  switch (cmd.action) {
    case "ping":
      return { pong: true, timestamp: Date.now() };

    case "getSelection":
      return getSelection();

    case "getNodeInfo":
      return getNodeInfo(cmd.nodeId);

    case "getChildren":
      return getChildren(cmd.nodeId, cmd.depth || 1);

    case "findByName":
      return findByName(cmd.name, cmd.parentId, cmd.type);

    case "rename":
      return rename(cmd.nodeId, cmd.name);

    case "renameMany":
      return renameMany(cmd.renames);

    case "resize":
      return resize(cmd.nodeId, cmd.width, cmd.height);

    case "addComponentProperty":
      return addComponentProperty(cmd.nodeId, cmd.propName, cmd.propType, cmd.defaultValue);

    case "linkPropertyToVisibility":
      return linkPropertyToVisibility(cmd.nodeId, cmd.layerName, cmd.propName, cmd.recursive);

    case "setLayoutSizing":
      return setLayoutSizing(cmd.nodeId, cmd.horizontal, cmd.vertical);

    case "batchSetLayoutSizing":
      return batchSetLayoutSizing(cmd.nodes);

    case "cloneNode":
      return cloneNode(cmd.nodeId, cmd.count, cmd.visible);

    case "setVariantName":
      return setVariantName(cmd.nodeId, cmd.newName);

    case "deleteNode":
      return deleteNode(cmd.nodeId);

    case "setNodeProperty":
      return setNodeProperty(cmd.nodeId, cmd.property, cmd.value);

    case "runScript":
      return await runScript(cmd.code);

    default:
      throw new Error("Unknown action: " + cmd.action);
  }
}

// ─────────────────────────────────────────────
// Read Operations
// ─────────────────────────────────────────────

function getSelection() {
  const sel = figma.currentPage.selection;
  return {
    count: sel.length,
    nodes: sel.map(nodeToInfo),
  };
}

function getNodeInfo(nodeId) {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  return nodeToInfo(node);
}

function getChildren(nodeId, depth) {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (!("children" in node)) throw new Error("Node has no children");
  return {
    id: node.id,
    name: node.name,
    children: node.children.map(function (c) {
      var info = nodeToInfo(c);
      if (depth > 1 && "children" in c) {
        info.children = c.children.map(function (gc) {
          return depth > 2 && "children" in gc
            ? Object.assign(nodeToInfo(gc), {
                children: gc.children.map(nodeToInfo),
              })
            : nodeToInfo(gc);
        });
      }
      return info;
    }),
  };
}

function findByName(name, parentId, type) {
  var parent = parentId ? figma.getNodeById(parentId) : figma.currentPage;
  if (!parent) throw new Error("Parent not found: " + parentId);
  if (!("findAll" in parent)) throw new Error("Parent cannot search children");

  var results = parent.findAll(function (n) {
    var nameMatch = n.name === name || n.name.includes(name);
    var typeMatch = !type || n.type === type;
    return nameMatch && typeMatch;
  });

  return {
    count: results.length,
    nodes: results.slice(0, 50).map(nodeToInfo),
  };
}

// ─────────────────────────────────────────────
// Write Operations
// ─────────────────────────────────────────────

function rename(nodeId, newName) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  var oldName = node.name;
  node.name = newName;
  return { nodeId: nodeId, oldName: oldName, newName: newName };
}

function renameMany(renames) {
  var results = [];
  for (var i = 0; i < renames.length; i++) {
    var r = renames[i];
    try {
      results.push(rename(r.nodeId, r.name));
    } catch (e) {
      results.push({ nodeId: r.nodeId, error: e.message });
    }
  }
  return { renamed: results.length, results: results };
}

function resize(nodeId, width, height) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (!("resize" in node)) throw new Error("Node cannot be resized");
  node.resize(width, height);
  return { nodeId: nodeId, width: width, height: height };
}

function addComponentProperty(nodeId, propName, propType, defaultValue) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT") {
    throw new Error("Node is not a Component or ComponentSet");
  }

  var existing = node.componentPropertyDefinitions;
  if (existing[propName]) {
    return { skipped: true, reason: "Property already exists: " + propName };
  }

  node.addComponentProperty(propName, propType, defaultValue);
  return { added: propName, type: propType, defaultValue: defaultValue };
}

function linkPropertyToVisibility(nodeId, layerName, propName, recursive) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);

  var targets =
    node.type === "COMPONENT_SET"
      ? node.children.filter(function (c) {
          return c.type === "COMPONENT";
        })
      : [node];

  var propDefs =
    node.type === "COMPONENT_SET"
      ? node.componentPropertyDefinitions
      : node.parent && node.parent.type === "COMPONENT_SET"
        ? node.parent.componentPropertyDefinitions
        : {};

  var propKey = Object.keys(propDefs).find(function (k) {
    return k === propName || k.startsWith(propName);
  });
  if (!propKey) throw new Error("Property not found: " + propName);

  var linked = 0;
  var errors = [];

  for (var i = 0; i < targets.length; i++) {
    var variant = targets[i];
    var found = findLayerInTree(variant, layerName, recursive !== false);
    for (var j = 0; j < found.length; j++) {
      try {
        found[j].componentPropertyReferences = Object.assign(
          {},
          found[j].componentPropertyReferences,
          { visible: propKey }
        );
        linked++;
      } catch (e) {
        errors.push(variant.name + "/" + found[j].name + ": " + e.message);
      }
    }
  }

  return { linked: linked, errors: errors };
}

function setLayoutSizing(nodeId, horizontal, vertical) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);

  var result = { nodeId: nodeId };

  if (horizontal) {
    try {
      node.layoutSizingHorizontal = horizontal;
      result.horizontal = horizontal;
    } catch (e) {
      result.horizontalError = e.message;
    }
  }
  if (vertical) {
    try {
      node.layoutSizingVertical = vertical;
      result.vertical = vertical;
    } catch (e) {
      result.verticalError = e.message;
    }
  }

  return result;
}

function batchSetLayoutSizing(nodes) {
  var results = [];
  for (var i = 0; i < nodes.length; i++) {
    try {
      results.push(setLayoutSizing(nodes[i].nodeId, nodes[i].horizontal, nodes[i].vertical));
    } catch (e) {
      results.push({ nodeId: nodes[i].nodeId, error: e.message });
    }
  }
  return { count: results.length, results: results };
}

function cloneNode(nodeId, count, visible) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (!node.parent) throw new Error("Node has no parent");

  count = count || 1;
  var clones = [];

  var source = node;
  for (var i = 0; i < count; i++) {
    var clone = source.clone();
    if (visible !== undefined) clone.visible = visible;
    clones.push({ id: clone.id, name: clone.name, visible: clone.visible });
    source = clone;
  }

  return { original: nodeId, count: clones.length, clones: clones };
}

function setVariantName(nodeId, newName) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (node.type !== "COMPONENT") throw new Error("Node is not a Component variant");
  var oldName = node.name;
  node.name = newName;
  return { nodeId: nodeId, oldName: oldName, newName: newName };
}

function deleteNode(nodeId) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  var name = node.name;
  node.remove();
  return { deleted: nodeId, name: name };
}

function setNodeProperty(nodeId, property, value) {
  var node = figma.getNodeById(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  node[property] = value;
  return { nodeId: nodeId, property: property, value: value };
}

// ─────────────────────────────────────────────
// Script Execution (for complex operations)
// ─────────────────────────────────────────────

async function runScript(code) {
  var fn = new Function("figma", code);
  var result = await fn(figma);
  return result === undefined ? { ok: true } : result;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function nodeToInfo(node) {
  var info = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ("width" in node) {
    info.width = Math.round(node.width);
    info.height = Math.round(node.height);
  }

  if ("layoutSizingHorizontal" in node) {
    info.layoutSizingH = node.layoutSizingHorizontal;
    info.layoutSizingV = node.layoutSizingVertical;
  }

  if (node.type === "COMPONENT_SET") {
    info.componentProperties = Object.keys(
      node.componentPropertyDefinitions || {}
    );
    if ("children" in node) {
      info.childCount = node.children.length;
    }
  } else if (node.type === "COMPONENT") {
    var isVariant = node.parent && node.parent.type === "COMPONENT_SET";
    if (isVariant) {
      info.variantProperties = node.variantProperties || {};
      info.parentComponentSetId = node.parent.id;
    } else {
      info.componentProperties = Object.keys(
        node.componentPropertyDefinitions || {}
      );
    }
    if ("children" in node) {
      info.childCount = node.children.length;
    }
  }

  if (node.type === "TEXT") {
    info.characters = node.characters;
  }

  if ("visible" in node) {
    info.visible = node.visible;
  }

  if ("componentPropertyReferences" in node && node.componentPropertyReferences) {
    info.propertyRefs = node.componentPropertyReferences;
  }

  return info;
}

function findLayerInTree(parent, name, recursive) {
  var results = [];
  if (!("children" in parent)) return results;

  for (var i = 0; i < parent.children.length; i++) {
    var child = parent.children[i];
    if (child.name === name) {
      results.push(child);
    }
    if (recursive && "children" in child) {
      results = results.concat(findLayerInTree(child, name, true));
    }
  }
  return results;
}
