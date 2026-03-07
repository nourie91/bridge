# Action: design

> Generate a Figma design from the active spec via Bridge.

---

## Prerequisites

- Active spec in `specs/active/` (abort if missing: "No active spec. Run: `spec {name}`")
- Bridge plugin installed in Figma
- **If screen spec lists "New DS Components Required"**: all listed components MUST be spec'd and designed first. Abort and prompt: "New component `{name}` needs to be created first. Run: `spec {name}`"

---

## Procedure

### 1. Read the active spec + DS knowledge base

Parse from spec:
- Mode (component or screen)
- All variants/sections/states
- Design tokens (colors, spacing, typography, radius)
- DS components used (with Figma component keys from registry)
- Content/data examples

**Load knowledge base registries (CRITICAL — must load before any script):**
- `.bridge/registries/components.json` → component keys
- `.bridge/registries/variables.json` → variable names and keys
- `.bridge/registries/text-styles.json` → text style keys

**Load token guides:**
- `.bridge/guides/tokens/color-usage.md` → color token decision tree
- `.bridge/guides/tokens/spacing-usage.md` → spacing scale + usage
- `.bridge/guides/tokens/typography-usage.md` → font families, hierarchy

**Load relevant component/pattern guides** (based on spec content):
- `.bridge/guides/components/overview.md` → component decision tree
- Specific group guides as needed

**Load Figma API rules (CRITICAL — read before writing any script):**
- `.bridge/rules/figma-api-rules.md` → all API patterns and boilerplate

### 1b. Pattern Matching (BLOCKING)

**This step is MANDATORY. No design generation without completing it.**

1. Load `.bridge/guides/design-patterns.md`
2. Identify the screen type and find matching pattern(s)
3. Read at least 2 reference screenshots from `.bridge/ui-references/`
4. Extract pattern rules: layout zones, proportions, density, hierarchy
5. Confirm pattern match before proceeding:
```
Pattern match: {pattern name}
Screenshots studied: {list}
Key rules applied: {bullet list}
```

**GATE: If no pattern matches**, ask the user which existing pattern is closest.

### 1c. Canvas dimensions

- **Web**: 1440px wide
- **Mobile**: 390px wide
- **Tablet**: 1024px wide

### 2. Ask target

Ask the user:
- **Which Figma file?** (URL or fileKey)
- **Which page?** (or create a new page)

### 3. Start Bridge

```bash
bridge start
```

Ask the user to open the Bridge plugin in Figma. Wait for connection.

**Library activation check:** Verify DS libraries are **enabled** in the target file. `importComponentByKeyAsync` only works with published AND enabled libraries.

### 4. Generate the design — Atomic Steps

Write and execute Figma Plugin API scripts via Bridge.

**Before writing any script, read `.bridge/rules/figma-api-rules.md`.**

**Script execution pattern:**
```bash
cat script.js | jq -Rs '{"action":"runScript","code":.}' | curl -s --max-time 60 -X POST http://localhost:9001/command -H "Content-Type: application/json" -d @-
```

**CRITICAL: `action: "runScript"` is REQUIRED.** Without it, the plugin silently ignores the command.

**Atomic generation (MANDATORY approach):**

Never generate a full design in a single script. Split into small, sequential steps (~30-80 lines each). Each step:
1. Does ONE thing (structure, populate a section, override instances...)
2. Returns node IDs needed by subsequent steps
3. Is verified with a screenshot before moving on

**Standard steps for a screen:**

| Step | What | Lines | Returns |
|------|------|-------|---------|
| 1. Structure | Root frame + major section frames (empty) | ~40-60 | rootId, sectionIds |
| 2. Top bar / Nav | Populate nav with DS component instances | ~20-30 | — |
| 3. Content sections | One step per major section | ~40-60 | sectionId |
| 4. Footer / minor | Footer, labels, secondary elements | ~20-30 | — |
| 5. Instance overrides | Set TEXT/ICON props on all instances | ~30-50 | — |
| 6. States | Clone root + modify for additional states | ~30-50 | stateIds |

**Standard steps for a component:**

| Step | What | Lines | Returns |
|------|------|-------|---------|
| 1. Build variants | Create component frames with structure | ~60-80 | variantIds |
| 2. Combine + props | `combineAsVariants` + `addComponentProperty` | ~30-40 | compSetId |
| 3. Bind props | `componentPropertyReferences` on all nodes | ~30-40 | — |
| 4. Refinements | Adjust spacing, sizing, visual polish | ~20-30 | — |

**After each step:** verify visually with `get_screenshot` via Figma MCP before proceeding:
```
mcp__figma__get_screenshot({ nodeId: "{rootOrSectionId}", fileKey: "{fileKey}" })
```
Compare the screenshot against the spec and reference patterns. If something is wrong, fix it before moving to the next step.

### 4b. Zero Raw Elements Rule

Before creating ANY visual element, check registries:
1. `components.json` — Buttons, Tags, Inputs, etc.
2. Check for icons, logos, illustrations in registries

Only create raw elements for pure layout frames or when no DS component exists (document why).

### 5. Multi-state generation

1. Create the base state first
2. Clone the root frame for each additional state
3. Modify each clone (swap variants, update text, change progress)
4. Add state labels above each frame

### 6. Final naming cleanup

Verify all layers have semantic names (no "Frame", "Rectangle", "Group").

---

## Output

```
Design created in Figma via Bridge.

File: {figma_url}
Created:
  - {n} frames with auto-layout
  - {n} variables bound (colors + spacing + radius)
  - {n} DS component instances
  - States: {list}

Warnings:
  - {any issues}

Next: review the design in Figma, then run: `review`
```

---

## Transition

When design is in Figma → suggest: "Run: `review`"
