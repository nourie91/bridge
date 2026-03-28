const { CompilerError, ERROR_CODES } = require('./errors');

// ─── Node Types ───────────────────────────────────────────────────────────────

const NODE_TYPES = [
  "FRAME", "TEXT", "INSTANCE", "CLONE",
  "RECTANGLE", "ELLIPSE", "REPEAT", "CONDITIONAL"
];

// ─── Allowed enum values ──────────────────────────────────────────────────────

const LAYOUT_MODES = ["HORIZONTAL", "VERTICAL", "NONE"];
const SIZING_MODES = ["AUTO", "FIXED"];
const PRIMARY_AXIS_ALIGNS = ["MIN", "CENTER", "MAX", "SPACE_BETWEEN"];
const COUNTER_AXIS_ALIGNS = ["MIN", "CENTER", "MAX"];
const STROKE_ALIGNS = ["INSIDE", "OUTSIDE", "CENTER"];
const AUTO_RESIZE_MODES = ["HEIGHT", "WIDTH_AND_HEIGHT", "NONE"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check whether a value is a non-null plain object.
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Create a CompilerError for a missing required field.
 */
function missingField(field, nodeName, path) {
  return new CompilerError(
    ERROR_CODES.PARSE_MISSING_FIELD,
    'error',
    'Missing required field "' + field + '" on node "' + nodeName + '"',
    nodeName,
    path + '.' + field
  );
}

/**
 * Create a CompilerError for an unknown node type.
 */
function unknownType(type, nodeName, path) {
  return new CompilerError(
    ERROR_CODES.PARSE_UNKNOWN_NODE_TYPE,
    'error',
    'Unknown node type "' + type + '"' + (nodeName ? ' on node "' + nodeName + '"' : ''),
    nodeName || '(unnamed)',
    path + '.type'
  );
}

/**
 * Create a CompilerError for an invalid enum value.
 */
function invalidEnum(field, value, allowed, nodeName, path) {
  return new CompilerError(
    ERROR_CODES.PARSE_MISSING_FIELD,
    'error',
    'Invalid value "' + value + '" for "' + field + '" on node "' + nodeName +
      '". Allowed: ' + allowed.join(', '),
    nodeName,
    path + '.' + field
  );
}

/**
 * Validate that a value is one of the allowed enum values.
 * Returns an error or null.
 */
function checkEnum(field, value, allowed, nodeName, path) {
  if (value !== undefined && allowed.indexOf(value) === -1) {
    return invalidEnum(field, value, allowed, nodeName, path);
  }
  return null;
}

/**
 * Validate that a value is a string (if present).
 */
function checkString(field, value, nodeName, path) {
  if (value !== undefined && typeof value !== 'string') {
    return new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "' + field + '" must be a string on node "' + nodeName + '"',
      nodeName,
      path + '.' + field
    );
  }
  return null;
}

/**
 * Validate that a value is a number (if present).
 */
function checkNumber(field, value, nodeName, path) {
  if (value !== undefined && typeof value !== 'number') {
    return new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "' + field + '" must be a number on node "' + nodeName + '"',
      nodeName,
      path + '.' + field
    );
  }
  return null;
}

/**
 * Validate that a value is a boolean (if present).
 */
function checkBoolean(field, value, nodeName, path) {
  if (value !== undefined && typeof value !== 'boolean') {
    return new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "' + field + '" must be a boolean on node "' + nodeName + '"',
      nodeName,
      path + '.' + field
    );
  }
  return null;
}

// ─── Shorthand Expansion ──────────────────────────────────────────────────────

/**
 * Expand shorthands and apply defaults to a node (mutates the node).
 */
function expandShorthands(node) {
  // Padding shorthand: padding → all four sides
  if (node.padding !== undefined) {
    if (node.paddingTop === undefined) node.paddingTop = node.padding;
    if (node.paddingRight === undefined) node.paddingRight = node.padding;
    if (node.paddingBottom === undefined) node.paddingBottom = node.padding;
    if (node.paddingLeft === undefined) node.paddingLeft = node.padding;
    delete node.padding;
  }

  // Default visible = true
  if (node.visible === undefined) {
    node.visible = true;
  }

  // Default strokeAlign = "INSIDE" when stroke is present
  if (node.stroke !== undefined && node.strokeAlign === undefined) {
    node.strokeAlign = "INSIDE";
  }

  // Default autoResize = "HEIGHT" for TEXT nodes
  if (node.type === "TEXT" && node.autoResize === undefined) {
    node.autoResize = "HEIGHT";
  }

  return node;
}

// ─── Per-Type Validators ──────────────────────────────────────────────────────

function validateFrame(node, path) {
  const errors = [];
  const name = node.name;

  const e1 = checkEnum('layout', node.layout, LAYOUT_MODES, name, path);
  if (e1) errors.push(e1);
  const e2 = checkEnum('primaryAxisSizing', node.primaryAxisSizing, SIZING_MODES, name, path);
  if (e2) errors.push(e2);
  const e3 = checkEnum('counterAxisSizing', node.counterAxisSizing, SIZING_MODES, name, path);
  if (e3) errors.push(e3);
  const e4 = checkEnum('primaryAxisAlign', node.primaryAxisAlign, PRIMARY_AXIS_ALIGNS, name, path);
  if (e4) errors.push(e4);
  const e5 = checkEnum('counterAxisAlign', node.counterAxisAlign, COUNTER_AXIS_ALIGNS, name, path);
  if (e5) errors.push(e5);
  const e6 = checkEnum('strokeAlign', node.strokeAlign, STROKE_ALIGNS, name, path);
  if (e6) errors.push(e6);

  const numFields = ['width', 'height', 'strokeWeight', 'opacity'];
  numFields.forEach(function (f) {
    const e = checkNumber(f, node[f], name, path);
    if (e) errors.push(e);
  });

  const strFields = [
    'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'radius', 'radiusTopLeft', 'radiusTopRight', 'radiusBottomLeft', 'radiusBottomRight',
    'fill', 'stroke', 'effectStyle'
  ];
  strFields.forEach(function (f) {
    const e = checkString(f, node[f], name, path);
    if (e) errors.push(e);
  });

  const boolFields = ['clip', 'fillH', 'fillV'];
  boolFields.forEach(function (f) {
    const e = checkBoolean(f, node[f], name, path);
    if (e) errors.push(e);
  });

  // Recurse into children
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(function (child, i) {
      const childErrors = validateNode(child, path + '.children[' + i + ']');
      childErrors.forEach(function (ce) { errors.push(ce); });
    });
  }

  return errors;
}

function validateText(node, path) {
  const errors = [];
  const name = node.name;

  if (node.characters === undefined || node.characters === null) {
    errors.push(missingField('characters', name, path));
  } else if (typeof node.characters !== 'string') {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "characters" must be a string on node "' + name + '"',
      name,
      path + '.characters'
    ));
  }

  if (!node.textStyle) {
    errors.push(missingField('textStyle', name, path));
  } else {
    const e = checkString('textStyle', node.textStyle, name, path);
    if (e) errors.push(e);
  }

  const e1 = checkEnum('autoResize', node.autoResize, AUTO_RESIZE_MODES, name, path);
  if (e1) errors.push(e1);

  const e2 = checkString('fill', node.fill, name, path);
  if (e2) errors.push(e2);

  const e3 = checkNumber('maxLines', node.maxLines, name, path);
  if (e3) errors.push(e3);

  return errors;
}

function validateInstance(node, path) {
  const errors = [];
  const name = node.name;

  if (!node.component) {
    errors.push(missingField('component', name, path));
  } else {
    const e = checkString('component', node.component, name, path);
    if (e) errors.push(e);
  }

  if (node.variant !== undefined && !isObject(node.variant)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "variant" must be an object on node "' + name + '"',
      name,
      path + '.variant'
    ));
  }

  if (node.properties !== undefined && !isObject(node.properties)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "properties" must be an object on node "' + name + '"',
      name,
      path + '.properties'
    ));
  }

  if (node.swaps !== undefined && !isObject(node.swaps)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "swaps" must be an object on node "' + name + '"',
      name,
      path + '.swaps'
    ));
  }

  return errors;
}

function validateClone(node, path) {
  const errors = [];
  const name = node.name;

  if (!node.sourceNodeId && !node.sourceRef) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'CLONE node "' + name + '" must have either "sourceNodeId" or "sourceRef"',
      name,
      path
    ));
  }

  if (node.overrides !== undefined) {
    if (!Array.isArray(node.overrides)) {
      errors.push(new CompilerError(
        ERROR_CODES.PARSE_MISSING_FIELD,
        'error',
        'Field "overrides" must be an array on node "' + name + '"',
        name,
        path + '.overrides'
      ));
    } else {
      node.overrides.forEach(function (override, i) {
        const oPath = path + '.overrides[' + i + ']';
        if (!override.find || !override.find.name) {
          errors.push(new CompilerError(
            ERROR_CODES.PARSE_MISSING_FIELD,
            'error',
            'Override at ' + oPath + ' must have "find.name"',
            name,
            oPath + '.find.name'
          ));
        }
        if (!override.set || !isObject(override.set)) {
          errors.push(new CompilerError(
            ERROR_CODES.PARSE_MISSING_FIELD,
            'error',
            'Override at ' + oPath + ' must have a "set" object',
            name,
            oPath + '.set'
          ));
        }
      });
    }
  }

  return errors;
}

function validateRectangle(node, path) {
  const errors = [];
  const name = node.name;

  if (node.width === undefined) errors.push(missingField('width', name, path));
  if (node.height === undefined) errors.push(missingField('height', name, path));

  const numFields = ['width', 'height', 'strokeWeight'];
  numFields.forEach(function (f) {
    const e = checkNumber(f, node[f], name, path);
    if (e) errors.push(e);
  });

  const strFields = ['fill', 'stroke', 'radius'];
  strFields.forEach(function (f) {
    const e = checkString(f, node[f], name, path);
    if (e) errors.push(e);
  });

  const e = checkEnum('strokeAlign', node.strokeAlign, STROKE_ALIGNS, name, path);
  if (e) errors.push(e);

  return errors;
}

function validateEllipse(node, path) {
  const errors = [];
  const name = node.name;

  if (node.width === undefined) errors.push(missingField('width', name, path));
  if (node.height === undefined) errors.push(missingField('height', name, path));

  const numFields = ['width', 'height', 'strokeWeight'];
  numFields.forEach(function (f) {
    const e = checkNumber(f, node[f], name, path);
    if (e) errors.push(e);
  });

  const strFields = ['fill', 'stroke'];
  strFields.forEach(function (f) {
    const e = checkString(f, node[f], name, path);
    if (e) errors.push(e);
  });

  return errors;
}

function validateRepeat(node, path) {
  const errors = [];
  const name = node.name;

  if (node.count === undefined && node.data === undefined) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'REPEAT node "' + name + '" must have either "count" or "data"',
      name,
      path
    ));
  }

  if (node.count !== undefined) {
    const e = checkNumber('count', node.count, name, path);
    if (e) errors.push(e);
  }

  if (node.data !== undefined && !Array.isArray(node.data)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Field "data" must be an array on node "' + name + '"',
      name,
      path + '.data'
    ));
  }

  if (!node.template || !Array.isArray(node.template) || node.template.length === 0) {
    errors.push(missingField('template', name, path));
  } else {
    node.template.forEach(function (child, i) {
      const childErrors = validateNode(child, path + '.template[' + i + ']');
      childErrors.forEach(function (ce) { errors.push(ce); });
    });
  }

  return errors;
}

function validateConditional(node, path) {
  const errors = [];
  const name = node.name;

  if (!node.when) {
    errors.push(missingField('when', name, path));
  } else {
    const e = checkString('when', node.when, name, path);
    if (e) errors.push(e);
  }

  if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
    errors.push(missingField('children', name, path));
  } else {
    node.children.forEach(function (child, i) {
      const childErrors = validateNode(child, path + '.children[' + i + ']');
      childErrors.forEach(function (ce) { errors.push(ce); });
    });
  }

  if (node.else !== undefined) {
    if (!Array.isArray(node.else)) {
      errors.push(new CompilerError(
        ERROR_CODES.PARSE_MISSING_FIELD,
        'error',
        'Field "else" must be an array on node "' + name + '"',
        name,
        path + '.else'
      ));
    } else {
      node.else.forEach(function (child, i) {
        const childErrors = validateNode(child, path + '.else[' + i + ']');
        childErrors.forEach(function (ce) { errors.push(ce); });
      });
    }
  }

  return errors;
}

// ─── Node Dispatcher ──────────────────────────────────────────────────────────

const TYPE_VALIDATORS = {
  FRAME: validateFrame,
  TEXT: validateText,
  INSTANCE: validateInstance,
  CLONE: validateClone,
  RECTANGLE: validateRectangle,
  ELLIPSE: validateEllipse,
  REPEAT: validateRepeat,
  CONDITIONAL: validateConditional
};

/**
 * Validate a single node: check common fields, dispatch to type-specific validator.
 * @param {object} node
 * @param {string} path - JSON path for error reporting
 * @returns {CompilerError[]}
 */
function validateNode(node, path) {
  const errors = [];

  if (!isObject(node)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Node at ' + path + ' must be an object',
      '(invalid)',
      path
    ));
    return errors;
  }

  if (!node.type) {
    errors.push(missingField('type', node.name || '(unnamed)', path));
    return errors;
  }

  if (NODE_TYPES.indexOf(node.type) === -1) {
    errors.push(unknownType(node.type, node.name, path));
    return errors;
  }

  if (!node.name) {
    errors.push(missingField('name', '(unnamed)', path));
  }

  // Expand shorthands and apply defaults before type-specific validation
  expandShorthands(node);

  // Common optional field checks
  const e1 = checkBoolean('visible', node.visible, node.name || '(unnamed)', path);
  if (e1) errors.push(e1);
  const e2 = checkNumber('opacity', node.opacity, node.name || '(unnamed)', path);
  if (e2) errors.push(e2);
  const e3 = checkBoolean('fillH', node.fillH, node.name || '(unnamed)', path);
  if (e3) errors.push(e3);
  const e4 = checkBoolean('fillV', node.fillV, node.name || '(unnamed)', path);
  if (e4) errors.push(e4);

  // Dispatch to type-specific validator
  const typeValidator = TYPE_VALIDATORS[node.type];
  const typeErrors = typeValidator(node, path);
  typeErrors.forEach(function (te) { errors.push(te); });

  return errors;
}

// ─── Root Validator ───────────────────────────────────────────────────────────

/**
 * Validate a complete scene graph JSON document.
 * @param {object} json - Parsed scene graph
 * @returns {{ valid: boolean, errors: CompilerError[], graph: object }}
 */
function validateSceneGraph(json) {
  const errors = [];

  // Must be an object
  if (!isObject(json)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_INVALID_JSON,
      'error',
      'Scene graph must be a JSON object',
      null,
      ''
    ));
    return { valid: false, errors: errors, graph: null };
  }

  // version
  if (json.version !== "3.0") {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Scene graph must have version "3.0", got "' + json.version + '"',
      null,
      'version'
    ));
  }

  // metadata
  if (!isObject(json.metadata)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Scene graph must have a "metadata" object',
      null,
      'metadata'
    ));
  } else {
    if (!json.metadata.name) {
      errors.push(new CompilerError(
        ERROR_CODES.PARSE_MISSING_FIELD,
        'error',
        'metadata.name is required',
        null,
        'metadata.name'
      ));
    }
    if (typeof json.metadata.width !== 'number') {
      errors.push(new CompilerError(
        ERROR_CODES.PARSE_MISSING_FIELD,
        'error',
        'metadata.width is required and must be a number',
        null,
        'metadata.width'
      ));
    }
    if (typeof json.metadata.height !== 'number') {
      errors.push(new CompilerError(
        ERROR_CODES.PARSE_MISSING_FIELD,
        'error',
        'metadata.height is required and must be a number',
        null,
        'metadata.height'
      ));
    }
  }

  // fonts
  if (!Array.isArray(json.fonts)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Scene graph must have a "fonts" array',
      null,
      'fonts'
    ));
  } else {
    json.fonts.forEach(function (font, i) {
      if (!font.family || typeof font.family !== 'string') {
        errors.push(new CompilerError(
          ERROR_CODES.PARSE_MISSING_FIELD,
          'error',
          'fonts[' + i + '].family is required and must be a string',
          null,
          'fonts[' + i + '].family'
        ));
      }
      if (!font.style || typeof font.style !== 'string') {
        errors.push(new CompilerError(
          ERROR_CODES.PARSE_MISSING_FIELD,
          'error',
          'fonts[' + i + '].style is required and must be a string',
          null,
          'fonts[' + i + '].style'
        ));
      }
    });
  }

  // nodes
  if (!Array.isArray(json.nodes)) {
    errors.push(new CompilerError(
      ERROR_CODES.PARSE_MISSING_FIELD,
      'error',
      'Scene graph must have a "nodes" array',
      null,
      'nodes'
    ));
  } else {
    json.nodes.forEach(function (node, i) {
      const nodeErrors = validateNode(node, 'nodes[' + i + ']');
      nodeErrors.forEach(function (ne) { errors.push(ne); });
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    graph: errors.length === 0 ? json : null
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { NODE_TYPES, validateSceneGraph };
