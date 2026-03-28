# Bridge DS Compiler — Technical Specification

> **Version:** 3.0-draft
> **Status:** Implementation spec — every detail is load-bearing.
> **Audience:** The developer (human or AI) who will implement `lib/compiler/`.

---

## 1. Directory Structure

```
lib/compiler/
├── compile.js              # CLI entry point + pipeline orchestrator
├── schema.js               # Scene graph node type definitions + validation
├── resolve.js              # Token + component + text-style resolution
├── validate.js             # Structural validation (orphan refs, sizing conflicts)
├── plan.js                 # Execution planning: chunking, dependency ordering
├── codegen.js              # AST → Figma Plugin API code string
├── wrap.js                 # Transport adaptation: IIFE (console) vs top-level (official)
├── errors.js               # Error types, formatting, fuzzy suggestion engine
├── registry.js             # Registry loader + lookup (variables, components, text-styles)
├── helpers.js              # Codegen fragments: mf, appendFill, bindPadding, bindRadius
└── __tests__/
    ├── schema.test.js
    ├── resolve.test.js
    ├── validate.test.js
    ├── plan.test.js
    ├── codegen.test.js
    └── wrap.test.js
```

### File Responsibilities and Exports

| File | Responsibility | Primary Exports |
|------|---------------|-----------------|
| `compile.js` | CLI arg parsing, pipeline orchestration, file I/O | `compile(input, options): CompileResult` |
| `schema.js` | Node type interfaces, JSON schema validation | `validateSceneGraph(json): ValidationResult`, `NODE_TYPES` |
| `resolve.js` | Replace `$token` refs with registry keys, resolve component names to keys | `resolveTokens(graph, registry): ResolvedGraph`, `resolveComponents(graph, registry): ResolvedGraph` |
| `validate.js` | Structural validation post-resolution | `validateStructure(graph): ValidationResult` |
| `plan.js` | Split graph into execution chunks, compute dependency order | `plan(graph, options): ExecutionPlan` |
| `codegen.js` | Walk resolved graph, emit Figma Plugin API code | `generateCode(chunk, registry): string` |
| `wrap.js` | Wrap generated code for target transport | `wrapConsole(code, fonts): string`, `wrapOfficial(code, fonts, fileKey): string` |
| `errors.js` | Structured error objects, fuzzy matching for suggestions | `CompilerError`, `formatErrors(errors): string`, `suggest(name, candidates): string[]` |
| `registry.js` | Load + index registries from KB path | `loadRegistry(kbPath): Registry`, `lookupVariable(registry, ref): RegistryEntry` |
| `helpers.js` | Static code fragments injected into every script | `HELPER_BLOCK: string`, `FONT_LOADER(fonts): string` |

---

## 2. Scene Graph JSON Schema

The scene graph is the compiler's input format. Claude reads a CSpec (YAML or free-form) and produces this JSON. The compiler never sees YAML.

### 2.1 Root Document

```typescript
interface SceneGraph {
  version: "3.0";
  metadata: {
    name: string;             // Screen or component name
    description?: string;
    width: number;            // Root frame width in px (e.g. 1440)
    height: number;           // Root frame height in px (e.g. 900)
    transport?: "console" | "official";  // Override auto-detection
    fileKey?: string;         // Required for official transport
  };
  fonts: FontDef[];           // Fonts to preload
  nodes: SceneNode[];         // Top-level children of root frame
}

interface FontDef {
  family: string;             // e.g. "Inter"
  style: string;              // e.g. "Regular", "Semi Bold"
}
```

### 2.2 Base Node (shared by all types)

```typescript
interface BaseNode {
  type: NodeType;
  name: string;                         // Figma layer name
  id?: string;                          // Local ref ID for CLONE (e.g. "sidebar")
  children?: SceneNode[];

  // ── Layout sizing (applied AFTER appendChild — Rule 1) ──
  fillH?: boolean;                      // layoutSizingHorizontal = "FILL"
  fillV?: boolean;                      // layoutSizingVertical = "FILL"

  // ── Absolute positioning (applied AFTER appendChild — Rule 2) ──
  absolute?: { x: number; y: number };  // layoutPositioning = "ABSOLUTE"

  // ── Visibility ──
  visible?: boolean;                    // default true
  opacity?: number;                     // 0–1
}

type NodeType = "FRAME" | "TEXT" | "INSTANCE" | "CLONE" | "RECTANGLE" | "ELLIPSE" | "REPEAT" | "CONDITIONAL";
```

### 2.3 FRAME Node

The workhorse. Maps to `figma.createFrame()`.

```typescript
interface FrameNode extends BaseNode {
  type: "FRAME";

  // ── Dimensions (Rule 4: resize() first, then sizing modes) ──
  width?: number;                       // resize() width
  height?: number;                      // resize() height

  // ── Auto-layout ──
  layout?: "HORIZONTAL" | "VERTICAL" | "NONE";  // layoutMode
  primaryAxisSizing?: "AUTO" | "FIXED";          // primaryAxisSizingMode
  counterAxisSizing?: "AUTO" | "FIXED";          // counterAxisSizingMode
  primaryAxisAlign?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";  // Rule 5
  counterAxisAlign?: "MIN" | "CENTER" | "MAX";                     // Rule 5

  // ── Spacing (Rule 6: always token refs, never raw px) ──
  gap?: string;                         // "$spacing/md" → itemSpacing
  paddingTop?: string;                  // "$spacing/lg"
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  padding?: string;                     // Shorthand: "$spacing/lg" → all four sides

  // ── Radius (Rule 6) ──
  radius?: string;                      // "$radius/md" → all corners
  radiusTopLeft?: string;
  radiusTopRight?: string;
  radiusBottomLeft?: string;
  radiusBottomRight?: string;

  // ── Fills (Rule 7: setBoundVariableForPaint) ──
  fill?: string;                        // "$color/background/neutral/default"

  // ── Strokes (Rule 13) ──
  stroke?: string;                      // "$color/border/neutral/default"
  strokeWeight?: number;                // default 1
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";  // default "INSIDE"

  // ── Effects ──
  effectStyle?: string;                 // Text-style-like key ref: "$effect/shadow/xsmall"

  // ── Clipping ──
  clip?: boolean;                       // clipsContent

  children?: SceneNode[];
}
```

### 2.4 TEXT Node

Maps to `figma.createText()`. Enforces Rule 8 (styles from registry), Rule 12 (textAutoResize order), Rule 16 (font loading).

```typescript
interface TextNode extends BaseNode {
  type: "TEXT";

  characters: string;                    // The text content

  // ── Text style (Rule 8: NEVER hardcode font props) ──
  textStyle: string;                     // "$text/heading/xl/regular" → importStyleByKeyAsync

  // ── Auto-resize (Rule 12: set AFTER append + FILL) ──
  autoResize?: "HEIGHT" | "WIDTH_AND_HEIGHT" | "NONE";  // default "HEIGHT"

  // ── Fill color override (optional — most text gets color from style) ──
  fill?: string;                         // "$color/text/neutral/default"

  // ── Truncation ──
  maxLines?: number;                     // textTruncation = "ENDING" if set
}
```

### 2.5 INSTANCE Node

Maps to `importComponentByKeyAsync` / `importComponentSetByKeyAsync` + `createInstance()`. Enforces Rule 11, 14, 18, 25.

```typescript
interface InstanceNode extends BaseNode {
  type: "INSTANCE";

  component: string;                     // Component name: "Button", "TextInput"
                                         // Resolved to key + import method by resolve stage

  // ── Variant selection (for COMPONENT_SET) ──
  variant?: Record<string, string>;      // { "size": "large", "variant": "primary", "state": "filled" }

  // ── Property overrides (Rule 9c, 14) ──
  properties?: Record<string, string | boolean>;
  // e.g. { "label": "Submit", "hasTrailingIcon": true }

  // ── Instance swap (Rule 9d) ──
  swaps?: Record<string, string>;
  // e.g. { "leadingIcon": "IconArrowRight" } → resolved to component key
}
```

### 2.6 CLONE Node

Maps to `node.clone()`. Enforces Rule 22.

```typescript
interface CloneNode extends BaseNode {
  type: "CLONE";

  // ── Source (exactly one required) ──
  sourceNodeId?: string;                // Figma node ID for getNodeByIdAsync (for reference clones)
  sourceRef?: string;                   // Local ref ID defined in another node's `id` field

  // ── Modifications after clone ──
  overrides?: CloneOverride[];
}

interface CloneOverride {
  find: {                               // How to locate the child within the clone
    name: string;                       // node.name match
    type?: NodeType;                    // optional type filter
  };
  set: {
    characters?: string;                // For TEXT nodes
    fill?: string;                      // Token ref for color override
    visible?: boolean;
    properties?: Record<string, string | boolean>;  // For INSTANCE nodes
  };
}
```

### 2.7 RECTANGLE Node

Maps to `figma.createRectangle()`. Only for raw decorative elements where NO DS component exists (Rule 18 audit required).

```typescript
interface RectangleNode extends BaseNode {
  type: "RECTANGLE";

  width: number;
  height: number;
  fill?: string;                         // "$color/..."
  stroke?: string;
  strokeWeight?: number;
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
  radius?: string;                       // "$radius/..."
}
```

### 2.8 ELLIPSE Node

Maps to `figma.createEllipse()`. Same caveats as RECTANGLE — Rule 18 audit required.

```typescript
interface EllipseNode extends BaseNode {
  type: "ELLIPSE";

  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWeight?: number;
}
```

### 2.9 REPEAT Node (Recipe)

Not a Figma node. Expands to N copies of its children during the resolve stage.

```typescript
interface RepeatNode extends BaseNode {
  type: "REPEAT";

  count: number;                         // Static repeat count
  data?: Record<string, string>[];       // Per-iteration data bindings
  // e.g. [{ "title": "Row 1" }, { "title": "Row 2" }]

  template: SceneNode[];                 // Children to stamp per iteration
}
```

During resolution, REPEAT expands: if `data` is provided, `data.length` overrides `count`. Each child template is deep-cloned and any `{{key}}` placeholders in `characters` fields are replaced with the corresponding `data[i][key]`.

### 2.10 CONDITIONAL Node (Recipe)

Not a Figma node. Evaluates to its children or nothing.

```typescript
interface ConditionalNode extends BaseNode {
  type: "CONDITIONAL";

  when: string;                          // Expression: "variant == 'premium'" or "showHeader"
  children: SceneNode[];                 // Included if `when` is truthy
  else?: SceneNode[];                    // Included if `when` is falsy
}
```

Evaluated during the resolve stage. The `when` expression supports simple equality checks (`==`, `!=`) and boolean variable names. This is intentionally limited — complex logic belongs in Claude's YAML-to-JSON conversion, not in the compiler.

---

## 3. Token Resolution

### 3.1 Token Reference Format

All token references in the scene graph use the `$` prefix:

```
$spacing/md          → layout collection, variable name contains "spacing/medium" or "spacing/md"
$color/bg/neutral    → color collection, variable name contains "background/neutral"
$radius/lg           → layout collection, variable name contains "radius/large" or "radius/lg"
$text/heading/xl     → text-styles registry, name contains "heading/xl"
$effect/shadow/sm    → effect-styles registry, name contains "shadow/small" or "shadow/sm"
$comp/Button         → components registry, name == "Button"
```

### 3.2 Registry JSON Format

Loaded by `registry.js` from the KB path:

```typescript
interface Registry {
  variables: VariableIndex;     // From registries/variables.json
  components: ComponentIndex;   // From registries/components.json
  textStyles: TextStyleIndex;   // From registries/text-styles.json
  effectStyles: EffectStyleIndex; // From registries/text-styles.json (effectStyles section)
  icons: AssetIndex;            // From registries/icons.json (if exists)
  logos: AssetIndex;            // From registries/logos.json (if exists)
}

// Flat lookup structures built at load time:

interface VariableIndex {
  byName: Map<string, VariableEntry>;    // "color/background/neutral/boldest" → entry
  bySegment: Map<string, VariableEntry[]>; // "spacing/md" → [all matches]
}

interface VariableEntry {
  name: string;         // "layout/spacing/medium"
  key: string;          // "VariableID:55:118"
  collection: string;   // "layout"
}

interface ComponentIndex {
  byName: Map<string, ComponentEntry>;   // "Button" → entry (case-insensitive)
}

interface ComponentEntry {
  name: string;
  key: string;
  type: "COMPONENT" | "COMPONENT_SET";
  properties: Record<string, string>;
  variants?: number;
}

interface TextStyleIndex {
  byName: Map<string, TextStyleEntry>;   // "heading/xl/regular" → entry
  bySegment: Map<string, TextStyleEntry[]>; // "heading/xl" → [regular, accent, ...]
}
```

### 3.3 Resolution Algorithm

```
resolveTokenRef(ref: string, registry: Registry) → ResolvedToken | Error

1. Strip the "$" prefix.
2. Determine category from first segment:
   - "spacing/*", "radius/*"  → registry.variables (layout collection)
   - "color/*"                → registry.variables (color collection)
   - "text/*"                 → registry.textStyles
   - "effect/*"               → registry.effectStyles
   - "comp/*"                 → registry.components
   - "icon/*"                 → registry.icons
   - "logo/*"                 → registry.logos

3. Build search segments from remaining path:
   - "$spacing/md" → search for variable name containing "spacing" AND ("medium" OR "md")
   - "$color/bg/neutral/default" → search for name containing "background" OR "bg", "neutral", "default"

4. Alias expansion (hardcoded):
   - "bg" → "background"
   - "fg" → "foreground"
   - "xs" → "xsmall"
   - "sm" → "small"
   - "md" → "medium"
   - "lg" → "large"
   - "xl" → "xlarge"
   - "xxl" → "xxlarge"

5. Score candidates:
   - Exact name match (after alias expansion) → score 100
   - All segments present in name → score 80
   - Partial segment match → score 40

6. Return highest-scoring candidate.
   If no candidate scores > 40, emit CompilerError with fuzzy suggestions.
```

### 3.4 Resolved Token Output

After resolution, every `$token` string in the graph is replaced with a `ResolvedToken`:

```typescript
interface ResolvedToken {
  ref: string;          // Original: "$spacing/md"
  key: string;          // Registry key: "VariableID:55:118"
  name: string;         // Full name: "layout/spacing/medium"
  kind: "variable" | "textStyle" | "effectStyle" | "component" | "icon" | "logo";
  importMethod: string; // "importVariableByKeyAsync" | "importStyleByKeyAsync" | ...
}
```

---

## 4. Component Resolution

### 4.1 Name-to-Key Resolution

```
resolveComponent(node: InstanceNode, registry: Registry) → ResolvedComponent | Error

1. Lookup node.component in registry.components.byName (case-insensitive).
   - "Button" → { key: "abc123...", type: "COMPONENT_SET", properties: {...} }

2. If not found in components, check icons, then logos.

3. Determine import method (Rule 11):
   - type == "COMPONENT_SET" → importComponentSetByKeyAsync
   - type == "COMPONENT"     → importComponentByKeyAsync

4. If not found anywhere → CompilerError with suggestions from all registries.
```

### 4.2 Variant Matching

When a component is a COMPONENT_SET and `node.variant` is provided:

```
resolveVariant(node: InstanceNode, componentEntry: ComponentEntry) → VariantResolution

1. For each key in node.variant:
   - Verify the key exists in componentEntry.properties as a VARIANT(...) type.
   - Verify the value is one of the allowed values in VARIANT(...).
   - If not → CompilerError listing allowed values.

2. Build the variant selection string:
   - { "size": "large", "variant": "primary" } → findChild matching
     `n.name.includes("size=large") && n.name.includes("variant=primary")`

3. Output: code that finds the correct variant child and calls createInstance() on it.
```

### 4.3 Property Override Validation

```
validateProperties(node: InstanceNode, componentEntry: ComponentEntry) → Error[]

1. For each key in node.properties:
   - Verify key exists (by prefix) in componentEntry.properties.
   - Verify type compatibility:
     - TEXT property → value must be string
     - BOOLEAN property → value must be boolean
     - INSTANCE_SWAP → value must resolve to a component key

2. For each key in node.swaps:
   - Verify key exists as INSTANCE_SWAP in componentEntry.properties.
   - Resolve swap value as a component reference.
```

---

## 5. Compilation Pipeline

Six stages, strictly sequential. Each stage's output is the next stage's input.

```
Input JSON → [1. PARSE] → [2. RESOLVE] → [3. VALIDATE] → [4. PLAN] → [5. CODEGEN] → [6. WRAP] → Output script(s)
```

### Stage 1: PARSE

**Input:** Raw JSON string (from file or stdin).
**Output:** Typed `SceneGraph` object.
**Operations:**
- JSON.parse with try/catch → clear error on malformed JSON.
- Validate `version` field is `"3.0"`.
- Validate every node has required fields for its `type` (via `schema.js`).
- Expand shorthand: `padding: "$spacing/lg"` → four individual padding props.
- Assign default values: `visible: true`, `strokeAlign: "INSIDE"`, `autoResize: "HEIGHT"`.

**Errors:** `PARSE_INVALID_JSON`, `PARSE_UNKNOWN_NODE_TYPE`, `PARSE_MISSING_FIELD`.

### Stage 2: RESOLVE

**Input:** Parsed `SceneGraph` + loaded `Registry`.
**Output:** `ResolvedSceneGraph` — all `$token` strings replaced with `ResolvedToken` objects.
**Operations:**
- Walk every node recursively.
- Resolve all `$token` references (variables, components, text styles, effects).
- Expand REPEAT nodes → N copies with data bindings.
- Evaluate CONDITIONAL nodes → include/exclude children.
- Resolve CLONE sourceRef → link to source node's ID.
- Resolve INSTANCE swap values → component keys.
- Collect all unique import keys for the preload phase.

**Errors:** `RESOLVE_TOKEN_NOT_FOUND`, `RESOLVE_COMPONENT_NOT_FOUND`, `RESOLVE_VARIANT_INVALID`, `RESOLVE_CLONE_REF_MISSING`.

### Stage 3: VALIDATE

**Input:** `ResolvedSceneGraph`.
**Output:** Same graph (pass-through if valid), or error list.
**Operations:**
- **Rule 3 check:** FILL child inside AUTO parent → error.
- **Rule 18 audit:** Any RECTANGLE/ELLIPSE node that matches a component name → warning.
- **Orphan detection:** CLONE nodes whose sourceRef doesn't exist.
- **Sizing coherence:** Frame with `width` but `primaryAxisSizing: "AUTO"` on the same axis → warning (resize overrides).
- **Text node requirements:** TEXT without `textStyle` → error.
- **Instance children:** INSTANCE with `children` → error (Rule 14).

**Errors:** `VALIDATE_FILL_IN_AUTO_PARENT`, `VALIDATE_RAW_SHAPE_HAS_DS_MATCH`, `VALIDATE_ORPHAN_CLONE`, `VALIDATE_TEXT_NO_STYLE`, `VALIDATE_INSTANCE_HAS_CHILDREN`.

### Stage 4: PLAN

**Input:** Validated `ResolvedSceneGraph`.
**Output:** `ExecutionPlan` — ordered list of code chunks.

```typescript
interface ExecutionPlan {
  chunks: Chunk[];
  totalImports: number;
  estimatedCodeSize: number;  // bytes
}

interface Chunk {
  index: number;
  label: string;              // "preload" | "build-1" | "build-2" | ...
  imports: ResolvedToken[];   // Variables, components, styles to import in this chunk
  nodes: ResolvedNode[];      // Nodes to create in this chunk
  bridgeExports: string[];    // Names to set on globalThis for next chunk
  bridgeImports: string[];    // Names to read from globalThis from previous chunk
}
```

See Section 7 (Chunking Strategy) for splitting logic.

### Stage 5: CODEGEN

**Input:** Single `Chunk` from the plan.
**Output:** Raw JavaScript code string (unwrapped).
**Operations:**
- Emit import statements for all `chunk.imports`.
- Emit helper functions (from `helpers.js`).
- Walk `chunk.nodes` depth-first, emitting Figma Plugin API calls.
- Enforce all 26 rules via codegen patterns (see Section 6).
- Emit globalThis bridging for multi-chunk plans.

### Stage 6: WRAP

**Input:** Raw code string + transport config.
**Output:** Final executable script string.
**Operations:**
- **Console transport:** Wrap in `return (async function() { ... })();` (Rule 17, 23).
- **Official transport:** Leave as top-level await, no IIFE (Rule 23).
- Prepend font loading (Rule 16).
- For official: validate `fileKey` is present in metadata.
- Strip any `figma.notify()` calls for official transport (Rule 23).
- Append `return { success: true, rootId: root.id };`.

---

## 6. Codegen Rules

How each of the 26 Figma API rules is enforced by the compiler's code generation.

### Rule 1: FILL after appendChild

**Codegen pattern:** The codegen walker ALWAYS emits `parent.appendChild(child)` BEFORE any `layoutSizingHorizontal/Vertical` assignment. The node creation and the append are never in the same statement block.

```javascript
// Generated code for a FRAME with fillH: true
var frame_sidebar = figma.createFrame();
frame_sidebar.name = "Sidebar";
// ... configure props that DON'T require parent ...
root.appendChild(frame_sidebar);          // ← append FIRST
frame_sidebar.layoutSizingHorizontal = "FILL";  // ← THEN sizing
frame_sidebar.layoutSizingVertical = "FILL";
```

### Rule 2: Absolute positioning after appendChild

**Codegen pattern:** `layoutPositioning = "ABSOLUTE"` is emitted in the post-append block, after `appendChild`, alongside x/y coordinates.

```javascript
parent.appendChild(circle_badge);
circle_badge.layoutPositioning = "ABSOLUTE";
circle_badge.x = 100;
circle_badge.y = 50;
```

### Rule 3: FILL + AUTO parent = collapsed layout

**Enforcement:** The validate stage checks every FILL child's parent. If the parent has `primaryAxisSizing: "AUTO"`, emit error `VALIDATE_FILL_IN_AUTO_PARENT`. The codegen stage never produces this combination.

### Rule 4: resize() overrides sizing modes

**Codegen pattern:** `resize()` is ALWAYS emitted first, then sizing modes immediately after.

```javascript
frame_content.resize(700, 10);
frame_content.primaryAxisSizingMode = "AUTO";    // ← AFTER resize
frame_content.counterAxisSizingMode = "FIXED";
```

### Rule 5: counterAxisAlignItems for cross-axis centering

**Codegen pattern:** The schema accepts `primaryAxisAlign` and `counterAxisAlign` as semantic names. Codegen maps:

```javascript
// layout: "VERTICAL", counterAxisAlign: "CENTER"
frame.layoutMode = "VERTICAL";
frame.counterAxisAlignItems = "CENTER";  // Horizontal centering in vertical layout
frame.primaryAxisAlignItems = "MIN";
```

### Rule 6: Always bind spacing variables

**Enforcement:** The resolve stage ensures every `gap`, `padding*`, `radius*` value is a `$token` reference. If a raw number is provided, the parse stage emits `PARSE_RAW_VALUE_NOT_ALLOWED` for spacing/radius fields. Codegen always emits `setBoundVariable()`:

```javascript
frame.setBoundVariable('itemSpacing', var_spacing_md);
frame.setBoundVariable('paddingTop', var_spacing_lg);
// ... etc
```

### Rule 7: Colors via setBoundVariableForPaint

**Codegen pattern:** Any `fill` property on a FRAME, RECTANGLE, or ELLIPSE emits the `mf()` helper call, never `setBoundVariable('fills', ...)`:

```javascript
frame.fills = mf(var_color_bg_neutral);
```

For TEXT nodes with a `fill` override:

```javascript
text.fills = mf(var_color_text_accent);
```

### Rule 8: Text styles via importStyleByKeyAsync

**Enforcement:** TEXT nodes require a `textStyle` field (validate stage error if missing). Codegen always uses `importStyleByKeyAsync` + `setTextStyleIdAsync`:

```javascript
var style_heading_xl = await figma.importStyleByKeyAsync("930df26f...");
await text_title.setTextStyleIdAsync(style_heading_xl.id);
```

### Rule 9: Component properties

**Codegen pattern:** For INSTANCE nodes with `properties`, codegen emits `setProperties()` after instance creation. Property keys are resolved using the `findPropKey` pattern to handle hash suffixes (Rule 10):

```javascript
var instance_button = variant_primary.createInstance();
// Property setting uses the component's known property definitions
var defs = compSet_Button.componentPropertyDefinitions;
var labelKey = Object.keys(defs).find(function(k) { return k.startsWith("label") && defs[k].type === "TEXT"; });
if (labelKey) instance_button.setProperties({ [labelKey]: "Submit" });
```

### Rule 10: Property keys include hash suffix

**Codegen pattern:** Always use `findPropKey` helper to locate the real key by prefix + type. Never hardcode hash suffixes.

### Rule 11: importComponentSetByKeyAsync vs importComponentByKeyAsync

**Enforcement:** The resolve stage reads `type` from the component registry entry. Codegen emits the correct import API:

```javascript
// type === "COMPONENT_SET"
var compSet_Button = await figma.importComponentSetByKeyAsync("abc123...");
// type === "COMPONENT"
var comp_Divider = await figma.importComponentByKeyAsync("def456...");
```

### Rule 12: textAutoResize in auto-layout

**Codegen pattern:** For TEXT nodes, the order is strictly enforced:

```javascript
var text_desc = figma.createText();
text_desc.characters = "Long description text...";   // 1. Set characters
parent.appendChild(text_desc);                        // 2. Append
text_desc.layoutSizingHorizontal = "FILL";           // 3. FILL (if applicable)
text_desc.textAutoResize = "HEIGHT";                  // 4. textAutoResize LAST
```

### Rule 13: strokeAlign INSIDE for cards

**Codegen pattern:** When `stroke` is set, codegen always emits `strokeAlign` (default `"INSIDE"`):

```javascript
frame_card.strokes = mf(var_color_border);
frame_card.strokeWeight = 1;
frame_card.strokeAlign = "INSIDE";
```

### Rule 14: Cannot add children to instances

**Enforcement:** The validate stage rejects INSTANCE nodes that have `children`. Codegen never emits `appendChild` on instance variables.

### Rule 15: Variant grid layout after combineAsVariants

**Not applicable to the compiler.** The compiler creates instances of existing components, not new component definitions. This rule only matters for DS library authoring scripts.

### Rule 16: loadFontAsync before ANY text operation

**Codegen pattern:** The `fonts` array from the scene graph metadata is emitted at the very top of the script, before any node creation:

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
// ... all fonts from metadata.fonts
```

### Rule 17: Script structure (IIFE)

**Enforcement:** The wrap stage handles this. Console transport wraps in IIFE. Official transport does not. See Section 8.

### Rule 18: DS component reuse

**Enforcement:** The validate stage checks every RECTANGLE and ELLIPSE node name against the component registry. If a match is found (e.g., a RECTANGLE named "Divider" when a Divider component exists), it emits `VALIDATE_RAW_SHAPE_HAS_DS_MATCH` as a warning. This mirrors the pre-script audit requirement.

### Rule 19: Canvas positioning

**Codegen pattern:** The root frame is always positioned explicitly. For multi-root graphs (not typical), codegen spaces them 80px apart:

```javascript
root.x = 0;
root.y = 0;
```

### Rule 20: Component key vs Node ID

**Enforcement:** The registry loader (`registry.js`) validates that all keys look like component keys (40-char hex) or variable keys (VariableID:... pattern), not node IDs (digit:digit). If a registry entry has a node-ID-shaped key, it emits a warning at load time.

### Rule 21: setTextStyleIdAsync (not textStyleId)

**Codegen pattern:** Always emit the async version:

```javascript
await text_title.setTextStyleIdAsync(style.id);
```

Never emit `text.textStyleId = style.id`.

### Rule 22: Clone-first for screens with reference

**Codegen pattern:** CLONE nodes emit `getNodeByIdAsync` + `clone()`:

```javascript
var ref_sidebar = await figma.getNodeByIdAsync("9569:40232");
var clone_sidebar = ref_sidebar.clone();
clone_sidebar.name = "Sidebar";
parent.appendChild(clone_sidebar);
// Apply overrides
var title_in_clone = clone_sidebar.findOne(function(n) { return n.name === "title" && n.type === "TEXT"; });
if (title_in_clone) title_in_clone.characters = "New Title";
```

### Rule 23: Transport-aware scripting

**Enforcement:** The wrap stage. See Section 8.

### Rule 24: Never screenshot a page or empty node

**Not a codegen concern.** This rule applies to the workflow orchestrator (Claude), not the compiler. The compiler only generates creation scripts.

### Rule 25: Input/Select → swap to filled state

**Codegen pattern:** When an INSTANCE node targets a form component (TextInput, SelectInput, etc.) and has property overrides that set values, codegen emits variant finding for the `filled` state:

```javascript
var compSet_TextInput = await figma.importComponentSetByKeyAsync("...");
var filled = compSet_TextInput.findChild(function(n) {
  return n.name.includes("state=filled");
});
var instance_input = (filled || compSet_TextInput.defaultVariant).createInstance();
```

The compiler detects "form components" by checking if the component's properties include a `state` VARIANT with `filled` or `filling` as an option, and the INSTANCE node's `variant.state` is set to `"filled"`.

### Rule 26: Validate registry keys before writing scripts

**Enforcement:** The resolve stage validates every resolved key against the registry. Keys that don't match the expected format (40-char hex for components/styles, VariableID:... for variables) emit `RESOLVE_INVALID_KEY_FORMAT`. The codegen stage only emits keys that passed resolution.

---

## 7. Chunking Strategy

### 7.1 Why Chunk

Figma Plugin API scripts have practical execution limits. Large scripts (100+ node operations) can time out or hit memory constraints. Additionally, the official transport has a **20KB response limit** (Rule 23).

### 7.2 Threshold

```
MAX_CHUNK_SIZE = 12000  // characters of generated code (before wrapping)
MAX_IMPORTS_PER_CHUNK = 30  // variable/component/style imports
```

If a single chunk exceeds either limit, it is split.

### 7.3 Splitting Strategy

**Chunk 0: Preload** — All imports (variables, components, styles). Stores loaded references on `globalThis`.

**Chunk 1..N: Build** — Nodes to create. Each chunk reads its dependencies from `globalThis`.

Split points are chosen at **sibling boundaries** in the node tree. The compiler never splits a parent from its children — a frame and all its descendants are always in the same chunk.

```
Algorithm:
1. Generate code for all nodes (without wrapping).
2. If total code size < MAX_CHUNK_SIZE and imports < MAX_IMPORTS_PER_CHUNK:
   → Single chunk. No preload/build split needed.
3. Else:
   → Chunk 0 = preload (all imports, store on globalThis)
   → Walk top-level children of root frame.
   → Accumulate children into current build chunk.
   → When accumulated size exceeds MAX_CHUNK_SIZE, start new chunk.
   → Each build chunk reads imports from globalThis.
```

### 7.4 globalThis Bridging

Preload chunk stores all imported references:

```javascript
// Preload chunk (Chunk 0)
globalThis.__bridge = {};
globalThis.__bridge.var_spacing_md = await figma.variables.importVariableByKeyAsync("...");
globalThis.__bridge.var_color_bg = await figma.variables.importVariableByKeyAsync("...");
globalThis.__bridge.compSet_Button = await figma.importComponentSetByKeyAsync("...");
globalThis.__bridge.style_heading_xl = await figma.importStyleByKeyAsync("...");
globalThis.__bridge.root = figma.createFrame();
globalThis.__bridge.root.name = "MyScreen";
globalThis.__bridge.root.resize(1440, 900);
figma.currentPage.appendChild(globalThis.__bridge.root);
return { success: true, rootId: globalThis.__bridge.root.id };
```

Build chunks read from the bridge:

```javascript
// Build chunk (Chunk 1)
var b = globalThis.__bridge;
var root = b.root;
var var_spacing_md = b.var_spacing_md;
// ... use these to create nodes ...
return { success: true };
```

### 7.5 Single-Chunk Optimization

When the entire graph fits in one chunk, no `globalThis` bridging is emitted. Imports and node creation happen in the same script. This is the common case for most screens.

---

## 8. Transport Adaptation

The wrap stage produces different output based on the target transport.

### 8.1 Console Transport (figma_execute)

```javascript
// Output: single string passed as { code: "..." }
return (async function() {
  // ── FONTS ──
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  // ...

  // ── HELPERS ──
  function mf(colorVar) { /* ... */ }
  function appendFill(parent, child, fillH, fillV) { /* ... */ }
  function bindPadding(frame, top, right, bottom, left) { /* ... */ }
  function bindRadius(frame, radiusVar) { /* ... */ }

  // ── IMPORTS ──
  var var_spacing_md = await figma.variables.importVariableByKeyAsync("...");
  // ...

  // ── BUILD ──
  var root = figma.createFrame();
  // ...

  return { success: true, rootId: root.id };
})();
```

### 8.2 Official Transport (use_figma)

```javascript
// Output: single string passed as { fileKey: "...", description: "...", code: "..." }
// NO IIFE. Top-level await.

// ── FONTS ──
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
// ...

// ── HELPERS ──
function mf(colorVar) { /* ... */ }
function appendFill(parent, child, fillH, fillV) { /* ... */ }
function bindPadding(frame, top, right, bottom, left) { /* ... */ }
function bindRadius(frame, radiusVar) { /* ... */ }

// ── IMPORTS ──
var var_spacing_md = await figma.variables.importVariableByKeyAsync("...");
// ...

// ── BUILD ──
var root = figma.createFrame();
// ...

return { success: true, rootId: root.id };
```

### 8.3 Transport-Specific Sanitization

Before wrapping, the wrap stage scans the generated code:

- **Official transport:**
  - Remove any `figma.notify(...)` calls.
  - Replace `getPluginData(...)` with `getSharedPluginData(...)`.
  - Verify total code size is under 20KB. If over, the plan stage must have split into chunks.

- **Console transport:**
  - Verify the IIFE return is present.
  - No additional sanitization needed.

### 8.4 Multi-Chunk Transport Differences

For multi-chunk plans, each chunk is wrapped independently:

| Aspect | Console | Official |
|--------|---------|----------|
| Chunk 0 (preload) | `return (async function() { ... })();` | Top-level await, needs `fileKey` |
| Chunk N (build) | `return (async function() { ... })();` | Top-level await, needs `fileKey` |
| Invocation | `figma_execute({ code })` | `use_figma({ fileKey, description, code })` |
| Description field | Not needed | Auto-generated: `"Bridge compiler: chunk N of M — {label}"` |

---

## 9. Error Format

### 9.1 Error Object

```typescript
interface CompilerError {
  code: string;            // e.g. "RESOLVE_TOKEN_NOT_FOUND"
  severity: "error" | "warning";
  message: string;         // Human-readable message
  node?: string;           // Node name where the error occurred
  path?: string;           // JSON path: "nodes[2].children[0].fill"
  suggestion?: string[];   // Fuzzy match suggestions
}
```

### 9.2 Error Codes

| Code | Severity | Trigger |
|------|----------|---------|
| `PARSE_INVALID_JSON` | error | Malformed JSON input |
| `PARSE_UNKNOWN_NODE_TYPE` | error | `type` is not one of the 8 valid types |
| `PARSE_MISSING_FIELD` | error | Required field missing (e.g. TEXT without `characters`) |
| `PARSE_RAW_VALUE_NOT_ALLOWED` | error | Raw number in spacing/radius/color field instead of `$token` |
| `RESOLVE_TOKEN_NOT_FOUND` | error | `$token` ref has no match in registry |
| `RESOLVE_COMPONENT_NOT_FOUND` | error | Component name not in any registry |
| `RESOLVE_VARIANT_INVALID` | error | Variant value not in component's VARIANT(...) options |
| `RESOLVE_CLONE_REF_MISSING` | error | CLONE `sourceRef` doesn't match any node `id` |
| `RESOLVE_INVALID_KEY_FORMAT` | error | Registry key looks like a node ID instead of a component key |
| `VALIDATE_FILL_IN_AUTO_PARENT` | error | FILL child in AUTO-sized parent (Rule 3) |
| `VALIDATE_RAW_SHAPE_HAS_DS_MATCH` | warning | RECTANGLE/ELLIPSE name matches a DS component (Rule 18) |
| `VALIDATE_ORPHAN_CLONE` | error | CLONE with broken sourceRef |
| `VALIDATE_TEXT_NO_STYLE` | error | TEXT node missing `textStyle` |
| `VALIDATE_INSTANCE_HAS_CHILDREN` | error | INSTANCE node with children (Rule 14) |
| `WRAP_MISSING_FILEKEY` | error | Official transport but no `fileKey` in metadata |
| `WRAP_CODE_TOO_LARGE` | error | Single chunk exceeds 20KB for official transport |

### 9.3 Fuzzy Suggestions

When a token or component is not found, `errors.js` provides up to 3 closest matches using Levenshtein distance:

```typescript
function suggest(query: string, candidates: string[], maxResults = 3): string[] {
  // 1. Compute Levenshtein distance between query and each candidate
  // 2. Sort by distance ascending
  // 3. Return top maxResults where distance < query.length * 0.6
}
```

Example error output:

```
ERROR RESOLVE_TOKEN_NOT_FOUND at nodes[3].children[1].fill
  Token "$color/bg/nuetral/default" not found in registry.
  Did you mean:
    - $color/background/neutral/default  (layout/color collection)
    - $color/background/neutral/boldest  (layout/color collection)
    - $color/background/neutral/bolder   (layout/color collection)
```

### 9.4 CLI Error Output

Errors are printed to stderr in a structured format:

```
[bridge-compiler] 2 errors, 1 warning

  ERROR  RESOLVE_TOKEN_NOT_FOUND  nodes[3].children[1].fill
         Token "$color/bg/nuetral/default" not found in registry.
         Did you mean: $color/background/neutral/default

  ERROR  VALIDATE_FILL_IN_AUTO_PARENT  nodes[0].children[2]
         Node "ContentArea" has fillV=true but parent "Main" has primaryAxisSizing="AUTO".
         Fix: set parent primaryAxisSizing to "FIXED" or remove fillV from child.

  WARN   VALIDATE_RAW_SHAPE_HAS_DS_MATCH  nodes[1]
         RECTANGLE "Divider" matches DS component "Divider" (key: def456...).
         Consider using INSTANCE type instead.
```

---

## 10. CLI Interface

### 10.1 Invocation

```bash
node lib/compiler/compile.js \
  --input <path-to-scene-graph.json> \
  --kb <path-to-knowledge-base-dir> \
  --transport <console|official> \
  --file-key <figma-file-key>          # required if transport=official
  --out <output-dir>                   # default: stdout
  --chunk-index <N>                    # optional: emit only chunk N (for sequential execution)
  --dry-run                            # validate only, don't emit code
  --verbose                            # print resolution details to stderr
```

### 10.2 Output

**Single chunk (stdout):**
```bash
node lib/compiler/compile.js --input scene.json --kb ./knowledge-base --transport console
# Prints the wrapped script to stdout
```

**Multi-chunk (output directory):**
```bash
node lib/compiler/compile.js --input scene.json --kb ./knowledge-base --transport console --out ./build
# Creates:
#   build/chunk-0-preload.js
#   build/chunk-1-build.js
#   build/chunk-2-build.js
#   build/plan.json          ← execution plan metadata
```

**Dry run:**
```bash
node lib/compiler/compile.js --input scene.json --kb ./knowledge-base --dry-run
# Prints validation results to stderr, exits 0 if valid, 1 if errors
```

### 10.3 plan.json Format

```json
{
  "version": "3.0",
  "chunks": [
    {
      "index": 0,
      "label": "preload",
      "file": "chunk-0-preload.js",
      "imports": 24,
      "estimatedSize": 3200
    },
    {
      "index": 1,
      "label": "build-1",
      "file": "chunk-1-build.js",
      "imports": 0,
      "estimatedSize": 9800
    }
  ],
  "transport": "console",
  "totalChunks": 2
}
```

### 10.4 Programmatic API

```javascript
const { compile } = require('./lib/compiler/compile');

const result = compile({
  input: sceneGraphJSON,       // string or parsed object
  kbPath: './knowledge-base',
  transport: 'console',
  fileKey: null,               // required for official
});

// result: {
//   success: boolean,
//   errors: CompilerError[],
//   warnings: CompilerError[],
//   chunks: Array<{ index, label, code }>,
//   plan: ExecutionPlan,
// }
```

---

## 11. Integration with CSpec YAML

### 11.1 Responsibility Boundary

The compiler accepts **JSON only**. It does not parse YAML.

The conversion from CSpec YAML (or any other spec format) to the scene graph JSON is Claude's responsibility. This is a deliberate design choice:

1. **Claude reads the CSpec YAML** — understands the design intent, layout structure, component choices.
2. **Claude produces the scene graph JSON** — translating design decisions into the compiler's input format.
3. **The compiler compiles JSON to Figma code** — deterministic, auditable, rule-enforced.

This separation means:
- The compiler is a **pure function**: same JSON always produces the same code.
- Claude's creative/design decisions happen before the compiler.
- The compiler's rule enforcement happens after Claude's decisions.
- No YAML parser dependency in the compiler.

### 11.2 Alternative: Preprocessing Step

If a future version wants automated YAML-to-JSON, it would be a separate module:

```
lib/compiler/
├── yaml-to-scene.js    # Optional: CSpec YAML → scene graph JSON
```

This is NOT part of the v3.0 compiler. It is noted here as a possible extension point.

### 11.3 Claude's Workflow

```
1. Claude reads CSpec YAML from specs/active/my-screen.yaml
2. Claude reads KB registries (via quick-bundle.md or registry files)
3. Claude writes scene graph JSON (inline or to temp file)
4. Claude invokes: node lib/compiler/compile.js --input /tmp/scene.json --kb <kb-path> --transport console
5. Compiler outputs script(s)
6. Claude executes script(s) via figma_execute / use_figma
```

### 11.4 Scene Graph Authoring Guidelines for Claude

When Claude converts a CSpec to a scene graph:

- Every spacing/padding/radius value MUST be a `$token` reference — never raw pixels.
- Every color MUST be a `$token` reference — never hex codes.
- Every text node MUST have a `textStyle` reference.
- Every component that exists in the DS MUST be an INSTANCE node, not a FRAME/RECTANGLE.
- Use CLONE only for reference-based elements or local/unpublished components.
- Use REPEAT for lists, table rows, grid items with repeating structure.
- Use CONDITIONAL sparingly — prefer resolving conditions before scene graph creation.
- The `name` field on every node should be descriptive (it becomes the Figma layer name).
- Root frame dimensions come from the CSpec's canvas size or default to 1440x900.

---

## Appendix A: Complete Scene Graph Example

```json
{
  "version": "3.0",
  "metadata": {
    "name": "Settings Page",
    "description": "User settings with sidebar navigation",
    "width": 1440,
    "height": 900
  },
  "fonts": [
    { "family": "Inter", "style": "Regular" },
    { "family": "Inter", "style": "Medium" },
    { "family": "Inter", "style": "Semi Bold" }
  ],
  "nodes": [
    {
      "type": "FRAME",
      "name": "Sidebar",
      "id": "sidebar",
      "layout": "VERTICAL",
      "width": 280,
      "fillV": true,
      "primaryAxisSizing": "FIXED",
      "counterAxisSizing": "FIXED",
      "fill": "$color/background/neutral/bolder",
      "padding": "$spacing/lg",
      "gap": "$spacing/sm",
      "children": [
        {
          "type": "TEXT",
          "name": "SidebarTitle",
          "characters": "Settings",
          "textStyle": "$text/heading/lg/accent",
          "fill": "$color/text/neutral/boldest"
        },
        {
          "type": "INSTANCE",
          "name": "NavItem-Profile",
          "component": "SidebarNavItem",
          "variant": { "state": "active" },
          "properties": { "label": "Profile" }
        },
        {
          "type": "INSTANCE",
          "name": "NavItem-Security",
          "component": "SidebarNavItem",
          "variant": { "state": "default" },
          "properties": { "label": "Security" }
        }
      ]
    },
    {
      "type": "FRAME",
      "name": "Content",
      "layout": "VERTICAL",
      "fillH": true,
      "fillV": true,
      "primaryAxisSizing": "AUTO",
      "padding": "$spacing/xl",
      "gap": "$spacing/lg",
      "fill": "$color/background/neutral/default",
      "children": [
        {
          "type": "TEXT",
          "name": "PageTitle",
          "characters": "Profile Settings",
          "textStyle": "$text/heading/xl/regular"
        },
        {
          "type": "FRAME",
          "name": "FormSection",
          "layout": "VERTICAL",
          "fillH": true,
          "primaryAxisSizing": "AUTO",
          "gap": "$spacing/md",
          "children": [
            {
              "type": "INSTANCE",
              "name": "Input-FirstName",
              "component": "TextInput",
              "variant": { "size": "medium", "state": "filled" },
              "properties": { "label": "First Name", "placeholder": "John" },
              "fillH": true
            },
            {
              "type": "INSTANCE",
              "name": "Input-LastName",
              "component": "TextInput",
              "variant": { "size": "medium", "state": "filled" },
              "properties": { "label": "Last Name", "placeholder": "Doe" },
              "fillH": true
            }
          ]
        },
        {
          "type": "FRAME",
          "name": "Actions",
          "layout": "HORIZONTAL",
          "primaryAxisSizing": "AUTO",
          "counterAxisAlign": "CENTER",
          "gap": "$spacing/md",
          "children": [
            {
              "type": "INSTANCE",
              "name": "SaveButton",
              "component": "Button",
              "variant": { "variant": "primary", "size": "large" },
              "properties": { "label": "Save Changes" }
            },
            {
              "type": "INSTANCE",
              "name": "CancelButton",
              "component": "Button",
              "variant": { "variant": "ghost", "size": "large" },
              "properties": { "label": "Cancel" }
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Appendix B: Generated Code for Example (Console Transport, Single Chunk)

```javascript
return (async function() {

  // ── FONTS ──
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });

  // ── HELPERS ──
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
  function findPropKey(compOrSet, prefix, type) {
    var defs = compOrSet.componentPropertyDefinitions;
    return Object.keys(defs).find(function(k) {
      return k.startsWith(prefix) && defs[k].type === type;
    });
  }

  // ── IMPORTS ──
  var var_spacing_sm = await figma.variables.importVariableByKeyAsync("VariableID:55:115");
  var var_spacing_md = await figma.variables.importVariableByKeyAsync("VariableID:55:118");
  var var_spacing_lg = await figma.variables.importVariableByKeyAsync("VariableID:55:119");
  var var_spacing_xl = await figma.variables.importVariableByKeyAsync("VariableID:55:120");
  var var_color_bg_neutral_bolder = await figma.variables.importVariableByKeyAsync("VariableID:19:115");
  var var_color_bg_neutral_default = await figma.variables.importVariableByKeyAsync("VariableID:19:116");
  var var_color_text_neutral_boldest = await figma.variables.importVariableByKeyAsync("VariableID:19:114");
  var style_heading_lg_accent = await figma.importStyleByKeyAsync("225299706052d97c...");
  var style_heading_xl_regular = await figma.importStyleByKeyAsync("930df26f44235299...");
  var compSet_SidebarNavItem = await figma.importComponentSetByKeyAsync("...");
  var compSet_TextInput = await figma.importComponentSetByKeyAsync("...");
  var compSet_Button = await figma.importComponentSetByKeyAsync("...");

  // ── BUILD ──

  // Root
  var root = figma.createFrame();
  root.name = "Settings Page";
  root.resize(1440, 900);
  root.layoutMode = "HORIZONTAL";
  root.primaryAxisSizingMode = "FIXED";
  root.counterAxisSizingMode = "FIXED";
  figma.currentPage.appendChild(root);

  // Sidebar
  var frame_Sidebar = figma.createFrame();
  frame_Sidebar.name = "Sidebar";
  frame_Sidebar.layoutMode = "VERTICAL";
  frame_Sidebar.resize(280, 10);
  frame_Sidebar.primaryAxisSizingMode = "FIXED";
  frame_Sidebar.counterAxisSizingMode = "FIXED";
  frame_Sidebar.fills = mf(var_color_bg_neutral_bolder);
  root.appendChild(frame_Sidebar);
  frame_Sidebar.layoutSizingVertical = "FILL";
  bindPadding(frame_Sidebar, var_spacing_lg, var_spacing_lg, var_spacing_lg, var_spacing_lg);
  frame_Sidebar.setBoundVariable('itemSpacing', var_spacing_sm);

  // Sidebar > SidebarTitle
  var text_SidebarTitle = figma.createText();
  text_SidebarTitle.characters = "Settings";
  await text_SidebarTitle.setTextStyleIdAsync(style_heading_lg_accent.id);
  text_SidebarTitle.fills = mf(var_color_text_neutral_boldest);
  frame_Sidebar.appendChild(text_SidebarTitle);
  text_SidebarTitle.textAutoResize = "HEIGHT";

  // Sidebar > NavItem-Profile (INSTANCE)
  var variant_NavItemProfile = compSet_SidebarNavItem.findChild(function(n) {
    return n.name.includes("state=active");
  });
  var inst_NavItemProfile = (variant_NavItemProfile || compSet_SidebarNavItem.defaultVariant).createInstance();
  inst_NavItemProfile.name = "NavItem-Profile";
  frame_Sidebar.appendChild(inst_NavItemProfile);
  var labelKey_NavItemProfile = findPropKey(compSet_SidebarNavItem, "label", "TEXT");
  if (labelKey_NavItemProfile) inst_NavItemProfile.setProperties({ [labelKey_NavItemProfile]: "Profile" });

  // Sidebar > NavItem-Security (INSTANCE)
  var variant_NavItemSecurity = compSet_SidebarNavItem.findChild(function(n) {
    return n.name.includes("state=default");
  });
  var inst_NavItemSecurity = (variant_NavItemSecurity || compSet_SidebarNavItem.defaultVariant).createInstance();
  inst_NavItemSecurity.name = "NavItem-Security";
  frame_Sidebar.appendChild(inst_NavItemSecurity);
  var labelKey_NavItemSecurity = findPropKey(compSet_SidebarNavItem, "label", "TEXT");
  if (labelKey_NavItemSecurity) inst_NavItemSecurity.setProperties({ [labelKey_NavItemSecurity]: "Security" });

  // Content
  var frame_Content = figma.createFrame();
  frame_Content.name = "Content";
  frame_Content.layoutMode = "VERTICAL";
  frame_Content.fills = mf(var_color_bg_neutral_default);
  root.appendChild(frame_Content);
  frame_Content.layoutSizingHorizontal = "FILL";
  frame_Content.layoutSizingVertical = "FILL";
  frame_Content.primaryAxisSizingMode = "AUTO";
  bindPadding(frame_Content, var_spacing_xl, var_spacing_xl, var_spacing_xl, var_spacing_xl);
  frame_Content.setBoundVariable('itemSpacing', var_spacing_lg);

  // Content > PageTitle
  var text_PageTitle = figma.createText();
  text_PageTitle.characters = "Profile Settings";
  await text_PageTitle.setTextStyleIdAsync(style_heading_xl_regular.id);
  frame_Content.appendChild(text_PageTitle);
  text_PageTitle.layoutSizingHorizontal = "FILL";
  text_PageTitle.textAutoResize = "HEIGHT";

  // Content > FormSection
  var frame_FormSection = figma.createFrame();
  frame_FormSection.name = "FormSection";
  frame_FormSection.layoutMode = "VERTICAL";
  frame_Content.appendChild(frame_FormSection);
  frame_FormSection.layoutSizingHorizontal = "FILL";
  frame_FormSection.primaryAxisSizingMode = "AUTO";
  frame_FormSection.setBoundVariable('itemSpacing', var_spacing_md);

  // FormSection > Input-FirstName (INSTANCE)
  var filled_InputFirstName = compSet_TextInput.findChild(function(n) {
    return n.name.includes("size=medium") && n.name.includes("state=filled");
  });
  var inst_InputFirstName = (filled_InputFirstName || compSet_TextInput.defaultVariant).createInstance();
  inst_InputFirstName.name = "Input-FirstName";
  frame_FormSection.appendChild(inst_InputFirstName);
  inst_InputFirstName.layoutSizingHorizontal = "FILL";
  var labelKey_InputFirstName = findPropKey(compSet_TextInput, "label", "TEXT");
  var placeholderKey_InputFirstName = findPropKey(compSet_TextInput, "placeholder", "TEXT");
  if (labelKey_InputFirstName) inst_InputFirstName.setProperties({ [labelKey_InputFirstName]: "First Name" });
  if (placeholderKey_InputFirstName) inst_InputFirstName.setProperties({ [placeholderKey_InputFirstName]: "John" });

  // FormSection > Input-LastName (INSTANCE)
  var filled_InputLastName = compSet_TextInput.findChild(function(n) {
    return n.name.includes("size=medium") && n.name.includes("state=filled");
  });
  var inst_InputLastName = (filled_InputLastName || compSet_TextInput.defaultVariant).createInstance();
  inst_InputLastName.name = "Input-LastName";
  frame_FormSection.appendChild(inst_InputLastName);
  inst_InputLastName.layoutSizingHorizontal = "FILL";
  var labelKey_InputLastName = findPropKey(compSet_TextInput, "label", "TEXT");
  var placeholderKey_InputLastName = findPropKey(compSet_TextInput, "placeholder", "TEXT");
  if (labelKey_InputLastName) inst_InputLastName.setProperties({ [labelKey_InputLastName]: "Last Name" });
  if (placeholderKey_InputLastName) inst_InputLastName.setProperties({ [placeholderKey_InputLastName]: "Doe" });

  // Content > Actions
  var frame_Actions = figma.createFrame();
  frame_Actions.name = "Actions";
  frame_Actions.layoutMode = "HORIZONTAL";
  frame_Content.appendChild(frame_Actions);
  frame_Actions.primaryAxisSizingMode = "AUTO";
  frame_Actions.counterAxisAlignItems = "CENTER";
  frame_Actions.setBoundVariable('itemSpacing', var_spacing_md);

  // Actions > SaveButton (INSTANCE)
  var variant_SaveButton = compSet_Button.findChild(function(n) {
    return n.name.includes("variant=primary") && n.name.includes("size=large");
  });
  var inst_SaveButton = (variant_SaveButton || compSet_Button.defaultVariant).createInstance();
  inst_SaveButton.name = "SaveButton";
  frame_Actions.appendChild(inst_SaveButton);
  var labelKey_SaveButton = findPropKey(compSet_Button, "label", "TEXT");
  if (labelKey_SaveButton) inst_SaveButton.setProperties({ [labelKey_SaveButton]: "Save Changes" });

  // Actions > CancelButton (INSTANCE)
  var variant_CancelButton = compSet_Button.findChild(function(n) {
    return n.name.includes("variant=ghost") && n.name.includes("size=large");
  });
  var inst_CancelButton = (variant_CancelButton || compSet_Button.defaultVariant).createInstance();
  inst_CancelButton.name = "CancelButton";
  frame_Actions.appendChild(inst_CancelButton);
  var labelKey_CancelButton = findPropKey(compSet_Button, "label", "TEXT");
  if (labelKey_CancelButton) inst_CancelButton.setProperties({ [labelKey_CancelButton]: "Cancel" });

  return { success: true, rootId: root.id };
})();
```
