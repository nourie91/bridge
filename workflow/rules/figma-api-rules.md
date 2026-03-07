# Figma Plugin API — Mandatory Rules

> **This file MUST be read before writing ANY Figma generation script.**
> Every rule here was learned from real bugs. Breaking them = broken layout.

---

## Rule 1: FILL after appendChild (CRITICAL)

`layoutSizingHorizontal = "FILL"` and `layoutSizingVertical = "FILL"` **ONLY work on children of auto-layout frames**. Setting FILL before `appendChild()` throws an error.

```js
// WRONG — crashes
child.layoutSizingHorizontal = "FILL";
parent.appendChild(child);

// CORRECT
parent.appendChild(child);
child.layoutSizingHorizontal = "FILL";
```

**Helper:**
```js
function appendFill(parent, child, fillH, fillV) {
  parent.appendChild(child);
  if (fillH) child.layoutSizingHorizontal = "FILL";
  if (fillV) child.layoutSizingVertical = "FILL";
}
```

---

## Rule 2: Absolute positioning after appendChild

`layoutPositioning = "ABSOLUTE"` requires the node to already be inside an auto-layout parent.

```js
// CORRECT
parent.appendChild(circle);
circle.layoutPositioning = "ABSOLUTE";
circle.x = 100; circle.y = 50;
```

---

## Rule 3: FILL + AUTO parent = collapsed layout

A child with `layoutSizingVertical = "FILL"` inside a parent with `primaryAxisSizingMode = "AUTO"` will collapse to 0px. The parent must be FIXED height for FILL children to expand.

```js
// CORRECT — root is fixed, child fills
root.primaryAxisSizingMode = "FIXED";
root.resize(1440, 900);
mainArea.layoutSizingVertical = "FILL"; // fills the 900px
```

---

## Rule 4: resize() overrides sizing modes (CRITICAL)

`resize(width, height)` forces **both** sizing modes to `"FIXED"`. Always call resize() FIRST, then set sizing modes.

```js
// CORRECT
frame.resize(700, 10);
frame.primaryAxisSizingMode = "AUTO";
frame.counterAxisSizingMode = "FIXED";
```

---

## Rule 5: counterAxisAlignItems for cross-axis centering

| Layout mode | primaryAxisAlignItems | counterAxisAlignItems |
|-------------|----------------------|----------------------|
| VERTICAL | Vertical alignment | Horizontal alignment |
| HORIZONTAL | Horizontal alignment | Vertical alignment |

---

## Rule 6: Always bind spacing variables (NEVER hardcode px)

Every padding, gap, and radius value MUST use `setBoundVariable()` with a spacing token from the registry. Load variable keys from `.bridge/registries/variables.json`.

```js
// Load spacing vars once at script start
var spLarge = await figma.variables.importVariableByKeyAsync("YOUR_KEY_HERE");

// Bind to frame
frame.setBoundVariable('itemSpacing', spMedium);
frame.setBoundVariable('paddingTop', spLarge);
```

---

## Rule 7: Colors via setBoundVariableForPaint (not setBoundVariable)

Fills and strokes use a **different API** than layout properties.

```js
// WRONG
frame.setBoundVariable('fills', colorVar);

// CORRECT
function mf(colorVar) {
  var p = figma.util.solidPaint("#000000");
  p = figma.variables.setBoundVariableForPaint(p, "color", colorVar);
  return [p];
}
frame.fills = mf(myColorVar);
```

---

## Rule 8: Text styles via importStyleByKeyAsync (NEVER hardcode fonts)

Never set `fontName`, `fontSize`, or `lineHeight` manually. Always use text styles from the library. Load style keys from `.bridge/registries/text-styles.json`.

```js
var style = await figma.importStyleByKeyAsync("YOUR_STYLE_KEY");
text.textStyleId = style.id;
```

---

## Rule 9: Component properties — add, bind, and override

### 9a. addComponentProperty AFTER combineAsVariants

```js
var compSet = figma.combineAsVariants(components, figma.currentPage);
compSet.addComponentProperty('title', 'TEXT', 'Default title');
```

### 9b. Bind TEXT properties to text nodes

```js
var titlePropKey = Object.keys(compSet.componentPropertyDefinitions)
  .find(k => compSet.componentPropertyDefinitions[k].type === "TEXT" && k.startsWith("title"));

for (var i = 0; i < compSet.children.length; i++) {
  var variant = compSet.children[i];
  var titleNode = variant.findOne(n => n.name === "title" && n.type === "TEXT");
  if (titleNode && titlePropKey) {
    titleNode.componentPropertyReferences = { characters: titlePropKey };
  }
}
```

### 9c. Override TEXT properties on instances

```js
var propDefs = compSet.componentPropertyDefinitions;
for (var key in propDefs) {
  if (key.startsWith("title") && propDefs[key].type === "TEXT") {
    instance.setProperties({ [key]: "My custom title" });
  }
}
```

### 9d. INSTANCE_SWAP properties for icons

```js
compSet.addComponentProperty('icon', 'INSTANCE_SWAP', defaultIconId);
```

### 9e. BOOLEAN properties for visibility

```js
compSet.addComponentProperty('showButton', 'BOOLEAN', true);
```

---

## Rule 10: Property keys include hash suffix

Property keys have a hash suffix like `title#9311:226`. Use the **full key**.

```js
function findPropKey(compSet, prefix, type) {
  var defs = compSet.componentPropertyDefinitions;
  return Object.keys(defs).find(function(k) {
    return k.startsWith(prefix) && defs[k].type === type;
  });
}
```

---

## Rule 11: importComponentSetByKeyAsync vs importComponentByKeyAsync

| What you're importing | API |
|----------------------|-----|
| Component **set** (has variants) | `importComponentSetByKeyAsync` |
| Single component (no variants) | `importComponentByKeyAsync` |

Check `registries/components.json` — entries with `variantCount > 1` are component sets.

---

## Rule 12: textAutoResize in auto-layout

**Set characters first, append, FILL, then textAutoResize:**

```js
var t = figma.createText();
t.characters = "Long text...";
parent.appendChild(t);
t.layoutSizingHorizontal = "FILL";
t.textAutoResize = "HEIGHT";
```

---

## Rule 13: strokeAlign INSIDE for cards

```js
card.strokes = mf(borderVar);
card.strokeWeight = 1;
card.strokeAlign = "INSIDE";
```

---

## Rule 14: Cannot add children to instances

Use `setProperties()`, `swapComponent()`, or `detachInstance()` as last resort.

---

## Rule 15: Variant grid layout after combineAsVariants

```js
var cols = 4;
for (var i = 0; i < compSet.children.length; i++) {
  var child = compSet.children[i];
  child.x = (i % cols) * (child.width + 40);
  child.y = Math.floor(i / cols) * (child.height + 40);
}
```

---

## Rule 16: loadFontAsync before ANY text operation

```js
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
```

---

## Rule 17: Script structure

```js
return (async function() {
  // 1. Load fonts
  // 2. Import variables + styles + components
  // 3. Define helpers (mf, appendFill, etc.)
  // 4. Build layout tree (create → configure → append → FILL)
  // 5. Return summary
  return { success: true };
})();
```

The `return` before the IIFE is mandatory — without it, the Promise is lost.

---

## Standard Script Boilerplate

```js
return (async function() {

  // ─── FONTS (adapt to your DS) ───
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  // ─── VARIABLES (load keys from .bridge/registries/variables.json) ───
  // var sp = {};
  // var spKeys = { "small": "your-key", "medium": "your-key", ... };
  // for (var k in spKeys) {
  //   sp[k] = await figma.variables.importVariableByKeyAsync(spKeys[k]);
  // }

  // ─── HELPERS ───
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

  // ─── BUILD ───
  // ... your design code here ...

  return { success: true };
})();
```
