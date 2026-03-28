// ---------------------------------------------------------------------------
// compile.js — CLI entry point + pipeline orchestrator
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { validateSceneGraph } = require('./schema');
const { loadRegistry } = require('./registry');
const { resolve } = require('./resolve');
const { validate } = require('./validate');
const { plan } = require('./plan');
const { generateCode } = require('./codegen');
const { fontLoader } = require('./helpers');
const { wrapChunk, wrapConsole, wrapOfficial } = require('./wrap');
const { formatErrors, CompilerError } = require('./errors');

// ---------------------------------------------------------------------------
// PROGRAMMATIC API
// ---------------------------------------------------------------------------

/**
 * Compile a scene graph JSON into executable Figma Plugin API chunks.
 *
 * @param {object} options
 * @param {string|object} options.input     - JSON string or parsed scene graph
 * @param {string}        options.kbPath    - Path to the knowledge-base directory
 * @param {string}        [options.transport="console"] - "console" or "official"
 * @param {string|null}   [options.fileKey] - Figma file key (required for official)
 * @param {boolean}       [options.verbose] - Print resolution details to stderr
 * @returns {{ success: boolean, errors: object[], warnings: object[], chunks: object[], plan: object }}
 */
function compile(options) {
  const opts = options || {};
  const transport = opts.transport || 'console';
  const fileKey = opts.fileKey || null;
  const verbose = opts.verbose || false;

  // ── Stage 1: Parse + schema validation ────────────────────────────────────

  let json;
  if (typeof opts.input === 'string') {
    try {
      json = JSON.parse(opts.input);
    } catch (e) {
      return {
        success: false,
        errors: [new CompilerError('PARSE_INVALID_JSON', {
          message: 'Failed to parse input JSON: ' + e.message,
        })],
        warnings: [],
        chunks: [],
        plan: null,
      };
    }
  } else if (opts.input && typeof opts.input === 'object') {
    json = opts.input;
  } else {
    return {
      success: false,
      errors: [new CompilerError('PARSE_INVALID_JSON', {
        message: 'Input must be a JSON string or object',
      })],
      warnings: [],
      chunks: [],
      plan: null,
    };
  }

  const schemaResult = validateSceneGraph(json);
  if (!schemaResult.valid) {
    return {
      success: false,
      errors: schemaResult.errors,
      warnings: [],
      chunks: [],
      plan: null,
    };
  }

  const graph = schemaResult.graph;

  // ── Stage 2: Load registry ────────────────────────────────────────────────

  const registry = loadRegistry(opts.kbPath);

  // ── Stage 3: Resolve ──────────────────────────────────────────────────────

  const resolveResult = resolve(graph, registry);

  if (verbose) {
    const impCounts = resolveResult.imports;
    const vCount = (impCounts.variables && impCounts.variables.length) || 0;
    const cCount = (impCounts.components && impCounts.components.length) || 0;
    const sCount = (impCounts.textStyles && impCounts.textStyles.length) || 0;
    const fCount = (impCounts.fonts && impCounts.fonts.length) || 0;
    process.stderr.write('[resolve] variables=' + vCount +
      ' components=' + cCount +
      ' styles=' + sCount +
      ' fonts=' + fCount + '\n');
  }

  if (resolveResult.errors.length > 0) {
    return {
      success: false,
      errors: resolveResult.errors,
      warnings: resolveResult.warnings,
      chunks: [],
      plan: null,
    };
  }

  const resolvedGraph = resolveResult.graph;
  const imports = resolveResult.imports;
  const allWarnings = resolveResult.warnings.slice();

  // ── Stage 4: Validate ─────────────────────────────────────────────────────

  const validateResult = validate(resolvedGraph, registry);

  if (validateResult.warnings.length > 0) {
    validateResult.warnings.forEach(function (w) { allWarnings.push(w); });
  }

  if (validateResult.errors.length > 0) {
    return {
      success: false,
      errors: validateResult.errors,
      warnings: allWarnings,
      chunks: [],
      plan: null,
    };
  }

  // ── Stage 5: Plan ─────────────────────────────────────────────────────────

  const execPlan = plan(resolvedGraph, imports, { transport: transport });
  const isMultiChunk = execPlan.chunks.length > 1;

  if (verbose) {
    process.stderr.write('[plan] chunks=' + execPlan.chunks.length +
      ' totalImports=' + execPlan.totalImports +
      ' estimatedSize=' + execPlan.estimatedCodeSize + '\n');
  }

  // ── Stage 6: Codegen + Wrap ───────────────────────────────────────────────

  const rootName = (resolvedGraph.metadata && resolvedGraph.metadata.name) || 'Root';
  const rootWidth = (resolvedGraph.metadata && resolvedGraph.metadata.width) || 1440;
  const rootHeight = (resolvedGraph.metadata && resolvedGraph.metadata.height) || 900;
  const fontCode = fontLoader(resolvedGraph.fonts);

  const outputChunks = [];

  for (let i = 0; i < execPlan.chunks.length; i++) {
    const chunk = execPlan.chunks[i];

    const context = {
      transport: transport,
      isMultiChunk: isMultiChunk,
      rootName: rootName,
      rootWidth: rootWidth,
      rootHeight: rootHeight,
      allImports: imports,
    };

    const code = generateCode(chunk, context);

    // For preload and single chunks, font loading is included in the wrap.
    // For build chunks in multi-chunk mode, fonts are already loaded in preload.
    const chunkFontCode = (chunk.label === 'preload' || !isMultiChunk) ? fontCode : '';

    let wrappedCode;
    if (isMultiChunk && chunk.bridgeImports && chunk.bridgeImports.length > 0) {
      // Build chunk in multi-chunk mode: wrapChunk handles bridge imports
      wrappedCode = wrapChunk(code, chunk, transport, fileKey);
    } else if (transport === 'official') {
      wrappedCode = wrapOfficial(code, chunkFontCode, fileKey, chunk.label);
    } else {
      wrappedCode = wrapConsole(code, chunkFontCode);
    }

    const description = chunk.label === 'preload'
      ? 'Preload: import ' + execPlan.totalImports + ' design tokens and create root frame'
      : isMultiChunk
        ? 'Build chunk ' + chunk.index + ': create nodes ' + (chunk.nodes.length) + ' top-level elements'
        : 'Full build: ' + rootName + ' (' + execPlan.totalImports + ' imports, ' + chunk.nodes.length + ' top-level nodes)';

    outputChunks.push({
      id: chunk.label,
      code: wrappedCode,
      description: description,
    });
  }

  return {
    success: true,
    errors: [],
    warnings: allWarnings,
    chunks: outputChunks,
    plan: {
      totalChunks: execPlan.chunks.length,
      totalImports: execPlan.totalImports,
      estimatedCodeSize: execPlan.estimatedCodeSize,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments from process.argv.
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = {
    input: null,
    kb: null,
    transport: 'console',
    fileKey: null,
    out: null,
    chunkIndex: null,
    dryRun: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && i + 1 < argv.length) {
      args.input = argv[++i];
    } else if (arg === '--kb' && i + 1 < argv.length) {
      args.kb = argv[++i];
    } else if (arg === '--transport' && i + 1 < argv.length) {
      args.transport = argv[++i];
    } else if (arg === '--file-key' && i + 1 < argv.length) {
      args.fileKey = argv[++i];
    } else if (arg === '--out' && i + 1 < argv.length) {
      args.out = argv[++i];
    } else if (arg === '--chunk-index' && i + 1 < argv.length) {
      args.chunkIndex = parseInt(argv[++i], 10);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv);

  // Validate required args
  if (!args.input) {
    process.stderr.write('Error: --input <path> is required\n');
    process.exit(1);
  }
  if (!args.kb) {
    process.stderr.write('Error: --kb <path> is required\n');
    process.exit(1);
  }
  if (args.transport === 'official' && !args.fileKey) {
    process.stderr.write('Error: --file-key <key> is required for official transport\n');
    process.exit(1);
  }
  if (args.transport !== 'console' && args.transport !== 'official') {
    process.stderr.write('Error: --transport must be "console" or "official"\n');
    process.exit(1);
  }

  // Read input file
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    process.stderr.write('Error: input file not found: ' + inputPath + '\n');
    process.exit(1);
  }

  const inputStr = fs.readFileSync(inputPath, 'utf8');
  const kbPath = path.resolve(args.kb);

  // Compile
  const result = compile({
    input: inputStr,
    kbPath: kbPath,
    transport: args.transport,
    fileKey: args.fileKey,
    verbose: args.verbose,
  });

  // Dry-run mode: validate only
  if (args.dryRun) {
    const output = {
      valid: result.success,
      errors: result.errors.map(function (e) {
        return { code: e.code, message: e.message, node: e.node, path: e.path };
      }),
      warnings: result.warnings.map(function (w) {
        return { code: w.code, message: w.message, node: w.node, path: w.path };
      }),
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    process.exit(result.success ? 0 : 1);
  }

  // Error exit
  if (!result.success) {
    process.stderr.write(formatErrors(result.errors) + '\n');
    process.exit(1);
  }

  // Print warnings to stderr
  if (result.warnings.length > 0) {
    process.stderr.write(formatErrors(result.warnings) + '\n');
  }

  // Output mode: directory or stdout
  if (args.out) {
    const outDir = path.resolve(args.out);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const chunks = args.chunkIndex != null
      ? result.chunks.filter(function (c, idx) { return idx === args.chunkIndex; })
      : result.chunks;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const fileName = 'chunk-' + i + '-' + chunk.id + '.js';
      fs.writeFileSync(path.join(outDir, fileName), chunk.code, 'utf8');
    }

    // Write plan.json
    const planMeta = {
      version: '3.0',
      chunks: result.chunks.map(function (c, idx) {
        return {
          index: idx,
          label: c.id,
          file: 'chunk-' + idx + '-' + c.id + '.js',
          description: c.description,
        };
      }),
      transport: args.transport,
      totalChunks: result.plan.totalChunks,
      totalImports: result.plan.totalImports,
      estimatedCodeSize: result.plan.estimatedCodeSize,
    };
    fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(planMeta, null, 2) + '\n', 'utf8');

    if (args.verbose) {
      process.stderr.write('[output] wrote ' + chunks.length + ' chunk(s) to ' + outDir + '\n');
    }
  } else {
    // Stdout: JSON array of chunks
    const output = args.chunkIndex != null
      ? result.chunks.filter(function (c, idx) { return idx === args.chunkIndex; })
      : result.chunks;
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  }
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = { compile };
