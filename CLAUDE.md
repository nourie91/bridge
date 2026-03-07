# Bridge — Claude Code Instructions

Bridge connects Claude Code to Figma via a WebSocket bridge. You can create frames, import components, bind variables, and apply text styles — all through scripts executed in the Figma Plugin API.

## Quick Start

```bash
# 1. Start the server
node server/server.js

# 2. Open your Figma file + run the Bridge plugin
# 3. Verify connection
curl -s http://localhost:9001/status
```

## Sending Commands

**Every command MUST include `"action": "runScript"`.** Without it, the plugin silently ignores the message.

```bash
cat script.js | jq -Rs '{"action":"runScript","code":.}' | \
  curl -s --max-time 60 -X POST http://localhost:9001/command \
  -H "Content-Type: application/json" -d @-
```

## Script Structure

Every script must follow this pattern:

```javascript
return (async function() {
  // 1. Load fonts (required before ANY text operation)
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  // 2. Import your DS assets
  // var myVar = await figma.variables.importVariableByKeyAsync("key-from-registries");
  // var myStyle = await figma.importStyleByKeyAsync("key-from-registries");
  // var myComp = await figma.importComponentByKeyAsync("key-from-registries");

  // 3. Build
  // ...

  // 4. Return summary
  return { success: true };
})();
```

The `return` before the IIFE is mandatory — without it the Promise is lost.

## Atomic Generation (MANDATORY)

Never generate a full design in one script. Split into 4-6 small sequential steps (~30-80 lines each).

**Standard steps for a screen:**

| Step | What | Returns |
|------|------|---------|
| 1. Structure | Root frame + section frames (empty) | rootId, sectionIds |
| 2. Top bar / Nav | Populate nav with DS components | — |
| 3. Content sections | One step per major section | sectionId |
| 4. Footer / minor | Secondary elements | — |
| 5. Instance overrides | Set TEXT/ICON props on instances | — |
| 6. States | Clone root + modify per state | stateIds |

**After each step:** verify visually with `get_screenshot` via Figma MCP before proceeding. Fix issues before moving on.

## Figma Plugin API — Mandatory Rules

These rules are learned from real bugs. Breaking them = broken layout.

### Rule 1: FILL after appendChild (CRITICAL)

`layoutSizingHorizontal = "FILL"` only works on children of auto-layout frames.

```javascript
// WRONG — crashes
child.layoutSizingHorizontal = "FILL";
parent.appendChild(child);

// CORRECT
parent.appendChild(child);
child.layoutSizingHorizontal = "FILL";
```

### Rule 2: resize() overrides sizing modes (CRITICAL)

`resize()` forces both axes to FIXED. Set sizing modes AFTER resize.

```javascript
// CORRECT — resize first, then set modes
frame.resize(700, 10);
frame.primaryAxisSizingMode = "AUTO";
frame.counterAxisSizingMode = "FIXED";
```

### Rule 3: FILL + AUTO parent = collapsed layout

A child with `FILL` inside a parent with `primaryAxisSizingMode = "AUTO"` collapses to 0px.

```javascript
// CORRECT — parent must be FIXED for FILL children
root.primaryAxisSizingMode = "FIXED";
root.resize(1440, 900);
mainArea.layoutSizingVertical = "FILL";
```

### Rule 4: Colors via setBoundVariableForPaint

Fills and strokes use a different API than layout properties.

```javascript
// CORRECT
function makeColorFill(colorVar) {
  var p = figma.util.solidPaint("#000000");
  p = figma.variables.setBoundVariableForPaint(p, "color", colorVar);
  return [p];
}
frame.fills = makeColorFill(myColorVar);
```

### Rule 5: Text styles via importStyleByKeyAsync

Never hardcode font properties. Always use text styles from your library.

```javascript
var style = await figma.importStyleByKeyAsync("your-text-style-key");
textNode.textStyleId = style.id;
```

### Rule 6: textAutoResize — set AFTER node has width

Setting `textAutoResize = "HEIGHT"` before the node has real width causes 0-width vertical text.

```javascript
// CORRECT — characters first, append, FILL, then textAutoResize
var t = figma.createText();
t.characters = "Long text...";
parent.appendChild(t);
t.layoutSizingHorizontal = "FILL";
t.textAutoResize = "HEIGHT";
```

### Rule 7: loadFontAsync before ANY text operation

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
```

### Rule 8: strokeAlign INSIDE for cards

```javascript
card.strokes = makeColorFill(borderVar);
card.strokeWeight = 1;
card.strokeAlign = "INSIDE";
```

### Rule 9: Cannot add children to instances

Component instances are sealed. Use `setProperties()` or `swapComponent()`.

```javascript
// WRONG — crashes
instance.appendChild(extraFrame);

// CORRECT
instance.setProperties({ [titleKey]: "New title" });
```

### Rule 10: Property keys include hash suffix

`componentPropertyDefinitions` returns keys like `title#9311:226`. Use the full key.

```javascript
var propDefs = compSet.componentPropertyDefinitions;
var titleKey = Object.keys(propDefs).find(k =>
  k.startsWith("title") && propDefs[k].type === "TEXT"
);
instance.setProperties({ [titleKey]: "My value" });
```

### Rule 11: importComponentSetByKeyAsync vs importComponentByKeyAsync

| What | API |
|------|-----|
| Component with variants (Button, Tag) | `importComponentSetByKeyAsync` |
| Single component (icon, logo) | `importComponentByKeyAsync` |

### Rule 12: Variant grid after combineAsVariants

After `combineAsVariants()`, all variants stack at (0,0). Arrange them:

```javascript
var cols = 4;
for (var i = 0; i < compSet.children.length; i++) {
  var child = compSet.children[i];
  child.x = (i % cols) * (child.width + 40);
  child.y = Math.floor(i / cols) * (child.height + 40);
}
```

### Rule 13: addComponentProperty AFTER combineAsVariants

```javascript
var compSet = figma.combineAsVariants(components, figma.currentPage);
compSet.addComponentProperty('title', 'TEXT', 'Default');
```

## Using Your Design System

If you have a Figma DS library, extract the keys using the scripts in `extract/`:

1. Open your DS library file in Figma
2. Run the extraction scripts via Bridge
3. Save the JSON output to `registries/`
4. Reference the keys in your scripts

The registries give you:
- **Component keys** for `importComponentByKeyAsync` / `importComponentSetByKeyAsync`
- **Variable keys** for `importVariableByKeyAsync` (colors, spacing, radius)
- **Text style keys** for `importStyleByKeyAsync`

## Helpers

Useful helper functions to include in your scripts:

```javascript
// Color fill bound to variable
function mf(colorVar) {
  var p = figma.util.solidPaint("#000000");
  p = figma.variables.setBoundVariableForPaint(p, "color", colorVar);
  return [p];
}

// Append + FILL in one call
function appendFill(parent, child, fillH, fillV) {
  parent.appendChild(child);
  if (fillH) child.layoutSizingHorizontal = "FILL";
  if (fillV) child.layoutSizingVertical = "FILL";
}

// Bind all 4 padding sides
function bindPadding(frame, top, right, bottom, left) {
  if (top) frame.setBoundVariable("paddingTop", top);
  if (right) frame.setBoundVariable("paddingRight", right);
  if (bottom) frame.setBoundVariable("paddingBottom", bottom);
  if (left) frame.setBoundVariable("paddingLeft", left);
}

// Bind all 4 corners radius
function bindRadius(frame, radiusVar) {
  frame.setBoundVariable("topLeftRadius", radiusVar);
  frame.setBoundVariable("topRightRadius", radiusVar);
  frame.setBoundVariable("bottomLeftRadius", radiusVar);
  frame.setBoundVariable("bottomRightRadius", radiusVar);
}
```
