// ---------------------------------------------------------------------------
// Chunking planner — splits a resolved graph into executable chunks
// ---------------------------------------------------------------------------

const MAX_CHUNK_SIZE = 12000;   // chars of generated code (before wrapping)
const MAX_IMPORTS = 30;         // variable/component/style imports per chunk
const BUILD_TARGET = 3000;      // target chars per build chunk
const CHARS_PER_NODE = 500;     // rough estimate: 10 lines × 50 chars

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count total imports across all categories.
 * @param {{ variables?: any[], components?: any[], textStyles?: any[] }} imports
 * @returns {number}
 */
function countImports(imports) {
  const v = (imports.variables && imports.variables.length) || 0;
  const c = (imports.components && imports.components.length) || 0;
  const s = (imports.textStyles && imports.textStyles.length) || 0;
  return v + c + s;
}

/**
 * Rough code-size estimate for a set of nodes (recursive count).
 * @param {object[]} nodes
 * @returns {number}
 */
function estimateNodeSize(nodes) {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children && node.children.length) {
      count += estimateNodeSize(node.children);
    }
  }
  return count * CHARS_PER_NODE;
}

// ---------------------------------------------------------------------------
// Single-chunk plan
// ---------------------------------------------------------------------------

/**
 * @param {object[]} nodes
 * @param {{ variables?: any[], components?: any[], textStyles?: any[] }} imports
 * @param {number} estimatedSize
 * @returns {{ chunks: object[], totalImports: number, estimatedCodeSize: number }}
 */
function singleChunkPlan(nodes, imports, estimatedSize) {
  const total = countImports(imports);
  const chunk = {
    index: 0,
    label: 'build-0',
    imports: {
      variables: (imports.variables || []).slice(),
      components: (imports.components || []).slice(),
      textStyles: (imports.textStyles || []).slice(),
    },
    nodes: nodes.slice(),
    bridgeExports: [],
    bridgeImports: [],
  };
  return { chunks: [chunk], totalImports: total, estimatedCodeSize: estimatedSize };
}

// ---------------------------------------------------------------------------
// Multi-chunk plan
// ---------------------------------------------------------------------------

/**
 * Build a multi-chunk plan.
 * @param {object[]} nodes           - top-level children of root
 * @param {{ variables?: any[], components?: any[], textStyles?: any[] }} imports
 * @param {number} estimatedSize
 * @param {{ maxChunkSize?: number }} options
 * @returns {{ chunks: object[], totalImports: number, estimatedCodeSize: number }}
 */
function multiChunkPlan(nodes, imports, estimatedSize, options) {
  const maxChunk = (options && options.maxChunkSize) || MAX_CHUNK_SIZE;
  const total = countImports(imports);

  // Names exported from preload (all imports + "root")
  const exportNames = [];
  const vars = imports.variables || [];
  const comps = imports.components || [];
  const styles = imports.textStyles || [];

  for (const v of vars) { exportNames.push(v.localName || v.name); }
  for (const c of comps) { exportNames.push(c.localName || c.name); }
  for (const s of styles) { exportNames.push(s.localName || s.name); }
  exportNames.push('root');

  // Chunk 0: preload
  const preload = {
    index: 0,
    label: 'preload',
    imports: {
      variables: vars.slice(),
      components: comps.slice(),
      textStyles: styles.slice(),
    },
    nodes: [],
    bridgeExports: exportNames.slice(),
    bridgeImports: [],
  };

  // Build chunks: group top-level children by estimated size
  const buildChunks = [];
  let currentNodes = [];
  let currentSize = 0;

  for (const node of nodes) {
    const nodeSize = estimateNodeSize([node]);
    // If adding this node would exceed the target and we already have nodes, flush
    if (currentNodes.length > 0 && currentSize + nodeSize > BUILD_TARGET) {
      buildChunks.push(currentNodes);
      currentNodes = [];
      currentSize = 0;
    }
    currentNodes.push(node);
    currentSize += nodeSize;
  }
  // Flush remaining
  if (currentNodes.length > 0) {
    buildChunks.push(currentNodes);
  }

  // Ensure at least one build chunk
  if (buildChunks.length === 0) {
    buildChunks.push([]);
  }

  const chunks = [preload];
  for (let i = 0; i < buildChunks.length; i++) {
    chunks.push({
      index: i + 1,
      label: 'build-' + i,
      imports: { variables: [], components: [], textStyles: [] },
      nodes: buildChunks[i],
      bridgeExports: [],
      bridgeImports: exportNames.slice(),
    });
  }

  return { chunks: chunks, totalImports: total, estimatedCodeSize: estimatedSize };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Plan how to split a resolved graph into executable chunks.
 *
 * @param {{ nodes: object[] }} resolvedGraph - resolved node tree (root's children)
 * @param {{ variables?: any[], components?: any[], textStyles?: any[] }} imports
 * @param {{ transport?: string, maxChunkSize?: number }} [options]
 * @returns {{ chunks: object[], totalImports: number, estimatedCodeSize: number }}
 */
function plan(resolvedGraph, imports, options) {
  const opts = options || {};
  const maxChunk = opts.maxChunkSize || MAX_CHUNK_SIZE;
  const nodes = (resolvedGraph && resolvedGraph.nodes) || [];
  const safeImports = imports || { variables: [], components: [], textStyles: [] };

  const estimatedSize = estimateNodeSize(nodes);
  const totalImports = countImports(safeImports);

  if (estimatedSize < maxChunk && totalImports < MAX_IMPORTS) {
    return singleChunkPlan(nodes, safeImports, estimatedSize);
  }

  return multiChunkPlan(nodes, safeImports, estimatedSize, opts);
}

module.exports = { plan, MAX_CHUNK_SIZE, MAX_IMPORTS, BUILD_TARGET };
