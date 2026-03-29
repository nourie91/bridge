const { CompilerError, suggest } = require('./errors');

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const ALIASES = {
  bg: 'background',
  fg: 'foreground',
  xs: 'xsmall',
  sm: 'small',
  md: 'medium',
  lg: 'large',
  xl: 'xlarge',
  xxl: 'xxlarge',
};

const CATEGORY_MAP = {
  spacing: 'variables',
  radius: 'variables',
  color: 'variables',
  text: 'textStyles',
  effect: 'effectStyles',
  comp: 'components',
  icon: 'icons',
  logo: 'logos',
};

const KIND_MAP = {
  variables: 'variable',
  textStyles: 'textStyle',
  effectStyles: 'effectStyle',
  components: 'component',
  icons: 'icon',
  logos: 'logo',
};

const IMPORT_METHOD_MAP = {
  variable: 'importVariableByKeyAsync',
  textStyle: 'importStyleByKeyAsync',
  effectStyle: 'importStyleByKeyAsync',
  component: null, // determined per-entry
  icon: 'importComponentByKeyAsync',
  logo: 'importComponentByKeyAsync',
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Deep clone via JSON round-trip.
 * @param {object} obj
 * @returns {object}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Expand alias segments. E.g. "bg" → "background".
 * @param {string} segment
 * @returns {string}
 */
function expandAlias(segment) {
  return ALIASES[segment] || segment;
}

/**
 * Recursively walk nodes, calling callback(node, path, parentChildren, index).
 * The callback may return replacement arrays for splice operations.
 * @param {object[]} nodes
 * @param {function} callback
 * @param {string} path
 */
function walkNodes(nodes, callback, path) {
  if (!Array.isArray(nodes)) return;
  // Walk backwards so splice mutations don't shift unvisited indices
  Array.from({ length: nodes.length }, function (_, i) { return nodes.length - 1 - i; })
    .forEach(function (idx) {
      const node = nodes[idx];
      if (!node) return;
      const nodePath = path + '[' + idx + ']';
      const replacement = callback(node, nodePath, nodes, idx);
      if (replacement !== undefined) {
        // splice: remove current node, insert replacements
        Array.prototype.splice.apply(nodes, [idx, 1].concat(replacement));
      } else {
        // recurse into children
        if (Array.isArray(node.children)) {
          walkNodes(node.children, callback, nodePath + '.children');
        }
        if (Array.isArray(node.template)) {
          walkNodes(node.template, callback, nodePath + '.template');
        }
        if (Array.isArray(node.else)) {
          walkNodes(node.else, callback, nodePath + '.else');
        }
      }
    });
}

// ---------------------------------------------------------------------------
// TOKEN RESOLUTION
// ---------------------------------------------------------------------------

/**
 * Score a candidate name against search segments.
 * @param {string} candidateName
 * @param {string[]} segments - expanded segments to match
 * @returns {number} 0 | 40 | 80 | 100
 */
function scoreCandidate(candidateName, segments) {
  const lower = candidateName.toLowerCase();
  const expandedFull = segments.map(expandAlias).join('/');
  if (lower === expandedFull) return 100;
  // Check if all expanded segments present
  const allPresent = segments.every(function (seg) {
    const expanded = expandAlias(seg);
    return lower.indexOf(expanded) !== -1 || lower.indexOf(seg) !== -1;
  });
  if (allPresent) return 80;
  // Partial: at least one segment present
  const anyPresent = segments.some(function (seg) {
    const expanded = expandAlias(seg);
    return lower.indexOf(expanded) !== -1 || lower.indexOf(seg) !== -1;
  });
  if (anyPresent) return 40;
  return 0;
}

/**
 * Resolve a single $token reference against the registry.
 * @param {string} ref - e.g. "$spacing/md"
 * @param {object} registry
 * @returns {{ resolved: object|null, error: CompilerError|null }}
 */
function resolveTokenRef(ref, registry) {
  const stripped = ref.replace(/^\$/, '');
  const parts = stripped.split('/');
  const categoryKey = parts[0];
  const registryKey = CATEGORY_MAP[categoryKey];

  if (!registryKey) {
    return {
      resolved: null,
      error: new CompilerError('RESOLVE_TOKEN_NOT_FOUND', {
        message: 'Unknown token category "' + categoryKey + '" in "' + ref + '"',
        path: ref,
      }),
    };
  }

  const kind = KIND_MAP[registryKey];
  const index = registry[registryKey];

  if (!index) {
    return {
      resolved: null,
      error: new CompilerError('RESOLVE_TOKEN_NOT_FOUND', {
        message: 'Registry "' + registryKey + '" is empty or missing for "' + ref + '"',
        path: ref,
      }),
    };
  }

  // For components/icons/logos: use byName with the name portion
  if (registryKey === 'components' || registryKey === 'icons' || registryKey === 'logos') {
    const name = parts.slice(1).join('/');
    const lookupKey = registryKey === 'components' ? name.toLowerCase() : name;
    const entry = index.byName.get(lookupKey);
    if (entry) {
      const importMethod = registryKey === 'components'
        ? (entry.type === 'COMPONENT_SET' ? 'importComponentSetByKeyAsync' : 'importComponentByKeyAsync')
        : IMPORT_METHOD_MAP[kind];
      return {
        resolved: { ref: ref, key: entry.key, name: entry.name, kind: kind, importMethod: importMethod },
        error: null,
      };
    }
    // Not found — build suggestions
    const allNames = Array.from(index.byName.keys());
    const suggestions = suggest(lookupKey, allNames);
    return {
      resolved: null,
      error: new CompilerError('RESOLVE_TOKEN_NOT_FOUND', {
        message: 'Token "' + ref + '" not found in ' + registryKey + ' registry',
        path: ref,
        suggestion: suggestions.length ? suggestions : null,
      }),
    };
  }

  // For variables, textStyles, effectStyles: use byName first, then segment scoring
  // The category prefix (color/, spacing/, text/, effect/) may or may not be part
  // of the actual registry name. Try both with and without the category prefix.
  const nameParts = parts.slice(1); // segments after category
  const searchSegments = parts; // include category for variable scoring
  const expandedName = parts.map(expandAlias).join('/');
  const expandedNameNoCat = nameParts.map(expandAlias).join('/');

  // Try exact match (with category prefix, then without, then original forms)
  const exactCandidates = [expandedName, expandedNameNoCat, stripped, nameParts.join('/')];
  const exactHit = exactCandidates.reduce(function (found, candidate) {
    if (found) return found;
    if (index.byName && index.byName.has(candidate)) return index.byName.get(candidate);
    return null;
  }, null);
  if (exactHit) {
    return {
      resolved: {
        ref: ref,
        key: exactHit.key,
        name: exactHit.name,
        kind: kind,
        importMethod: IMPORT_METHOD_MAP[kind],
      },
      error: null,
    };
  }

  // Score all candidates — try both with and without category prefix
  const bestMatch = { entry: null, score: 0 };
  if (index.byName) {
    index.byName.forEach(function (entry, name) {
      const s1 = scoreCandidate(name, searchSegments);
      const s2 = scoreCandidate(name, nameParts);
      const score = Math.max(s1, s2);
      if (score > bestMatch.score) {
        bestMatch.entry = entry;
        bestMatch.score = score;
      }
    });
  }

  if (bestMatch.score > 40) {
    const entry = bestMatch.entry;
    return {
      resolved: {
        ref: ref,
        key: entry.key,
        name: entry.name,
        kind: kind,
        importMethod: IMPORT_METHOD_MAP[kind],
      },
      error: null,
    };
  }

  // Not found — build suggestions
  const allNames = index.byName ? Array.from(index.byName.keys()) : [];
  const suggestions = suggest(stripped, allNames);
  return {
    resolved: null,
    error: new CompilerError('RESOLVE_TOKEN_NOT_FOUND', {
      message: 'Token "' + ref + '" not found in ' + registryKey + ' registry',
      path: ref,
      suggestion: suggestions.length ? suggestions : null,
    }),
  };
}

// ---------------------------------------------------------------------------
// COMPONENT RESOLUTION
// ---------------------------------------------------------------------------

/**
 * Resolve a component name to a registry entry.
 * @param {string} name
 * @param {object} registry
 * @returns {{ resolved: object|null, error: CompilerError|null }}
 */
function resolveComponent(name, registry) {
  const lower = name.toLowerCase();

  // Check components first
  if (registry.components && registry.components.byName.has(lower)) {
    const entry = registry.components.byName.get(lower);
    const importMethod = entry.type === 'COMPONENT_SET'
      ? 'importComponentSetByKeyAsync'
      : 'importComponentByKeyAsync';
    return {
      resolved: {
        ref: name,
        key: entry.key,
        name: entry.name,
        kind: 'component',
        type: entry.type,
        properties: entry.properties,
        importMethod: importMethod,
      },
      error: null,
    };
  }

  // Check icons
  if (registry.icons && registry.icons.byName.has(name)) {
    const entry = registry.icons.byName.get(name);
    return {
      resolved: {
        ref: name,
        key: entry.key,
        name: entry.name,
        kind: 'icon',
        type: entry.type || 'COMPONENT',
        properties: {},
        importMethod: 'importComponentByKeyAsync',
      },
      error: null,
    };
  }

  // Check logos
  if (registry.logos && registry.logos.byName.has(name)) {
    const entry = registry.logos.byName.get(name);
    return {
      resolved: {
        ref: name,
        key: entry.key,
        name: entry.name,
        kind: 'logo',
        type: entry.type || 'COMPONENT',
        properties: {},
        importMethod: 'importComponentByKeyAsync',
      },
      error: null,
    };
  }

  // Not found — build suggestions from all registries
  const candidates = []
    .concat(registry.allComponentNames || [])
    .concat(registry.allVariableNames || [])
    .concat(registry.icons ? Array.from(registry.icons.byName.keys()) : [])
    .concat(registry.logos ? Array.from(registry.logos.byName.keys()) : []);
  const suggestions = suggest(lower, candidates);

  return {
    resolved: null,
    error: new CompilerError('RESOLVE_COMPONENT_NOT_FOUND', {
      message: 'Component "' + name + '" not found in any registry',
      node: name,
      suggestion: suggestions.length ? suggestions : null,
    }),
  };
}

// ---------------------------------------------------------------------------
// VARIANT VALIDATION
// ---------------------------------------------------------------------------

/**
 * Validate variant keys against component properties.
 * @param {object} variantMap - e.g. { "size": "large" }
 * @param {object} componentEntry - resolved component with properties
 * @param {string} nodeName
 * @param {string} nodePath
 * @returns {CompilerError[]}
 */
function validateVariants(variantMap, componentEntry, nodeName, nodePath) {
  const errors = [];
  const props = componentEntry.properties || {};

  Object.keys(variantMap).forEach(function (key) {
    // Find matching property (VARIANT type)
    const propKeys = Object.keys(props);
    const matchingProp = propKeys.find(function (pk) {
      return pk.toLowerCase() === key.toLowerCase();
    });

    if (!matchingProp) {
      const suggestions = suggest(key, propKeys);
      errors.push(new CompilerError('RESOLVE_VARIANT_INVALID', {
        message: 'Variant key "' + key + '" does not exist on component "' + componentEntry.name + '"',
        node: nodeName,
        path: nodePath + '.variant.' + key,
        suggestion: suggestions.length ? suggestions : null,
      }));
      return;
    }

    const propDef = props[matchingProp];
    // Check if it's a VARIANT type property (string starts with "VARIANT(")
    if (typeof propDef === 'string' && propDef.indexOf('VARIANT(') === 0) {
      const allowedStr = propDef.slice(8, -1); // strip VARIANT( and )
      const allowed = allowedStr.split(',').map(function (s) { return s.trim(); });
      const value = variantMap[key];
      if (allowed.indexOf(value) === -1) {
        errors.push(new CompilerError('RESOLVE_VARIANT_INVALID', {
          message: 'Variant "' + key + '=' + value + '" is not valid for "' + componentEntry.name +
            '". Allowed: ' + allowed.join(', '),
          node: nodeName,
          path: nodePath + '.variant.' + key,
        }));
      }
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// REPEAT EXPANSION
// ---------------------------------------------------------------------------

/**
 * Replace {{key}} placeholders in all `characters` fields of a cloned tree.
 * @param {object} node
 * @param {object} row - data row for this iteration
 */
function bindPlaceholders(node, row) {
  if (typeof node.characters === 'string') {
    Object.keys(row).forEach(function (key) {
      node.characters = node.characters.split('{{' + key + '}}').join(row[key]);
    });
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(function (child) { bindPlaceholders(child, row); });
  }
  if (Array.isArray(node.template)) {
    node.template.forEach(function (child) { bindPlaceholders(child, row); });
  }
}

/**
 * Expand a REPEAT node into cloned children.
 * @param {object} node - REPEAT node
 * @returns {object[]} expanded children
 */
function expandRepeat(node) {
  const data = node.data;
  const count = data ? data.length : (node.count || 0);
  const template = node.template || [];
  const result = [];

  Array.from({ length: count }, function (_, i) {
    template.forEach(function (tmpl) {
      const cloned = deepClone(tmpl);
      if (data && data[i]) {
        bindPlaceholders(cloned, data[i]);
      }
      result.push(cloned);
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// CONDITIONAL EVALUATION
// ---------------------------------------------------------------------------

/**
 * Evaluate a simple `when` expression.
 * Supports: boolean names ("showHeader"), equality ("variant == 'premium'"),
 * inequality ("plan != 'free'").
 * @param {string} expr
 * @returns {boolean}
 */
function evaluateWhen(expr) {
  if (!expr || typeof expr !== 'string') return false;
  const trimmed = expr.trim();

  // Equality check: "key == 'value'" or 'key == "value"'
  const eqMatch = trimmed.match(/^(\w+)\s*==\s*['"](.+?)['"]$/);
  if (eqMatch) {
    // In a static context without runtime bindings, equality expressions
    // are truthy (they describe a design condition that was chosen)
    return true;
  }

  // Inequality check: "key != 'value'"
  const neqMatch = trimmed.match(/^(\w+)\s*!=\s*['"](.+?)['"]$/);
  if (neqMatch) {
    return true;
  }

  // Boolean name: "showHeader" → truthy, "false" → falsy
  if (trimmed === 'false' || trimmed === '0' || trimmed === '') return false;
  return true;
}

// ---------------------------------------------------------------------------
// TOKEN FIELD DETECTION
// ---------------------------------------------------------------------------

const TOKEN_FIELDS = [
  'fill', 'stroke', 'gap', 'radius',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'radiusTopLeft', 'radiusTopRight', 'radiusBottomLeft', 'radiusBottomRight',
  'textStyle', 'effectStyle',
];

/**
 * Check whether a string value is a token reference.
 * @param {string} value
 * @returns {boolean}
 */
function isTokenRef(value) {
  return typeof value === 'string' && value.charAt(0) === '$';
}

// ---------------------------------------------------------------------------
// IMPORT COLLECTOR
// ---------------------------------------------------------------------------

/**
 * Collect unique imports from resolved tokens in the graph.
 * @param {object[]} nodes
 * @returns {{ variables: object[], components: object[], textStyles: object[], fonts: object[] }}
 */
function collectImports(nodes) {
  const seen = new Map();
  const imports = { variables: [], components: [], textStyles: [], fonts: [] };

  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.key && value.kind && !seen.has(value.key)) {
      seen.set(value.key, true);
      if (value.kind === 'variable') {
        imports.variables.push(value);
      } else if (value.kind === 'component' || value.kind === 'icon' || value.kind === 'logo') {
        imports.components.push(value);
      } else if (value.kind === 'textStyle' || value.kind === 'effectStyle') {
        imports.textStyles.push(value);
      }
    }
  }

  function walkForImports(nodeList) {
    if (!Array.isArray(nodeList)) return;
    nodeList.forEach(function (node) {
      if (!node || typeof node !== 'object') return;
      // Check token fields
      TOKEN_FIELDS.forEach(function (field) {
        visit(node[field]);
      });
      // Check resolved component
      if (node._resolvedComponent) {
        visit(node._resolvedComponent);
      }
      // Check resolved swaps
      if (node._resolvedSwaps) {
        Object.keys(node._resolvedSwaps).forEach(function (k) {
          visit(node._resolvedSwaps[k]);
        });
      }
      // Recurse
      if (Array.isArray(node.children)) walkForImports(node.children);
    });
  }

  walkForImports(nodes);
  return imports;
}

// ---------------------------------------------------------------------------
// MAIN: resolve(graph, registry)
// ---------------------------------------------------------------------------

/**
 * Stage 2 of the compilation pipeline.
 * Walks the validated scene graph and resolves all token references,
 * component references, REPEAT expansions, and CONDITIONAL evaluations.
 *
 * @param {object} graph - Parsed scene graph (from Stage 1)
 * @param {object} registry - Loaded registry (from registry.js)
 * @returns {{ graph: object, errors: CompilerError[], warnings: CompilerError[], imports: object }}
 */
function resolve(graph, registry) {
  const resolved = deepClone(graph);
  const errors = [];
  const warnings = [];

  // ── Pass 1: Expand REPEAT and CONDITIONAL nodes ──────────────────────────

  walkNodes(resolved.nodes, function (node, nodePath, parentArr, idx) {
    if (node.type === 'REPEAT') {
      const expanded = expandRepeat(node);
      return expanded;
    }
    if (node.type === 'CONDITIONAL') {
      const truthy = evaluateWhen(node.when);
      if (truthy) {
        return node.children || [];
      }
      return node.else || [];
    }
    return undefined;
  }, 'nodes');

  // ── Pass 2: Resolve token references on all nodes ────────────────────────

  walkNodes(resolved.nodes, function (node, nodePath) {
    const nodeName = node.name || '(unnamed)';

    // Resolve token fields
    TOKEN_FIELDS.forEach(function (field) {
      const value = node[field];
      if (isTokenRef(value)) {
        const result = resolveTokenRef(value, registry);
        if (result.resolved) {
          node[field] = result.resolved;
        } else if (result.error) {
          result.error.node = result.error.node || nodeName;
          result.error.path = result.error.path || nodePath + '.' + field;
          errors.push(result.error);
        }
      }
    });

    // Resolve INSTANCE component references
    if (node.type === 'INSTANCE' && node.component) {
      const compResult = resolveComponent(node.component, registry);
      if (compResult.resolved) {
        node._resolvedComponent = compResult.resolved;

        // Validate variants
        if (node.variant && compResult.resolved.properties) {
          const variantErrors = validateVariants(
            node.variant, compResult.resolved, nodeName, nodePath
          );
          variantErrors.forEach(function (ve) {
            if (ve.severity === 'warning') {
              warnings.push(ve);
            } else {
              errors.push(ve);
            }
          });
        }

        // Resolve swap values as component references
        if (node.swaps) {
          node._resolvedSwaps = {};
          Object.keys(node.swaps).forEach(function (swapKey) {
            const swapName = node.swaps[swapKey];
            const swapResult = resolveComponent(swapName, registry);
            if (swapResult.resolved) {
              node._resolvedSwaps[swapKey] = swapResult.resolved;
            } else if (swapResult.error) {
              swapResult.error.path = nodePath + '.swaps.' + swapKey;
              errors.push(swapResult.error);
            }
          });
        }
      } else if (compResult.error) {
        compResult.error.node = nodeName;
        compResult.error.path = compResult.error.path || nodePath + '.component';
        errors.push(compResult.error);
      }
    }

    return undefined;
  }, 'nodes');

  // ── Pass 3: Collect imports ──────────────────────────────────────────────

  const imports = collectImports(resolved.nodes);

  // Add fonts from the graph metadata
  if (Array.isArray(resolved.fonts)) {
    imports.fonts = resolved.fonts.map(function (f) {
      return { family: f.family, style: f.style };
    });
  }

  return {
    graph: resolved,
    errors: errors,
    warnings: warnings,
    imports: imports,
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  resolve,
  resolveTokenRef,
  resolveComponent,
  deepClone,
  walkNodes,
};
