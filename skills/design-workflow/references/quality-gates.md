# Quality Gates — v3 (Compiler-Driven)

---

## Phase: setup

| Gate | Blocking | Check |
|------|----------|-------|
| Figma MCP transport available | Yes | Console: `figma_get_status()` valid / Official: `whoami()` succeeds |
| Connected to Figma | Yes | Console: `setup.valid: true` / Official: `whoami()` + test `use_figma` call |
| DS libraries enabled | Yes (before make) | User confirmation |
| Knowledge base exists | Yes (before make) | `registries/` has JSON files |
| Registry schemas followed | Yes | All registry files match schemas — every entry has `key` field |
| Registry keys validated | Yes | Sample import test passed (3-5 keys per registry) |
| No node IDs as keys | Yes | Component entries have `key` (hex hash), NOT `id` (node ID like `1008:174`) |
| Variable keys present | Yes | Variables have `key` field, not just `name` paths |

---

## Phase: make — CSpec generation (Phase C)

| Gate | Blocking | Check |
|------|----------|-------|
| Mode identified (component or screen) | Yes | CSpec `meta.type` is set |
| Intent described | Yes | CSpec `intent` is non-empty |
| Layout tree defined | Yes | CSpec `layout` has children |
| All tokens are `$token` references | Yes | No raw px, hex, or font values in layout tree |
| DS components are INSTANCE nodes | Yes | No FRAME/RECTANGLE recreating existing DS components |
| Acceptance criteria present | Yes | At least 3 items in CSpec `acceptance` |
| User confirmed plan | Yes | Explicit approval before compilation |

### Screen-specific
| Gate | Blocking |
|------|----------|
| DS components listed in `ds_components` | Yes |
| `new_components` section filled (even if empty) | Yes |
| All new components resolved before screen make | Yes |

### Component-specific
| Gate | Blocking |
|------|----------|
| Variants defined | Yes |
| Properties listed | Yes |

---

## Phase: make — Compilation (Phase D)

| Gate | Blocking | Check |
|------|----------|-------|
| Scene graph JSON valid | Yes | Compiler parses without errors |
| All `$token` references resolved | Yes | Compiler resolves all tokens against registries |
| All component names resolved | Yes | Compiler finds all INSTANCE components in registry |
| No `VALIDATE_*` errors | Yes | Compiler structural validation passes |
| Chunks executed successfully | Yes | All MCP tool calls succeed |
| Screenshot taken | Yes | Final screenshot captured after last chunk |
| Snapshot saved | Yes | Node tree saved to `specs/active/{name}-snapshot.json` |

---

## Phase: make — Compiler error handling

| Gate | Blocking | Check |
|------|----------|-------|
| Max 3 compilation attempts | Yes | If still failing after 3, report to user |
| Error suggestions read | Yes | Every compiler error has a suggestion in stderr |
| Scene graph fixed per suggestions | Yes | Changes match compiler's recommendations |

---

## Phase: fix

| Gate | Blocking | Check |
|------|----------|-------|
| Active CSpec exists | Yes | `specs/active/{name}.cspec.yaml` present |
| Snapshot exists | Yes | `specs/active/{name}-snapshot.json` present |
| Figma MCP transport available | Yes | Console: `figma_get_status()` / Official: `whoami()` |
| Root node still exists in Figma | Yes | Extraction script can find the node |
| Changes classified | Yes | Every change classified as LEARNING or FLAG |
| Learnings have valid tokens | Yes | Every LEARNING references a token from `registries/variables.json` |
| Flags surfaced to user | Yes | All FLAG items reported before saving |
| Snapshot updated | Yes | New snapshot saved after fix |

---

## Phase: done

| Gate | Blocking | Check |
|------|----------|-------|
| User validated design | Yes | Explicit approval |
| CSpec archived | Yes | Moved to `specs/shipped/` |
| History log updated | Yes | Entry appended to `specs/history.log` |
| Recipe extraction evaluated | Yes | Eligibility checked (screen mode, corrections <= 2) |
| Recipe confidence updated | Yes (if recipe was used) | Confidence recalculated |
| Temp files cleaned | Yes | `/tmp/bridge-scene-*` removed |

---

## Phase: done — Recipe extraction eligibility

| Criterion | Required |
|-----------|----------|
| Screen mode (`meta.type: screen`) | Yes |
| Design generated (snapshot exists) | Yes |
| Total corrections <= 2 | Yes |

---

## Skip Policy

- **Non-skippable (NEVER):** CSpec generation, user confirmation before compilation, `$token` reference validation, DS component reuse (INSTANCE nodes), registry loading, compiler validation
- **Skippable with warning:** recipe matching, screenshot reference analysis, individual acceptance criteria
- When skipping:
  1. Warn user about quality impact
  2. Log the skip reason
  3. Flag in next fix cycle as advisory issue
