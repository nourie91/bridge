// ---------------------------------------------------------------------------
// ERROR CODES
// ---------------------------------------------------------------------------

const ERROR_CODES = {
  // Parse phase
  PARSE_INVALID_JSON:          { severity: 'error',   message: 'Input is not valid JSON' },
  PARSE_UNKNOWN_NODE_TYPE:     { severity: 'error',   message: 'Unknown node type' },
  PARSE_MISSING_FIELD:         { severity: 'error',   message: 'Required field is missing' },
  PARSE_RAW_VALUE_NOT_ALLOWED: { severity: 'warning', message: 'Raw value used where a token is expected' },

  // Resolve phase
  RESOLVE_TOKEN_NOT_FOUND:     { severity: 'error',   message: 'Token not found in registry' },
  RESOLVE_COMPONENT_NOT_FOUND: { severity: 'error',   message: 'Component not found in registry' },
  RESOLVE_VARIANT_INVALID:     { severity: 'error',   message: 'Invalid variant combination' },
  RESOLVE_CLONE_REF_MISSING:   { severity: 'error',   message: 'Clone reference node not found' },
  RESOLVE_INVALID_KEY_FORMAT:  { severity: 'error',   message: 'Key format is invalid (expected 40-char hex or VariableID)' },

  // Validate phase
  VALIDATE_FILL_IN_AUTO_PARENT:    { severity: 'warning', message: 'FILL child inside AUTO-sized parent collapses to 0px' },
  VALIDATE_RAW_SHAPE_HAS_DS_MATCH: { severity: 'warning', message: 'Raw shape could be replaced by a DS component' },
  VALIDATE_ORPHAN_CLONE:           { severity: 'warning', message: 'Clone target has no matching node in the spec' },
  VALIDATE_TEXT_NO_STYLE:          { severity: 'warning', message: 'Text node has no text style applied' },
  VALIDATE_INSTANCE_HAS_CHILDREN:  { severity: 'error',   message: 'Cannot add children to a component instance' },
  VALIDATE_FORM_NO_FILLED_STATE:   { severity: 'warning', message: 'Form component has real values but no filled state variant' },

  // Wrap phase
  WRAP_MISSING_FILEKEY:  { severity: 'error',   message: 'fileKey is required for official transport' },
  WRAP_CODE_TOO_LARGE:   { severity: 'error',   message: 'Generated code exceeds 20KB transport limit' },
};

// ---------------------------------------------------------------------------
// CompilerError
// ---------------------------------------------------------------------------

class CompilerError {
  /**
   * @param {string}   code        - Key from ERROR_CODES
   * @param {object}   [opts]
   * @param {string}   [opts.message]    - Override default message
   * @param {string}   [opts.node]       - Node name where error occurred
   * @param {string}   [opts.path]       - JSON path like "nodes[2].children[0].fill"
   * @param {string[]} [opts.suggestion] - Fuzzy-match suggestions
   */
  constructor(code, opts) {
    const def = ERROR_CODES[code];
    const options = opts || {};
    this.code = code;
    this.severity = (def && def.severity) || 'error';
    this.message = options.message || (def && def.message) || code;
    this.node = options.node || null;
    this.path = options.path || null;
    this.suggestion = options.suggestion || null;
  }
}

// ---------------------------------------------------------------------------
// Levenshtein distance
// ---------------------------------------------------------------------------

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  // Single flat array, two-row rolling approach
  const prev = Array.from({ length: n + 1 }, function (_, j) { return j; });
  const curr = new Array(n + 1);
  Array.from({ length: m }, function (_, idx) {
    const i = idx + 1;
    curr[0] = i;
    Array.from({ length: n }, function (_, jdx) {
      const j = jdx + 1;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    });
    // Copy curr into prev for next iteration
    Array.from({ length: n + 1 }, function (_, k) { prev[k] = curr[k]; });
  });
  return m === 0 ? n : prev[n];
}

// ---------------------------------------------------------------------------
// Fuzzy suggest
// ---------------------------------------------------------------------------

/**
 * Returns up to maxResults closest matches where distance < query.length * 0.6
 * @param {string}   query
 * @param {string[]} candidates
 * @param {number}   [maxResults=3]
 * @returns {string[]}
 */
function suggest(query, candidates, maxResults) {
  const max = maxResults !== undefined ? maxResults : 3;
  const threshold = query.length * 0.6;
  const scored = [];
  for (const c of candidates) {
    const d = levenshtein(query, c);
    if (d < threshold) {
      scored.push({ value: c, distance: d });
    }
  }
  scored.sort(function (a, b) { return a.distance - b.distance; });
  return scored.slice(0, max).map(function (s) { return s.value; });
}

// ---------------------------------------------------------------------------
// Format errors for stderr
// ---------------------------------------------------------------------------

/**
 * Formats an array of CompilerError into a human-readable string.
 * @param {CompilerError[]} errors
 * @returns {string}
 */
function formatErrors(errors) {
  if (!errors || !errors.length) return '';
  const lines = [];
  for (const err of errors) {
    const prefix = err.severity === 'error' ? 'ERROR' : 'WARN ';
    const location = [err.node, err.path].filter(Boolean).join(' @ ');
    const header = location
      ? prefix + ' [' + err.code + '] ' + err.message + ' (' + location + ')'
      : prefix + ' [' + err.code + '] ' + err.message;
    lines.push(header);
    if (err.suggestion && err.suggestion.length) {
      lines.push('       Did you mean: ' + err.suggestion.join(', ') + '?');
    }
  }
  return lines.join('\n');
}

module.exports = { CompilerError, ERROR_CODES, formatErrors, levenshtein, suggest };
