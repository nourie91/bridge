# Action: review

> Validate the Figma design against the spec. Check structure, tokens, and completeness.

---

## Prerequisites

- Active spec in `specs/active/`
- Figma design generated

---

## Procedure

### 1. Gather artifacts + DS knowledge base

- Read the active spec
- Load knowledge base registries for validation:
  - `.bridge/registries/components.json` → verify component instances match registry
  - `.bridge/registries/variables.json` → verify variable bindings use correct names
- Inspect Figma design via MCP:
  ```
  mcp__figma__get_design_context({ nodeId })
  mcp__figma__get_screenshot({ nodeId })
  ```

### 2. Review checklist

#### A. Spec Compliance

- [ ] All variants/sections from spec are represented in Figma
- [ ] Architecture/layout matches spec diagram
- [ ] Content matches spec examples (or realistic equivalents)

#### B. Design Token Alignment

- [ ] Colors match spec tokens (no arbitrary hex values)
- [ ] Spacing follows token scale strictly (no off-scale values)
- [ ] Typography uses correct styles from the library
- [ ] Radius values match tokens
- [ ] **Variables are bound** (not hardcoded hex/px) — check via Figma inspect
- [ ] Variable names match `registries/variables.json` exactly

#### C. Completeness

**Component mode:**
- [ ] All sizes represented
- [ ] All states shown (default, hover, pressed, disabled if applicable)
- [ ] All optional prop combinations demonstrated

**Screen mode:**
- [ ] All sections from spec present
- [ ] All states captured (empty, loading, populated, error)
- [ ] Responsive breakpoints if specified
- [ ] DS components are **real instances** (not placeholder rectangles)
- [ ] No `[MISSING]` placeholder frames remain

#### D. Design Quality

- [ ] Visual hierarchy is clear
- [ ] Spacing rhythm is consistent (follows token scale)
- [ ] Layer naming is semantic in Figma (not "Frame 42" or "Group 1")
- [ ] No orphan or misaligned elements

#### E. Visual Fidelity (BLOCKING)

**Load before checking:**
- `.bridge/guides/design-patterns.md`
- The reference screenshots used during design generation

**Compare the generated design with the reference screenshots and pattern rules:**

- [ ] **Layout match** — Zones are in the correct positions
- [ ] **Proportion match** — Relative widths/heights match the pattern
- [ ] **Density match** — Information density is similar to reference
- [ ] **Hierarchy match** — Visual weight of titles, sections, CTAs matches
- [ ] **Card patterns match** — Card size, grid rhythm, gaps, internal layout
- [ ] **Navigation match** — Sidebar/stepper/tabs follow correct pattern
- [ ] **Section organization** — Consistent gaps between sections, title placement
- [ ] **Whitespace balance** — Margins and breathing room consistent

**If any check fails:** identify the specific gap, reference the pattern rule violated, and suggest the fix.

### 3. Report

```markdown
## Review: {name}

### Spec Compliance: {OK / ISSUES}
{findings}

### Token Alignment: {OK / ISSUES}
{findings}

### Completeness: {OK / ISSUES}
{missing items}

### Design Quality: {OK / ISSUES}
{findings}

### Visual Fidelity: {OK / ISSUES}
Pattern matched: {pattern name}
Screenshots compared: {list}
{findings — specific gaps with pattern rule references}

### Verdict: PASS / NEEDS ITERATION

### Iteration needed:
1. {what to fix}
```

### 4. Iterate if needed

If NEEDS ITERATION:
1. Fix issues via Bridge scripts (read `.bridge/rules/figma-api-rules.md` for patterns)
2. Re-review only the fixed areas

Repeat until PASS.

---

## Transition

When review passes → suggest: "Review passed. Run: `done`"
