// ---------------------------------------------------------------------------
// validate.js — Stage 3: Structural validation (post-resolution)
// ---------------------------------------------------------------------------

const { CompilerError } = require('./errors');

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Recursively walk nodes, passing parent and JSON path to the callback.
 * @param {object[]} nodes    - Array of scene nodes
 * @param {function} callback - (node, parent, path) => void
 * @param {object|null} parent
 * @param {string} path       - JSON path prefix
 */
function walkWithParent(nodes, callback, parent, path) {
  if (!nodes || !nodes.length) return;
  for (const [i, node] of nodes.entries()) {
    const nodePath = path + '[' + i + ']';
    callback(node, parent, nodePath);
    if (node.children) {
      walkWithParent(node.children, callback, node, nodePath + '.children');
    }
  }
}

/**
 * Check if a component name suggests a form input.
 * Matches names containing "Input" or "Select" (case-insensitive).
 * @param {string} name
 * @returns {boolean}
 */
function isFormComponent(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes('input') || lower.includes('select');
}

/**
 * Heuristic: does a properties object contain values that look like real data
 * rather than generic placeholders?
 * A value is considered "real" if:
 *   - It is a string longer than 3 characters
 *   - It is NOT one of the common placeholder words
 * @param {object} properties
 * @returns {boolean}
 */
function hasRealValues(properties) {
  if (!properties) return false;
  const placeholders = [
    'label', 'placeholder', 'text', 'value', 'title',
    'hint', 'helper', 'description', 'name', 'input',
  ];
  const entries = Object.entries(properties);
  for (const [, val] of entries) {
    if (typeof val !== 'string') continue;
    if (val.length <= 3) continue;
    if (placeholders.indexOf(val.toLowerCase()) !== -1) continue;
    return true;
  }
  return false;
}

/**
 * Collect all node IDs in the graph for orphan-clone detection.
 * @param {object[]} nodes
 * @param {Set<string>} ids
 */
function collectIds(nodes, ids) {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.id) ids.add(node.id);
    if (node.children) collectIds(node.children, ids);
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

/**
 * Validate a resolved scene graph for structural correctness.
 *
 * @param {object}   graph    - Resolved scene graph ({ version, metadata, fonts, nodes })
 * @param {object}   registry - Registry object from loadRegistry()
 * @returns {{ valid: boolean, errors: CompilerError[], warnings: CompilerError[] }}
 */
function validate(graph, registry) {
  const errors = [];
  const warnings = [];
  const nodes = graph.nodes || [];

  // Pre-compute set of all local IDs for orphan-clone check
  const allIds = new Set();
  collectIds(nodes, allIds);

  // Component name set (lowercase) for Rule 18
  const componentNames = (registry && registry.components && registry.components.byName)
    ? registry.components.byName
    : new Map();

  walkWithParent(nodes, function (node, parent, path) {

    // ------------------------------------------------------------------
    // Rule 3 — FILL child inside AUTO-sized parent
    // ------------------------------------------------------------------
    if (parent && (node.fillH || node.fillV)) {
      const layout = parent.layout || 'NONE';

      if (layout === 'VERTICAL') {
        // primary axis = vertical, counter axis = horizontal
        if (node.fillV && parent.primaryAxisSizing === 'AUTO') {
          errors.push(new CompilerError('VALIDATE_FILL_IN_AUTO_PARENT', {
            message: 'fillV child inside VERTICAL parent with primaryAxisSizing AUTO collapses to 0px',
            node: node.name,
            path: path + '.fillV',
          }));
        }
        if (node.fillH && parent.counterAxisSizing === 'AUTO') {
          errors.push(new CompilerError('VALIDATE_FILL_IN_AUTO_PARENT', {
            message: 'fillH child inside VERTICAL parent with counterAxisSizing AUTO collapses to 0px',
            node: node.name,
            path: path + '.fillH',
          }));
        }
      }

      if (layout === 'HORIZONTAL') {
        // primary axis = horizontal, counter axis = vertical
        if (node.fillH && parent.primaryAxisSizing === 'AUTO') {
          errors.push(new CompilerError('VALIDATE_FILL_IN_AUTO_PARENT', {
            message: 'fillH child inside HORIZONTAL parent with primaryAxisSizing AUTO collapses to 0px',
            node: node.name,
            path: path + '.fillH',
          }));
        }
        if (node.fillV && parent.counterAxisSizing === 'AUTO') {
          errors.push(new CompilerError('VALIDATE_FILL_IN_AUTO_PARENT', {
            message: 'fillV child inside HORIZONTAL parent with counterAxisSizing AUTO collapses to 0px',
            node: node.name,
            path: path + '.fillV',
          }));
        }
      }
    }

    // ------------------------------------------------------------------
    // Rule 14 — INSTANCE with children
    // ------------------------------------------------------------------
    if (node.type === 'INSTANCE' && node.children && node.children.length > 0) {
      errors.push(new CompilerError('VALIDATE_INSTANCE_HAS_CHILDREN', {
        node: node.name,
        path: path + '.children',
      }));
    }

    // ------------------------------------------------------------------
    // Rule 18 — Raw shape matching DS component
    // ------------------------------------------------------------------
    if ((node.type === 'RECTANGLE' || node.type === 'ELLIPSE') && node.name) {
      const lower = node.name.toLowerCase();
      if (componentNames.has(lower)) {
        const match = componentNames.get(lower);
        warnings.push(new CompilerError('VALIDATE_RAW_SHAPE_HAS_DS_MATCH', {
          message: 'Raw ' + node.type + ' "' + node.name + '" matches DS component "' + match.name + '" — consider using INSTANCE instead',
          node: node.name,
          path: path,
          suggestion: [match.name],
        }));
      }
    }

    // ------------------------------------------------------------------
    // Rule 25 — Form component without filled state
    // ------------------------------------------------------------------
    if (node.type === 'INSTANCE' && isFormComponent(node.component)) {
      const hasFilledState = node.variant && node.variant.state === 'filled';
      if (!hasFilledState && hasRealValues(node.properties)) {
        warnings.push(new CompilerError('VALIDATE_FORM_NO_FILLED_STATE', {
          message: 'Form component "' + (node.component || node.name) + '" has real values but no state:"filled" variant — input will appear empty',
          node: node.name,
          path: path + '.variant',
        }));
      }
    }

    // ------------------------------------------------------------------
    // TEXT without textStyle
    // ------------------------------------------------------------------
    if (node.type === 'TEXT') {
      if (!node.textStyle || typeof node.textStyle === 'string') {
        errors.push(new CompilerError('VALIDATE_TEXT_NO_STYLE', {
          node: node.name,
          path: path + '.textStyle',
        }));
      }
    }

    // ------------------------------------------------------------------
    // Orphan CLONE
    // ------------------------------------------------------------------
    if (node.type === 'CLONE' && node.sourceRef) {
      if (!allIds.has(node.sourceRef)) {
        errors.push(new CompilerError('VALIDATE_ORPHAN_CLONE', {
          message: 'CLONE sourceRef "' + node.sourceRef + '" has no matching node id in the graph',
          node: node.name,
          path: path + '.sourceRef',
        }));
      }
    }

  }, null, 'nodes');

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings,
  };
}

module.exports = { validate };
