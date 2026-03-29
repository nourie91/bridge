// ---------------------------------------------------------------------------
// Code generator — transforms resolved scene graph into Figma Plugin API code
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// SAFE NAMING
// ---------------------------------------------------------------------------

/**
 * Convert a token ref like "$spacing/md" to a safe JS variable name.
 * @param {string} ref
 * @returns {string}
 */
function refToVarName(ref) {
  const stripped = ref.replace(/^\$/, '');
  return stripped.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Prefix map for node types → variable name prefix.
 */
const TYPE_PREFIX = {
  FRAME: 'frame',
  TEXT: 'text',
  INSTANCE: 'inst',
  CLONE: 'clone',
  RECTANGLE: 'rect',
  ELLIPSE: 'ellipse',
};

/**
 * Build a safe variable name from a node name, with a counter for uniqueness.
 * @param {string} type     - node type
 * @param {string} name     - node name
 * @param {Map} counters    - shared counter map
 * @returns {string}
 */
function safeNodeVar(type, name, counters) {
  const prefix = TYPE_PREFIX[type] || 'node';
  const slug = (name || 'unnamed')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  const base = prefix + '_' + slug;
  const count = (counters.get(base) || 0) + 1;
  counters.set(base, count);
  return count === 1 ? base : base + '_' + count;
}

/**
 * Build a safe variable name for an import (variable, component, style).
 * @param {object} entry   - resolved import entry with kind, ref, name
 * @param {Map} seen       - dedup map: key → varName
 * @returns {string}
 */
function importVarName(entry, seen) {
  if (seen.has(entry.key)) return seen.get(entry.key);
  const prefix = entry.kind === 'variable' ? 'var'
    : entry.kind === 'textStyle' ? 'style'
    : entry.kind === 'effectStyle' ? 'effect'
    : entry.kind === 'component' || entry.kind === 'icon' || entry.kind === 'logo' ? 'comp'
    : 'imp';
  const slug = (entry.ref || entry.name || entry.key)
    .replace(/^\$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  const name = prefix + '_' + slug;
  seen.set(entry.key, name);
  return name;
}

// ---------------------------------------------------------------------------
// IMPORT CODE GENERATION
// ---------------------------------------------------------------------------

/**
 * Generate import statements for variables, components, and styles.
 * @param {{ variables?: object[], components?: object[], textStyles?: object[] }} imports
 * @param {Map} importNames - shared map: key → varName (mutated)
 * @param {string|null} bridgePrefix - if set, prefix assignments with this (e.g. "globalThis.__bridge.")
 * @returns {string}
 */
function emitImports(imports, importNames, bridgePrefix) {
  const lines = [];
  const bp = bridgePrefix || '';

  const vars = imports.variables || [];
  const comps = imports.components || [];
  const styles = imports.textStyles || [];

  for (const v of vars) {
    const vn = importVarName(v, importNames);
    lines.push(bp + 'var ' + vn + ' = await figma.variables.importVariableByKeyAsync(' +
      JSON.stringify(v.key) + ');');
  }

  for (const c of comps) {
    const vn = importVarName(c, importNames);
    const method = c.importMethod || 'importComponentByKeyAsync';
    lines.push(bp + 'var ' + vn + ' = await figma.' + method + '(' +
      JSON.stringify(c.key) + ');');
  }

  for (const s of styles) {
    const vn = importVarName(s, importNames);
    const method = s.importMethod || 'importStyleByKeyAsync';
    lines.push(bp + 'var ' + vn + ' = await figma.' + method + '(' +
      JSON.stringify(s.key) + ');');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// RESOLVED TOKEN HELPERS
// ---------------------------------------------------------------------------

/**
 * Get the import variable name for a resolved token object.
 * A resolved token has { ref, key, name, kind, importMethod }.
 * @param {object|string} token
 * @param {Map} importNames
 * @returns {string|null}
 */
function tokenVar(token, importNames) {
  if (!token || typeof token !== 'object' || !token.key) return null;
  return importNames.get(token.key) || null;
}

// ---------------------------------------------------------------------------
// NODE CODE EMITTERS
// ---------------------------------------------------------------------------

/**
 * Emit code for a FRAME node.
 * @param {object} node
 * @param {string} parentVar
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitFrame(node, parentVar, varName, importNames, lines) {
  lines.push('var ' + varName + ' = figma.createFrame();');
  lines.push(varName + '.name = ' + JSON.stringify(node.name || 'Frame') + ';');

  // Layout mode
  if (node.layout && node.layout !== 'NONE') {
    lines.push(varName + '.layoutMode = ' + JSON.stringify(node.layout) + ';');
  }

  // Rule 4: resize() FIRST, then sizing modes
  if (node.width != null || node.height != null) {
    const w = node.width != null ? node.width : 100;
    const h = node.height != null ? node.height : 100;
    lines.push(varName + '.resize(' + w + ', ' + h + ');');
  }

  // Sizing modes (after resize — Rule 4)
  if (node.primaryAxisSizing) {
    lines.push(varName + '.primaryAxisSizingMode = ' +
      JSON.stringify(node.primaryAxisSizing) + ';');
  }
  if (node.counterAxisSizing) {
    lines.push(varName + '.counterAxisSizingMode = ' +
      JSON.stringify(node.counterAxisSizing) + ';');
  }

  // Alignment (Rule 5)
  if (node.primaryAxisAlign) {
    lines.push(varName + '.primaryAxisAlignItems = ' +
      JSON.stringify(node.primaryAxisAlign) + ';');
  }
  if (node.counterAxisAlign) {
    lines.push(varName + '.counterAxisAlignItems = ' +
      JSON.stringify(node.counterAxisAlign) + ';');
  }

  // Gap — Rule 6: bind via variable
  if (node.gap) {
    const gapVar = tokenVar(node.gap, importNames);
    if (gapVar) {
      lines.push(varName + '.setBoundVariable(\'itemSpacing\', ' + gapVar + ');');
    }
  }

  // Padding — Rule 6
  emitPadding(node, varName, importNames, lines);

  // Radius — Rule 6
  emitRadius(node, varName, importNames, lines);

  // Fill — Rule 7
  if (node.fill) {
    const fillVar = tokenVar(node.fill, importNames);
    if (fillVar) {
      lines.push(varName + '.fills = mf(' + fillVar + ');');
    }
  }

  // Stroke — Rule 13
  emitStroke(node, varName, importNames, lines);

  // Effects
  if (node.effectStyle) {
    const effVar = tokenVar(node.effectStyle, importNames);
    if (effVar) {
      lines.push('await ' + varName + '.setEffectStyleIdAsync(' + effVar + '.id);');
    }
  }

  // Clip
  if (node.clip != null) {
    lines.push(varName + '.clipsContent = ' + (node.clip ? 'true' : 'false') + ';');
  }

  // Visibility & opacity
  emitVisibility(node, varName, lines);

  // Rule 1: appendChild FIRST, then FILL sizing
  lines.push(parentVar + '.appendChild(' + varName + ');');
  emitFillSizing(node, varName, lines);

  // Rule 2: absolute positioning AFTER appendChild
  emitAbsolute(node, varName, lines);
}

/**
 * Emit code for a TEXT node.
 * @param {object} node
 * @param {string} parentVar
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitText(node, parentVar, varName, importNames, lines) {
  lines.push('var ' + varName + ' = figma.createText();');
  lines.push(varName + '.name = ' + JSON.stringify(node.name || 'Text') + ';');

  // Rule 12: characters FIRST
  lines.push(varName + '.characters = ' + JSON.stringify(node.characters || '') + ';');

  // Rule 8: text style via setTextStyleIdAsync (Rule 21: async version)
  if (node.textStyle) {
    const styleVar = tokenVar(node.textStyle, importNames);
    if (styleVar) {
      lines.push('await ' + varName + '.setTextStyleIdAsync(' + styleVar + '.id);');
    }
  }

  // Fill color override — Rule 7
  if (node.fill) {
    const fillVar = tokenVar(node.fill, importNames);
    if (fillVar) {
      lines.push(varName + '.fills = mf(' + fillVar + ');');
    }
  }

  // Visibility & opacity
  emitVisibility(node, varName, lines);

  // Rule 1 + Rule 12: append → FILL → textAutoResize LAST
  lines.push(parentVar + '.appendChild(' + varName + ');');
  emitFillSizing(node, varName, lines);

  // Rule 12: textAutoResize AFTER append and FILL
  const autoResize = node.autoResize || 'HEIGHT';
  lines.push(varName + '.textAutoResize = ' + JSON.stringify(autoResize) + ';');

  // Truncation
  if (node.maxLines != null) {
    lines.push(varName + '.maxLines = ' + node.maxLines + ';');
    lines.push(varName + '.textTruncation = "ENDING";');
  }

  // Rule 2: absolute positioning
  emitAbsolute(node, varName, lines);
}

/**
 * Emit code for an INSTANCE node.
 * @param {object} node
 * @param {string} parentVar
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitInstance(node, parentVar, varName, importNames, lines) {
  const comp = node._resolvedComponent;
  if (!comp) {
    lines.push('// WARN: unresolved component "' + (node.component || '?') + '"');
    return;
  }

  const compVar = importNames.get(comp.key);
  if (!compVar) {
    lines.push('// WARN: no import found for component "' + comp.name + '"');
    return;
  }

  // Rule 11: correct import API (handled in import section)
  // Now create instance — depends on component type
  if (comp.type === 'COMPONENT_SET' || comp.importMethod === 'importComponentSetByKeyAsync') {
    // Rule 25: form component filled state detection
    const wantFilled = node.variant && node.variant.state === 'filled';
    // Build variant find expression
    if (node.variant && Object.keys(node.variant).length > 0) {
      const variantParts = Object.keys(node.variant).map(function (k) {
        return k + '=' + node.variant[k];
      });
      const findExpr = variantParts.join(', ');
      lines.push('var target_' + varName + ' = ' + compVar +
        '.findChild(function(n) { return n.name === ' +
        JSON.stringify(findExpr) + '; });');
      lines.push('var ' + varName + ' = (target_' + varName + ' || ' +
        compVar + '.defaultVariant).createInstance();');
    } else {
      lines.push('var ' + varName + ' = ' + compVar + '.defaultVariant.createInstance();');
    }
  } else {
    // Simple COMPONENT — direct createInstance
    lines.push('var ' + varName + ' = ' + compVar + '.createInstance();');
  }

  lines.push(varName + '.name = ' + JSON.stringify(node.name || 'Instance') + ';');

  // Visibility & opacity
  emitVisibility(node, varName, lines);

  // Rule 1: appendChild FIRST, then FILL sizing
  lines.push(parentVar + '.appendChild(' + varName + ');');
  emitFillSizing(node, varName, lines);

  // Rule 2: absolute positioning
  emitAbsolute(node, varName, lines);

  // Rule 9/10: property overrides via findPropKey
  if (node.properties && Object.keys(node.properties).length > 0) {
    const compSetVar = (comp.type === 'COMPONENT_SET' || comp.importMethod === 'importComponentSetByKeyAsync')
      ? compVar : null;
    emitPropertyOverrides(node.properties, varName, compSetVar, lines);
  }

  // Rule 9d: instance swaps
  if (node._resolvedSwaps) {
    emitInstanceSwaps(node._resolvedSwaps, varName, importNames, lines);
  }
}

/**
 * Emit code for a CLONE node.
 * @param {object} node
 * @param {string} parentVar
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 * @param {Map} localRefs - map of local ref IDs → variable names
 */
function emitClone(node, parentVar, varName, importNames, lines, localRefs) {
  // Rule 22: clone pattern
  if (node.sourceRef && localRefs.has(node.sourceRef)) {
    // Clone from a local ref
    const srcVar = localRefs.get(node.sourceRef);
    lines.push('var ' + varName + ' = ' + srcVar + '.clone();');
  } else if (node.sourceNodeId) {
    // Clone from Figma node ID
    const srcVar = 'src_' + varName;
    lines.push('var ' + srcVar + ' = await figma.getNodeByIdAsync(' +
      JSON.stringify(node.sourceNodeId) + ');');
    lines.push('var ' + varName + ' = ' + srcVar + '.clone();');
  } else {
    lines.push('// WARN: CLONE node has no source');
    return;
  }

  lines.push(varName + '.name = ' + JSON.stringify(node.name || 'Clone') + ';');

  // Visibility & opacity
  emitVisibility(node, varName, lines);

  // appendChild, then FILL sizing
  lines.push(parentVar + '.appendChild(' + varName + ');');
  emitFillSizing(node, varName, lines);

  // Rule 2: absolute positioning
  emitAbsolute(node, varName, lines);

  // Overrides
  if (node.overrides && node.overrides.length > 0) {
    emitCloneOverrides(node.overrides, varName, importNames, lines);
  }
}

/**
 * Emit code for a RECTANGLE node.
 * @param {object} node
 * @param {string} parentVar
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitRectangle(node, parentVar, varName, importNames, lines) {
  lines.push('var ' + varName + ' = figma.createRectangle();');
  lines.push(varName + '.name = ' + JSON.stringify(node.name || 'Rectangle') + ';');

  // resize
  if (node.width != null || node.height != null) {
    const w = node.width != null ? node.width : 100;
    const h = node.height != null ? node.height : 100;
    lines.push(varName + '.resize(' + w + ', ' + h + ');');
  }

  // Fill — Rule 7
  if (node.fill) {
    const fillVar = tokenVar(node.fill, importNames);
    if (fillVar) {
      lines.push(varName + '.fills = mf(' + fillVar + ');');
    }
  }

  // Radius
  emitRadius(node, varName, importNames, lines);

  // Stroke — Rule 13
  emitStroke(node, varName, importNames, lines);

  // Visibility & opacity
  emitVisibility(node, varName, lines);

  // appendChild, then FILL sizing
  lines.push(parentVar + '.appendChild(' + varName + ');');
  emitFillSizing(node, varName, lines);

  // Rule 2: absolute positioning
  emitAbsolute(node, varName, lines);
}

/**
 * Emit code for an ELLIPSE node.
 * @param {object} node
 * @param {string} parentVar
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitEllipse(node, parentVar, varName, importNames, lines) {
  lines.push('var ' + varName + ' = figma.createEllipse();');
  lines.push(varName + '.name = ' + JSON.stringify(node.name || 'Ellipse') + ';');

  // resize
  if (node.width != null || node.height != null) {
    const w = node.width != null ? node.width : 100;
    const h = node.height != null ? node.height : 100;
    lines.push(varName + '.resize(' + w + ', ' + h + ');');
  }

  // Fill — Rule 7
  if (node.fill) {
    const fillVar = tokenVar(node.fill, importNames);
    if (fillVar) {
      lines.push(varName + '.fills = mf(' + fillVar + ');');
    }
  }

  // Stroke — Rule 13
  emitStroke(node, varName, importNames, lines);

  // Visibility & opacity
  emitVisibility(node, varName, lines);

  // appendChild, then FILL sizing
  lines.push(parentVar + '.appendChild(' + varName + ');');
  emitFillSizing(node, varName, lines);

  // Rule 2: absolute positioning
  emitAbsolute(node, varName, lines);
}

// ---------------------------------------------------------------------------
// SHARED EMITTERS
// ---------------------------------------------------------------------------

/**
 * Emit FILL sizing (Rule 1: AFTER appendChild).
 * @param {object} node
 * @param {string} varName
 * @param {string[]} lines
 */
function emitFillSizing(node, varName, lines) {
  if (node.fillH) {
    lines.push(varName + '.layoutSizingHorizontal = "FILL";');
  }
  if (node.fillV) {
    lines.push(varName + '.layoutSizingVertical = "FILL";');
  }
}

/**
 * Emit absolute positioning (Rule 2: AFTER appendChild).
 * @param {object} node
 * @param {string} varName
 * @param {string[]} lines
 */
function emitAbsolute(node, varName, lines) {
  if (node.absolute) {
    lines.push(varName + '.layoutPositioning = "ABSOLUTE";');
    if (node.absolute.x != null) {
      lines.push(varName + '.x = ' + node.absolute.x + ';');
    }
    if (node.absolute.y != null) {
      lines.push(varName + '.y = ' + node.absolute.y + ';');
    }
  }
}

/**
 * Emit visibility and opacity properties.
 * @param {object} node
 * @param {string} varName
 * @param {string[]} lines
 */
function emitVisibility(node, varName, lines) {
  if (node.visible === false) {
    lines.push(varName + '.visible = false;');
  }
  if (node.opacity != null && node.opacity !== 1) {
    lines.push(varName + '.opacity = ' + node.opacity + ';');
  }
}

/**
 * Emit padding bindings (Rule 6).
 * Supports both individual paddingTop/Right/Bottom/Left and shorthand padding.
 * @param {object} node
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitPadding(node, varName, importNames, lines) {
  // Shorthand: padding → all four sides
  if (node.padding) {
    const pVar = tokenVar(node.padding, importNames);
    if (pVar) {
      lines.push('bindPadding(' + varName + ', ' +
        pVar + ', ' + pVar + ', ' + pVar + ', ' + pVar + ');');
      return;
    }
  }

  // Individual sides
  const top = node.paddingTop ? tokenVar(node.paddingTop, importNames) : null;
  const right = node.paddingRight ? tokenVar(node.paddingRight, importNames) : null;
  const bottom = node.paddingBottom ? tokenVar(node.paddingBottom, importNames) : null;
  const left = node.paddingLeft ? tokenVar(node.paddingLeft, importNames) : null;

  if (top || right || bottom || left) {
    lines.push('bindPadding(' + varName + ', ' +
      (top || 'null') + ', ' +
      (right || 'null') + ', ' +
      (bottom || 'null') + ', ' +
      (left || 'null') + ');');
  }
}

/**
 * Emit radius bindings (Rule 6).
 * Supports both uniform radius and individual corners.
 * @param {object} node
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitRadius(node, varName, importNames, lines) {
  // Uniform radius
  if (node.radius) {
    const rVar = tokenVar(node.radius, importNames);
    if (rVar) {
      lines.push('bindRadius(' + varName + ', ' + rVar + ');');
      return;
    }
  }

  // Individual corners
  const tl = node.radiusTopLeft ? tokenVar(node.radiusTopLeft, importNames) : null;
  const tr = node.radiusTopRight ? tokenVar(node.radiusTopRight, importNames) : null;
  const bl = node.radiusBottomLeft ? tokenVar(node.radiusBottomLeft, importNames) : null;
  const br = node.radiusBottomRight ? tokenVar(node.radiusBottomRight, importNames) : null;

  if (tl) lines.push(varName + '.setBoundVariable("topLeftRadius", ' + tl + ');');
  if (tr) lines.push(varName + '.setBoundVariable("topRightRadius", ' + tr + ');');
  if (bl) lines.push(varName + '.setBoundVariable("bottomLeftRadius", ' + bl + ');');
  if (br) lines.push(varName + '.setBoundVariable("bottomRightRadius", ' + br + ');');
}

/**
 * Emit stroke properties (Rule 13).
 * @param {object} node
 * @param {string} varName
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitStroke(node, varName, importNames, lines) {
  if (!node.stroke) return;

  const strokeVar = tokenVar(node.stroke, importNames);
  if (!strokeVar) return;

  lines.push(varName + '.strokes = mf(' + strokeVar + ');');
  lines.push(varName + '.strokeWeight = ' + (node.strokeWeight || 1) + ';');
  lines.push(varName + '.strokeAlign = ' +
    JSON.stringify(node.strokeAlign || 'INSIDE') + ';');
}

/**
 * Emit property overrides using findPropKey (Rule 9/10).
 * @param {object} properties  - { label: "Submit", hasIcon: true }
 * @param {string} instVar
 * @param {string|null} compSetVar - variable name of the component set (for defs lookup)
 * @param {string[]} lines
 */
function emitPropertyOverrides(properties, instVar, compSetVar, lines) {
  const keys = Object.keys(properties);
  if (!keys.length) return;

  // If we have a comp set var, use findPropKey for each property
  if (compSetVar) {
    for (const propName of keys) {
      const value = properties[propName];
      const propType = typeof value === 'boolean' ? 'BOOLEAN' : 'TEXT';
      const valStr = typeof value === 'boolean' ? String(value) : JSON.stringify(value);
      const keyVar = 'k_' + propName.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push('var ' + keyVar + ' = findPropKey(' + compSetVar + ', ' +
        JSON.stringify(propName) + ', ' + JSON.stringify(propType) + ');');
      lines.push('if (' + keyVar + ') ' + instVar + '.setProperties({ [' + keyVar + ']: ' + valStr + ' });');
    }
  } else {
    // Simple COMPONENT — set properties directly with prefix matching
    const propsObj = {};
    for (const propName of keys) {
      propsObj[propName] = properties[propName];
    }
    lines.push(instVar + '.setProperties(' + JSON.stringify(propsObj) + ');');
  }
}

/**
 * Emit instance swaps (Rule 9d).
 * @param {object} resolvedSwaps  - { slotName: { key, importMethod, ... } }
 * @param {string} instVar
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitInstanceSwaps(resolvedSwaps, instVar, importNames, lines) {
  const keys = Object.keys(resolvedSwaps);
  for (const slotName of keys) {
    const swap = resolvedSwaps[slotName];
    const swapCompVar = importNames.get(swap.key);
    if (!swapCompVar) continue;

    const slotKeyVar = 'sk_' + slotName.replace(/[^a-zA-Z0-9]/g, '_');
    lines.push('var ' + slotKeyVar + ' = findPropKey(' + instVar +
      ', ' + JSON.stringify(slotName) + ', "INSTANCE_SWAP");');
    lines.push('if (' + slotKeyVar + ') ' + instVar + '.setProperties({ [' +
      slotKeyVar + ']: ' + swapCompVar + '.id });');
  }
}

/**
 * Emit clone overrides (Rule 22).
 * @param {object[]} overrides
 * @param {string} cloneVar
 * @param {Map} importNames
 * @param {string[]} lines
 */
function emitCloneOverrides(overrides, cloneVar, importNames, lines) {
  for (let i = 0; i < overrides.length; i++) {
    const ov = overrides[i];
    const find = ov.find;
    const set = ov.set;
    if (!find || !set) continue;

    const ovVar = 'ov_' + i + '_' + cloneVar;
    const findParts = ['n.name === ' + JSON.stringify(find.name)];
    if (find.type) {
      findParts.push('n.type === ' + JSON.stringify(find.type));
    }
    lines.push('var ' + ovVar + ' = ' + cloneVar +
      '.findOne(function(n) { return ' + findParts.join(' && ') + '; });');

    const guard = 'if (' + ovVar + ') ';

    if (set.characters != null) {
      lines.push(guard + ovVar + '.characters = ' + JSON.stringify(set.characters) + ';');
    }
    if (set.fill) {
      const fillVar = tokenVar(set.fill, importNames);
      if (fillVar) {
        lines.push(guard + ovVar + '.fills = mf(' + fillVar + ');');
      }
    }
    if (set.visible != null) {
      lines.push(guard + ovVar + '.visible = ' + (set.visible ? 'true' : 'false') + ';');
    }
    if (set.properties) {
      const propStr = JSON.stringify(set.properties);
      lines.push(guard + ovVar + '.setProperties(' + propStr + ');');
    }
  }
}

// ---------------------------------------------------------------------------
// TREE WALKER
// ---------------------------------------------------------------------------

/**
 * Walk nodes depth-first, emitting code for each node.
 * @param {object[]} nodes
 * @param {string} parentVar
 * @param {Map} importNames
 * @param {Map} counters
 * @param {Map} localRefs
 * @param {string[]} lines
 */
function walkAndEmit(nodes, parentVar, importNames, counters, localRefs, lines) {
  if (!Array.isArray(nodes)) return;

  for (const node of nodes) {
    if (!node || !node.type) continue;

    const varName = safeNodeVar(node.type, node.name, counters);

    // Register local ref if node has an id
    if (node.id) {
      localRefs.set(node.id, varName);
    }

    switch (node.type) {
      case 'FRAME':
        emitFrame(node, parentVar, varName, importNames, lines);
        // Recurse into children
        if (node.children && node.children.length > 0) {
          walkAndEmit(node.children, varName, importNames, counters, localRefs, lines);
        }
        break;

      case 'TEXT':
        emitText(node, parentVar, varName, importNames, lines);
        break;

      case 'INSTANCE':
        emitInstance(node, parentVar, varName, importNames, lines);
        // Rule 14: no children on instances
        break;

      case 'CLONE':
        emitClone(node, parentVar, varName, importNames, lines, localRefs);
        break;

      case 'RECTANGLE':
        emitRectangle(node, parentVar, varName, importNames, lines);
        break;

      case 'ELLIPSE':
        emitEllipse(node, parentVar, varName, importNames, lines);
        break;

      default:
        lines.push('// WARN: unknown node type "' + node.type + '"');
        break;
    }

    lines.push(''); // blank line between nodes
  }
}

// ---------------------------------------------------------------------------
// PRELOAD CHUNK EMITTER
// ---------------------------------------------------------------------------

/**
 * Generate code for a preload chunk (chunk 0 in multi-chunk mode).
 * Emits imports stored on globalThis.__bridge and creates the root frame.
 * @param {object} chunk
 * @param {object} context
 * @returns {string}
 */
function emitPreloadChunk(chunk, context) {
  const lines = [];
  const importNames = new Map();

  lines.push('// ── PRELOAD ──');
  lines.push('globalThis.__bridge = {};');
  lines.push('');

  // Emit imports
  const importCode = emitImports(chunk.imports, importNames, '');
  if (importCode) {
    lines.push('// ── IMPORTS ──');
    lines.push(importCode);
    lines.push('');
  }

  // Store all imports on globalThis
  lines.push('// ── STORE ON BRIDGE ──');
  importNames.forEach(function (varName) {
    lines.push('globalThis.__bridge.' + varName + ' = ' + varName + ';');
  });
  lines.push('');

  // Create root frame (Rule 19)
  const rootName = context.rootName || 'Root';
  const rootWidth = context.rootWidth || 1440;
  const rootHeight = context.rootHeight || 900;

  lines.push('// ── ROOT FRAME ──');
  lines.push('var root = figma.createFrame();');
  lines.push('root.name = ' + JSON.stringify(rootName) + ';');
  lines.push('root.resize(' + rootWidth + ', ' + rootHeight + ');');
  lines.push('root.layoutMode = "VERTICAL";');
  lines.push('root.primaryAxisSizingMode = "AUTO";');
  lines.push('root.counterAxisSizingMode = "FIXED";');
  lines.push('root.x = 0;');
  lines.push('root.y = 0;');
  lines.push('figma.currentPage.appendChild(root);');
  lines.push('globalThis.__bridge.root = root;');

  return lines.join('\n');
}

/**
 * Generate code for a build chunk in multi-chunk mode.
 * Reads imports from globalThis.__bridge and generates node creation code.
 * @param {object} chunk
 * @param {object} context
 * @returns {string}
 */
function emitBuildChunk(chunk, context) {
  const lines = [];
  const importNames = new Map();
  const counters = new Map();
  const localRefs = new Map();

  lines.push('// ── BUILD CHUNK ' + chunk.index + ' ──');
  lines.push('var b = globalThis.__bridge;');
  lines.push('var root = b.root;');
  lines.push('');

  // Restore import variable names from bridge
  // We need to reconstruct the import map from bridgeImports and the
  // preload chunk's imports. Since we don't have the preload's importNames,
  // we rebuild them from context.allImports.
  if (context.allImports) {
    const allImps = context.allImports;
    const vars = allImps.variables || [];
    const comps = allImps.components || [];
    const styles = allImps.textStyles || [];

    for (const v of vars) {
      const vn = importVarName(v, importNames);
      lines.push('var ' + vn + ' = b.' + vn + ';');
    }
    for (const c of comps) {
      const vn = importVarName(c, importNames);
      lines.push('var ' + vn + ' = b.' + vn + ';');
    }
    for (const s of styles) {
      const vn = importVarName(s, importNames);
      lines.push('var ' + vn + ' = b.' + vn + ';');
    }
    lines.push('');
  }

  // Walk nodes and emit creation code
  lines.push('// ── NODES ──');
  walkAndEmit(chunk.nodes, 'root', importNames, counters, localRefs, lines);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// SINGLE CHUNK EMITTER
// ---------------------------------------------------------------------------

/**
 * Generate code for a single-chunk plan (most common case).
 * Includes imports, root frame creation, and all node creation in one script.
 * @param {object} chunk
 * @param {object} context
 * @returns {string}
 */
function emitSingleChunk(chunk, context) {
  const lines = [];
  const importNames = new Map();
  const counters = new Map();
  const localRefs = new Map();

  // Imports
  const importCode = emitImports(chunk.imports, importNames, '');
  if (importCode) {
    lines.push('// ── IMPORTS ──');
    lines.push(importCode);
    lines.push('');
  }

  // Root frame creation (Rule 19)
  const rootName = context.rootName || 'Root';
  const rootWidth = context.rootWidth || 1440;
  const rootHeight = context.rootHeight || 900;

  lines.push('// ── ROOT ──');
  lines.push('var root = figma.createFrame();');
  lines.push('root.name = ' + JSON.stringify(rootName) + ';');
  lines.push('root.resize(' + rootWidth + ', ' + rootHeight + ');');
  lines.push('root.layoutMode = "VERTICAL";');
  lines.push('root.primaryAxisSizingMode = "AUTO";');
  lines.push('root.counterAxisSizingMode = "FIXED";');
  lines.push('root.x = 0;');
  lines.push('root.y = 0;');
  lines.push('figma.currentPage.appendChild(root);');
  lines.push('');

  // Walk nodes depth-first
  lines.push('// ── BUILD ──');
  walkAndEmit(chunk.nodes, 'root', importNames, counters, localRefs, lines);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Generate Figma Plugin API JavaScript code from a resolved chunk.
 *
 * @param {object} chunk - From plan.js: { index, label, imports, nodes, bridgeExports, bridgeImports }
 * @param {object} context - { transport, isMultiChunk, rootName, rootWidth, rootHeight, allImports }
 * @returns {string} Generated JavaScript code (before wrapping)
 */
function generateCode(chunk, context) {
  const ctx = context || {};

  // Multi-chunk: preload chunk
  if (ctx.isMultiChunk && chunk.label === 'preload') {
    return emitPreloadChunk(chunk, ctx);
  }

  // Multi-chunk: build chunk
  if (ctx.isMultiChunk && chunk.label !== 'preload') {
    return emitBuildChunk(chunk, ctx);
  }

  // Single chunk (the common path)
  return emitSingleChunk(chunk, ctx);
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  generateCode,
  // Exported for testing
  safeNodeVar,
  importVarName,
  refToVarName,
  emitImports,
  tokenVar,
};
