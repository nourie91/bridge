# Action: spec {name}

> Write or validate a specification. Auto-detects component vs screen mode.

---

## Procedure

### 1. Determine mode

Ask or infer from context:
- **Component**: design system primitive, block, or composition (Button, Card, Tag...)
- **Screen**: full interface or page (dashboard, settings, onboarding flow...)

### 2. Gather context

- **Load design patterns** (MANDATORY for screens, recommended for components):
  - `.bridge/guides/design-patterns.md` → pattern catalogue
  - Identify the **closest pattern** for this screen/component
  - **Read the referenced screenshots** (min 2) from `.bridge/ui-references/`
  - Study: zones, proportions, density, hierarchy, navigation, card rhythm
  - The spec's **layout structure** MUST be based on these patterns, not invented from scratch

- **Load DS knowledge base** — use these to make informed component and token choices:
  - `.bridge/guides/components/overview.md` → component decision tree
  - `.bridge/registries/components.json` → available components with Figma keys
  - `.bridge/guides/tokens/spacing-usage.md` → spacing scale + usage contexts
  - `.bridge/guides/tokens/color-usage.md` → color token decision tree
  - `.bridge/guides/tokens/typography-usage.md` → type hierarchy + font families
  - Load relevant pattern guides if screen mode (form-patterns.md, multi-step-flow.md, navigation-patterns.md, feedback-patterns.md)

- Check existing specs: `specs/active/`, `specs/backlog/`
- Check existing DS components in Figma libraries (keys in `.bridge/registries/components.json`)

### 3. Write the spec

Write to `specs/active/{name}-spec.md`.

#### Component spec — mandatory sections:

- **Description** (what, why, design principle)
- **Architecture overview** (composition diagram)
- **Component hierarchy** (levels: primitive → blocks → composition)
- **Props API** (TypeScript interfaces, variant names matching Figma)
- **Layout specs** (dimensions, gaps, alignment)
- **Design tokens** (spacing, colors, typography, radius)
- **Component Properties** (TEXT, INSTANCE_SWAP, BOOLEAN for Figma)
- **Reused DS components** (existing components to use)
- **Acceptance criteria** (checkboxes, testable)
- **Open questions**

Use template from `.bridge/templates/spec-template.md`.

#### Screen spec — mandatory sections:

- **Description** (what screen, user goal, context)
- **Visual reference** (pattern name, screenshots studied, key composition rules)
- **Layout structure** (zones, grid, responsive — MUST follow matched pattern)
- **Sections breakdown** (header, content area, sidebar, footer...)
- **DS components used** (EXHAUSTIVE list — every visible element accounted for)
- **Content structure** (real or realistic placeholder data)
- **States** (empty, loading, populated, error)
- **Design tokens** (background, spacing rhythm, elevation)
- **Responsive rules** (breakpoints, layout shifts)
- **Acceptance criteria** (checkboxes)
- **Open questions**

Use template from `.bridge/templates/screen-template.md`.

### 3b. Identify new DS components (screen mode only)

For each UI pattern in the spec, check if it exists in `registries/components.json`:
- If covered by existing DS component → reference it in "DS Components Used"
- If NOT covered → add to **"New DS Components Required"** section

**This is a blocking gate.** If new components are identified:
1. List them with: name, description, where used, variants/states needed
2. After screen spec validated, each triggers its own `spec → design → done` cycle
3. Screen `design` step is blocked until all new components exist

### 4. Validate

**Token architecture:**
- [ ] Every visual value references a design token (no hardcoded px/hex)
- [ ] Tokens use semantic names, not visual (`danger` not `red`)

**Naming conventions:**
- [ ] Variant names match Figma exactly
- [ ] Token references follow the project's naming pattern

**Component API (component mode):**
- [ ] Props surface area is minimal (composability over configuration)
- [ ] Composition pattern appropriate (slots > mega-props)

**General:**
- [ ] Acceptance criteria are testable (not vague)
- [ ] Reused DS components identified
- [ ] Open questions are explicit

### 5. Present for review

Output the spec, flag assumptions, highlight open questions.

---

## Transition

When spec is approved → suggest: "Spec approved. Run: `design`"
