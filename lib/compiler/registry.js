const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Safely read and parse a JSON file. Returns null if the file is missing.
 * @param {string} filePath
 * @returns {object|null}
 */
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Generate segment keys from a slash-separated name.
 * For "color/background/neutral/boldest" produces:
 *   ["color", "color/background", "color/background/neutral"]
 * (every prefix except the full name itself)
 * @param {string} name
 * @returns {string[]}
 */
function segmentKeys(name) {
  const parts = name.split('/');
  const keys = [];
  for (let i = 1; i < parts.length; i++) {
    keys.push(parts.slice(0, i).join('/'));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// INDEX BUILDERS
// ---------------------------------------------------------------------------

/**
 * Build variable lookup maps from variables.json data.
 * @param {object} data - parsed variables.json
 * @returns {{ byName: Map, bySegment: Map }}
 */
function buildVariableIndex(data) {
  const byName = new Map();
  const bySegment = new Map();

  if (!data || !data.collections) return { byName, bySegment };

  for (const [collName, coll] of Object.entries(data.collections)) {
    const vars = coll.variables || [];
    for (const v of vars) {
      const entry = { name: v.name, key: v.key, collection: collName };
      byName.set(v.name, entry);

      for (const seg of segmentKeys(v.name)) {
        if (!bySegment.has(seg)) bySegment.set(seg, []);
        bySegment.get(seg).push(entry);
      }
    }
  }

  return { byName, bySegment };
}

/**
 * Build component lookup map from components.json data.
 * @param {object} data - parsed components.json
 * @returns {{ byName: Map }}
 */
function buildComponentIndex(data) {
  const byName = new Map();

  if (!data || !data.components) return { byName };

  for (const cat of Object.keys(data.components)) {
    const items = data.components[cat] || [];
    for (const comp of items) {
      const entry = {
        name: comp.name,
        key: comp.key,
        type: comp.type,
        properties: comp.properties || {},
      };
      byName.set(comp.name.toLowerCase(), entry);
    }
  }

  return { byName };
}

/**
 * Build text style lookup maps from text-styles.json data.
 * @param {object} data - parsed text-styles.json
 * @returns {{ byName: Map, bySegment: Map }}
 */
function buildTextStyleIndex(data) {
  const byName = new Map();
  const bySegment = new Map();

  if (!data || !data.textStyles) return { byName, bySegment };

  for (const cat of Object.keys(data.textStyles)) {
    const styles = data.textStyles[cat] || [];
    for (const s of styles) {
      const entry = { name: s.name, key: s.key };
      byName.set(s.name, entry);

      for (const seg of segmentKeys(s.name)) {
        if (!bySegment.has(seg)) bySegment.set(seg, []);
        bySegment.get(seg).push(entry);
      }
    }
  }

  return { byName, bySegment };
}

/**
 * Build asset lookup map from icons.json or logos.json data.
 * @param {object} data - parsed asset JSON (has items array)
 * @returns {{ byName: Map }}
 */
function buildAssetIndex(data) {
  const byName = new Map();

  if (!data || !data.items) return { byName };

  for (const item of data.items) {
    const entry = { name: item.name, key: item.key, type: item.type };
    byName.set(item.name, entry);
  }

  return { byName };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

/**
 * Load all KB registry files and return a fully-indexed Registry object.
 * @param {string} kbPath - path to the knowledge-base directory
 * @returns {object} Registry
 */
function loadRegistry(kbPath) {
  const regPath = path.join(kbPath, 'registries');

  const variablesData = readJSON(path.join(regPath, 'variables.json'));
  const componentsData = readJSON(path.join(regPath, 'components.json'));
  const textStylesData = readJSON(path.join(regPath, 'text-styles.json'));
  const iconsData = readJSON(path.join(regPath, 'icons.json'));
  const logosData = readJSON(path.join(regPath, 'logos.json'));

  const variables = buildVariableIndex(variablesData);
  const components = buildComponentIndex(componentsData);
  const textStyles = buildTextStyleIndex(textStylesData);
  const icons = buildAssetIndex(iconsData);
  const logos = buildAssetIndex(logosData);

  // Pre-compute name arrays for fuzzy matching
  const allVariableNames = Array.from(variables.byName.keys());
  const allComponentNames = Array.from(components.byName.keys());
  const allStyleNames = Array.from(textStyles.byName.keys());

  return {
    variables,
    components,
    textStyles,
    icons,
    logos,
    allVariableNames,
    allComponentNames,
    allStyleNames,
  };
}

module.exports = { loadRegistry };
