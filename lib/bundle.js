const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escPipe(str) {
  if (!str) return '';
  return String(str).replace(/\|/g, '\\|');
}

function propsOneLiner(props) {
  if (!props || typeof props !== 'object') return '';
  return Object.entries(props)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// SECTION GENERATORS
// ---------------------------------------------------------------------------

function generateComponentSection(data) {
  if (!data || !data.components) return '';
  const lines = ['## COMPONENT REGISTRY', ''];
  const categories = Object.keys(data.components);

  for (const cat of categories) {
    lines.push(`### ${cat}`);
    lines.push('| Name | Key | Type | Variants | Properties |');
    lines.push('|------|-----|------|----------|------------|');
    for (const comp of data.components[cat]) {
      const name = escPipe(comp.name);
      const key = comp.key;
      const type = comp.type;
      const variants = comp.variants || '';
      const props = escPipe(propsOneLiner(comp.properties));
      lines.push(`| ${name} | ${key} | ${type} | ${variants} | ${props} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generateVariableSection(data) {
  if (!data || !data.collections) return '';
  const lines = ['## VARIABLE REGISTRY', ''];

  for (const [collName, coll] of Object.entries(data.collections)) {
    lines.push(`### ${collName} (${coll.variables.length} vars)`);
    // Group variables by prefix (first 2 path segments) for compactness
    const groups = {};
    for (const v of coll.variables) {
      const parts = v.name.split('/');
      const prefix = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(v);
    }
    for (const [prefix, vars] of Object.entries(groups)) {
      const entries = vars.map(v => `\`${v.name}\`=${v.key}`).join(' | ');
      lines.push(`**${prefix}**: ${entries}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generateTextStyleSection(data) {
  if (!data || !data.textStyles) return '';
  const lines = ['## TEXT STYLES', ''];

  for (const [cat, styles] of Object.entries(data.textStyles)) {
    lines.push(`### ${cat}`);
    lines.push('| Name | Key |');
    lines.push('|------|-----|');
    for (const s of styles) {
      lines.push(`| ${escPipe(s.name)} | ${s.key} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generateAssetSection(title, data) {
  if (!data || !data.items || data.items.length === 0) return '';
  const lines = [`## ${title} (${data.items.length})`, ''];

  // Group by prefix for compactness
  const groups = {};
  for (const item of data.items) {
    const parts = item.name.split('/');
    const prefix = parts.length > 1 ? parts[0] : '_root';
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(item);
  }

  for (const [prefix, items] of Object.entries(groups)) {
    const label = prefix === '_root' ? '' : `**${prefix}/** `;
    const entries = items.map(i => {
      const shortName = i.name.split('/').slice(1).join('/') || i.name;
      return `${shortName}=${i.key}`;
    }).join(', ');
    lines.push(`${label}${entries}`);
  }
  lines.push('');
  return lines.join('\n');
}

function generateRulesSection() {
  return `## CRITICAL FIGMA API RULES

1. FILL after appendChild — set layoutSizingHorizontal="FILL" AFTER parent.appendChild(child)
2. resize() before sizing — resize() overrides modes back to FIXED
3. Colors via setBoundVariableForPaint — not setBoundVariable for fills
4. textAutoResize after width — set characters, append, FILL, then textAutoResize="HEIGHT"
5. Script structure — return (async function() { ... return {success:true}; })();
6. DS component reuse — NEVER recreate existing components as raw frames
7. Import by KEY — importComponentByKeyAsync(key) / importComponentSetByKeyAsync(key)
8. Import variables by KEY — importVariableByKeyAsync(key)
9. Load fonts first — await figma.loadFontAsync({family,style}) before text
10. Canvas positioning — 80px+ gaps between components
`;
}

function generateHelpersSection() {
  return `## SCRIPT HELPERS

\`\`\`javascript
function mf(colorVar) {
  var p = figma.util.solidPaint("#000000");
  p = figma.variables.setBoundVariableForPaint(p, "color", colorVar);
  return [p];
}
function appendFill(parent, child, fillH, fillV) {
  parent.appendChild(child);
  if (fillH) child.layoutSizingHorizontal = "FILL";
  if (fillV) child.layoutSizingVertical = "FILL";
}
function bindPadding(frame, top, right, bottom, left) {
  if (top) frame.setBoundVariable("paddingTop", top);
  if (right) frame.setBoundVariable("paddingRight", right);
  if (bottom) frame.setBoundVariable("paddingBottom", bottom);
  if (left) frame.setBoundVariable("paddingLeft", left);
}
function bindRadius(frame, radiusVar) {
  frame.setBoundVariable("topLeftRadius", radiusVar);
  frame.setBoundVariable("topRightRadius", radiusVar);
  frame.setBoundVariable("bottomLeftRadius", radiusVar);
  frame.setBoundVariable("bottomRightRadius", radiusVar);
}
\`\`\`
`;
}

function generateLearningsSection(data) {
  if (!data) return '';
  const lines = ['## LEARNINGS', ''];

  if (data.learnings && data.learnings.length > 0) {
    for (const l of data.learnings) {
      const scope = l.scope === 'global' ? '[GLOBAL]' : '[CTX]';
      lines.push(`- ${scope} ${l.rule}`);
    }
    lines.push('');
  }

  if (data.flags && data.flags.length > 0) {
    lines.push('### Flags');
    for (const f of data.flags) {
      lines.push(`- [${f.date}] ${f.node}: ${f.issue}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

/**
 * Generate a condensed markdown bundle from the knowledge base registries.
 * @param {string} kbPath - path to the knowledge-base directory
 * @returns {string} markdown bundle
 */
function generateBundle(kbPath) {
  const regPath = path.join(kbPath, 'registries');

  const components = readJSON(path.join(regPath, 'components.json'));
  const variables = readJSON(path.join(regPath, 'variables.json'));
  const textStyles = readJSON(path.join(regPath, 'text-styles.json'));
  const icons = readJSON(path.join(regPath, 'icons.json'));
  const logos = readJSON(path.join(regPath, 'logos.json'));
  const illustrations = readJSON(path.join(regPath, 'illustrations.json'));
  const learnings = readJSON(path.join(kbPath, 'learnings.json'));

  const sections = [];

  // Header
  const ts = new Date().toISOString().slice(0, 10);
  sections.push(`# Bridge DS — Quick Bundle`);
  sections.push(`> Generated: ${ts} | Mode: condensed`);
  sections.push('');

  // Component registry
  if (components) {
    sections.push(generateComponentSection(components));
  }

  // Variable registry (condensed — name+key only)
  if (variables) {
    sections.push(generateVariableSection(variables));
  }

  // Text styles
  if (textStyles) {
    sections.push(generateTextStyleSection(textStyles));
  }

  // Icons
  if (icons) {
    sections.push(generateAssetSection('ICONS', icons));
  }

  // Logos
  if (logos) {
    sections.push(generateAssetSection('LOGOS', logos));
  }

  // Illustrations
  if (illustrations) {
    sections.push(generateAssetSection('ILLUSTRATIONS', illustrations));
  }

  // Rules
  sections.push(generateRulesSection());

  // Helpers
  sections.push(generateHelpersSection());

  // Learnings
  if (learnings) {
    sections.push(generateLearningsSection(learnings));
  }

  return sections.join('\n');
}

/**
 * Generate the bundle and write it to quick-bundle.md in the KB directory.
 * @param {string} kbPath - path to the knowledge-base directory
 * @returns {{ path: string, sizeKB: number }}
 */
function writeBundle(kbPath) {
  const bundle = generateBundle(kbPath);
  const outPath = path.join(kbPath, 'quick-bundle.md');
  fs.writeFileSync(outPath, bundle, 'utf8');
  const lines = bundle.split('\n').length;
  return {
    path: outPath,
    sizeKB: Math.round(Buffer.byteLength(bundle) / 1024),
    lines,
  };
}

module.exports = { generateBundle, writeBundle };
