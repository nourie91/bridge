# Bridge DS — Claude Code Instructions

Bridge DS is an AI-powered design workflow that generates Figma designs using your real design system. It supports two MCP transports: [figma-console-mcp](https://github.com/southleft/figma-console-mcp) (preferred) and the official Figma MCP server (fallback).

## Architecture

```
Claude Code  ──MCP──>  figma-console-mcp  ──WebSocket──>  Figma Desktop  (local, preferred)
Claude Code  ──MCP──>  Figma MCP Server   ──Cloud──>      Figma Cloud    (official, fallback)
```

All Figma operations use MCP tools — no custom server, no HTTP calls, no curl. See `skills/design-workflow/references/transport-adapter.md` for transport detection and tool mapping.

## Key MCP Tools

Tools vary by transport. See `references/transport-adapter.md` for the full mapping.

| Operation | Console transport | Official transport |
|-----------|------------------|--------------------|
| Execute Plugin API code | `figma_execute` | `use_figma` |
| Take screenshot | `figma_take_screenshot` | `get_screenshot` |
| Full DS extraction | `figma_get_design_system_kit` | Composite (see transport-adapter.md) |
| Get variables | `figma_get_variables` | `get_variable_defs` |
| Get styles | `figma_get_styles` | `search_design_system` |
| Search components | `figma_search_components` | `search_design_system` |
| Connection check | `figma_get_status` | `whoami` |

## Script Structure

Script format depends on the active transport. See `references/transport-adapter.md` Section C for full rules.

**Console transport (figma_execute) — IIFE wrapper mandatory:**

```javascript
return (async function() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  // ... Plugin API code ...
  return { success: true };
})();
```

**Official transport (use_figma) — top-level await, no IIFE:**

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
// ... Plugin API code ...
return { success: true };
```

Called as: `use_figma({ fileKey: "...", description: "...", code: "..." })`

## Critical Figma API Rules

Full rules: `skills/design-workflow/references/figma-api-rules.md`

**Top 5 (most common bugs):**

1. **FILL after appendChild** — Set `layoutSizingHorizontal = "FILL"` AFTER `parent.appendChild(child)`, never before
2. **resize() overrides sizing** — Call `resize()` FIRST, then set `primaryAxisSizingMode`
3. **Colors via setBoundVariableForPaint** — Not `setBoundVariable` (different API for fills/strokes)
4. **textAutoResize after width** — Set characters → append → FILL → then `textAutoResize = "HEIGHT"`
5. **DS component reuse** — NEVER recreate existing components as raw frames. Always import via `importComponentByKeyAsync`

## Helpers

Helpers (`mf`, `appendFill`, `bindPadding`, `bindRadius`) and the standard script boilerplate are defined in `skills/design-workflow/references/figma-api-rules.md` (Standard Script Boilerplate section). Always copy them from there.

## Design Workflow

The `/design-workflow` skill handles everything:

```
/design-workflow setup    → Extract DS + build knowledge base
/design-workflow spec     → Write component or screen specification
/design-workflow design   → Generate in Figma (atomic, verified)
/design-workflow review   → Validate against spec + tokens
/design-workflow done     → Archive and ship
/design-workflow drop     → Abandon with preserved learnings
/design-workflow learn    → Diff design vs corrections, extract learnings
/design-workflow sync     → Incremental DS sync (no full re-setup)
/design-workflow status   → Show current state, suggest next
```

Read `skills/design-workflow/SKILL.md` for the full workflow definition.
