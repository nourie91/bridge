# 🧱 Bridge — Design Workflow

> Spec-first workflow for designing in Figma via Claude Code.
> **All output in the user's language.**

---

## Philosophy

1. **Spec-first** — No design without a validated specification
2. **Figma is the output** — Everything ends as native Figma layers
3. **DS-native** — Every element uses real DS components, bound variables, and text styles
4. **Composability over configuration** — Simple building blocks > mega-components
5. **Iterative** — Design → review → refine until right
6. **Atomic** — Small sequential scripts with visual verification between each step

---

## Commands

| Command | Purpose | Action file |
|---------|---------|-------------|
| `spec {name}` | Write a component or screen specification | `.bridge/actions/spec.md` |
| `design` | Generate Figma design from active spec via Bridge | `.bridge/actions/design.md` |
| `review` | Validate design against spec, tokens, and visual fidelity | `.bridge/actions/review.md` |
| `done` | Archive spec and close | `.bridge/actions/done.md` |
| `drop` | Abandon with preserved learnings | `.bridge/actions/drop.md` |
| `status` | Show current state and suggest next action | *(inline below)* |

---

## Two Modes

### Component mode
Design system components (Button, Card, Modal...):
```
spec {component}  →  design  →  review  →  done
```
Spec includes: architecture, props API, variants, tokens, Figma link.

### Screen mode
Full interfaces (dashboard, settings, onboarding...):
```
spec {screen}
  → if new DS components identified:
      spec {component}  →  design {component}  →  done {component}
  → design {screen}  →  review  →  done
```
Spec includes: layout, sections, components used, content structure, responsive rules.
**If the spec identifies UI patterns not covered by existing DS components**, they are flagged as new components. Each new component gets its own spec → design → done cycle before the screen design proceeds.

The `spec` action auto-detects the mode from context, or asks the user.

---

## Full Workflow

```
spec {name}
  │
  ├─ [screen mode] → new components check
  │     └─ spec {component} → design → done → back to screen
  │
  ▼
design
  │
  ├─ STEP A: Pattern Matching ← BLOCKING
  │     1. Identify screen type
  │     2. Load design-patterns.md
  │     3. Read min 2 reference screenshots
  │     4. Extract: layout zones, proportions, density, hierarchy
  │     5. Gate: pattern matched and documented
  │
  ├─ STEP B: Atomic Generation
  │     1. Split into small sequential scripts (~30-80 lines each)
  │     2. After each step: verify with `get_screenshot` via Figma MCP
  │     3. Fix issues before proceeding to next step
  │     4. Generate states (clone + modify)
  │
  ▼
review
  │
  ├─ Structural review (spec compliance, tokens, completeness)
  │
  ├─ Visual fidelity review ← BLOCKING
  │     1. Compare with reference screenshots
  │     2. Check: layout, density, hierarchy, card patterns, navigation
  │     3. Verdict: PASS / FAIL with identified gaps
  │
  ▼
done
```

---

## Action Router

Detect intent from user input and **read the action file BEFORE executing**:

| User says | Route to |
|-----------|----------|
| "spec", "write spec", "new component", "new screen" | `.bridge/actions/spec.md` |
| "design", "figma", "generate", "push to figma" | `.bridge/actions/design.md` |
| "review", "check", "validate", "audit" | `.bridge/actions/review.md` |
| "done", "finish", "complete", "close", "ship" | `.bridge/actions/done.md` |
| "drop", "abandon", "cancel" | `.bridge/actions/drop.md` |
| "status", "workflow", "what's next", "what now" | *(status logic below)* |

---

## Project Structure

```
specs/
  active/          ← Current work (0-1 specs)
  backlog/         ← Queued specs
  shipped/         ← Completed & archived
  dropped/         ← Abandoned with learnings
  history.log      ← One-line per design shipped
```

---

## Status Logic (inline)

Detect state by checking:
1. Does `specs/active/` contain a spec?
2. Has a Figma design been generated for it?

| State | Suggestion |
|-------|------------|
| No spec | "Ready. Run: `spec {name}`" |
| Active spec, no Figma design | "Spec ready. Run: `design`" |
| Active spec + Figma done | "Design ready. Run: `review`" |
| Review passed | "Run: `done`" |

---

## Quality Gates

Full definitions: `.bridge/rules/quality-gates.md` (read before any phase transition).

---

## Non-negotiable Rules

- NEVER skip spec creation, validation, or new components check
- NEVER skip pattern matching (no design without studying screenshots)
- ALWAYS read the action file BEFORE executing
- ALWAYS read `.bridge/rules/figma-api-rules.md` BEFORE writing any Figma script
- ALWAYS wait for user confirmation before generating in Figma

---

## References

| Reference | Path |
|-----------|------|
| Quality gates | `.bridge/rules/quality-gates.md` |
| Figma API rules | `.bridge/rules/figma-api-rules.md` |
| Spec template (component) | `.bridge/templates/spec-template.md` |
| Spec template (screen) | `.bridge/templates/screen-template.md` |
| Design patterns | `.bridge/guides/design-patterns.md` |
| UI reference screenshots | `.bridge/ui-references/` |
| Component guides | `.bridge/guides/components/` |
| Token guides | `.bridge/guides/tokens/` |
| Pattern guides | `.bridge/guides/patterns/` |
| Registries | `.bridge/registries/` |
