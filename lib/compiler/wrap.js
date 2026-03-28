// ---------------------------------------------------------------------------
// Transport wrappers — produce executable script strings from generated code
// ---------------------------------------------------------------------------

const { HELPER_BLOCK } = require('./helpers');
const { CompilerError } = require('./errors');

const MAX_OFFICIAL_SIZE = 20000;
const NOTIFY_RE = /figma\.notify\([^)]*\);?\n?/g;

// ---------------------------------------------------------------------------
// Console transport (figma_execute) — IIFE wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap code for the console transport (figma_execute).
 * @param {string} code      - generated Figma Plugin API code
 * @param {string} fontCode  - font loading statements
 * @returns {string}
 */
function wrapConsole(code, fontCode) {
  const parts = ['return (async function() {'];
  if (fontCode) { parts.push(fontCode); }
  parts.push(HELPER_BLOCK);
  parts.push(code);
  parts.push('return { success: true, rootId: root.id };');
  parts.push('})();');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Official transport (use_figma) — top-level await, no IIFE
// ---------------------------------------------------------------------------

/**
 * Wrap code for the official transport (use_figma).
 * Strips figma.notify() calls and enforces the 20KB limit.
 * @param {string} code         - generated Figma Plugin API code
 * @param {string} fontCode     - font loading statements
 * @param {string} fileKey      - Figma file key (required)
 * @param {string} description  - human description of what the code does
 * @returns {string}
 */
function wrapOfficial(code, fontCode, fileKey, description) {
  if (!fileKey) {
    throw new CompilerError('WRAP_MISSING_FILEKEY');
  }

  const sanitized = code.replace(NOTIFY_RE, '');

  const parts = [];
  if (fontCode) { parts.push(fontCode); }
  parts.push(HELPER_BLOCK);
  parts.push(sanitized);
  parts.push('return { success: true, rootId: root.id };');

  const result = parts.join('\n');

  if (result.length > MAX_OFFICIAL_SIZE) {
    throw new CompilerError('WRAP_CODE_TOO_LARGE', {
      message: 'Generated code is ' + result.length + ' chars (limit: ' + MAX_OFFICIAL_SIZE + ')',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Chunk wrapper — dispatches to console or official based on transport
// ---------------------------------------------------------------------------

/**
 * Wrap a single chunk for execution.
 * For multi-chunk build chunks (non-preload), prepends globalThis destructuring.
 *
 * @param {string} code       - generated code for this chunk
 * @param {object} chunk      - chunk descriptor from plan()
 * @param {string} transport  - "console" or "official"
 * @param {string} [fileKey]  - required for official transport
 * @returns {string}
 */
function wrapChunk(code, chunk, transport, fileKey) {
  // codegen already handles globalThis bridging in build chunks — no extra destructuring needed here

  if (transport === 'official') {
    return wrapOfficial(code, '', fileKey, chunk.label);
  }

  return wrapConsole(code, '');
}

module.exports = { wrapConsole, wrapOfficial, wrapChunk };
