# Recipe System

> **Recipes are parameterized scene graph templates for common screen archetypes.**
> They encode proven layout structure, DS component usage, and token bindings that have been validated through the fix cycle.

---

## 1. What is a Recipe?

A recipe captures a successful design as a reusable template. Instead of generating a screen from scratch every time, the `make` action checks for a matching recipe and hydrates it with the current parameters before feeding it to the compiler.

Recipes differ from raw scene graphs in three ways:

- **Parameterized:** Slots marked with `{{ param }}` are filled at hydration time.
- **DS-aware:** Component references use `@lookup:ComponentName` syntax, resolved against the live registry at compile time.
- **Battle-tested:** Every recipe was extracted from a design that completed with <= 2 corrections, and evolves as learnings accumulate.

---

## 2. Recipe Format

Each recipe is a standalone JSON file stored in `recipes/{id}.json`.

```json
{
  "meta": {
    "id": "r-settings-screen-001",
    "name": "Settings Screen",
    "archetype": "settings",
    "tags": ["sidebar", "form", "preferences"],
    "version": 1,
    "createdFrom": "settings-screen-spec",
    "createdAt": "2026-03-20",
    "lastEvolvedAt": "2026-03-20",
    "successCount": 1,
    "avgCorrections": 0.5,
    "confidence": 0.92
  },
  "parameters": [
    { "name": "title", "type": "string", "required": true, "default": "Settings" },
    { "name": "sidebarItems", "type": "array", "required": true, "itemShape": { "label": "string", "icon": "string" } },
    { "name": "showBreadcrumb", "type": "boolean", "required": false, "default": false },
    { "name": "contentSections", "type": "number", "required": false, "default": 3 }
  ],
  "graph": {
    "version": "3.0",
    "metadata": {
      "name": "{{ title }}",
      "width": 1440,
      "height": 900
    },
    "fonts": [
      { "family": "Inter", "style": "Regular" },
      { "family": "Inter", "style": "Semi Bold" }
    ],
    "nodes": [
      {
        "type": "FRAME",
        "name": "Sidebar",
        "layout": "VERTICAL",
        "gap": "$spacing/sm",
        "padding": "$spacing/lg",
        "fill": "$color/bg/neutral/subtle",
        "width": 280,
        "fillV": true,
        "children": [
          {
            "type": "REPEAT",
            "name": "Nav Items",
            "count": "{{ sidebarItems.length }}",
            "template": [
              {
                "type": "INSTANCE",
                "name": "Nav Item",
                "component": "@lookup:NavigationItem",
                "properties": { "label": "{{ item.label }}" },
                "swaps": { "icon": "{{ item.icon }}" },
                "fillH": true
              }
            ]
          }
        ]
      }
    ]
  },
  "learnings_applied": ["l-20260320-001", "l-20260322-003"],
  "evolution_log": [
    { "version": 1, "date": "2026-03-20", "reason": "Initial extraction from settings-screen-spec" }
  ]
}
```

---

## 3. Recipe Lifecycle

### 3.1 Creation

A recipe is extracted when ALL of these criteria are met:

1. The spec was generated in **screen mode** (not component mode).
2. The design **completed with <= 2 corrections** during the fix cycle.

Extraction happens automatically during the `done` action. The scene graph from the final (corrected) design is templatized: concrete values become `{{ param }}` placeholders, component keys become `@lookup:Name` references.

### 3.2 Evolution

Recipes evolve when learnings accumulate:

1. A learning reaches **signals >= 2**.
2. The learning's `context` matches the recipe's `archetype` or `tags`.
3. The recipe's graph is patched to reflect the learning's `change.to` value.
4. The `evolution_log` gets a new entry and `lastEvolvedAt` is updated.
5. Recipe `version` is incremented.

When a learning is promoted to **global** scope, ALL recipes are scanned and patched if the change applies.

### 3.3 Compilation

During `make`, if a recipe matches the spec:

1. **Hydrate** parameters: replace all `{{ param }}` placeholders with actual values.
2. **Resolve** `@lookup:ComponentName` references against the live component registry.
3. **Feed** the resulting scene graph JSON to the compiler (same pipeline as from-scratch generation).

---

## 4. Recipe Matching

When the `make` action receives a spec, it scores each recipe in `_index.json`:

### Scoring Dimensions

| Dimension | Weight | Method |
|-----------|--------|--------|
| Archetype match | 0.40 | Exact match on `meta.archetype` vs. spec screen type |
| Tag overlap | 0.25 | Jaccard similarity between recipe `tags` and spec keywords |
| Structural match | 0.20 | Zone count, component types, parameter compatibility |
| Confidence | 0.15 | Recipe's current confidence score |

### Match Thresholds

| Score | Action |
|-------|--------|
| **>= 0.85** | Exact match. Use recipe directly, hydrate with spec parameters. |
| **0.60 -- 0.84** | Partial match. Use recipe as starting scaffold, supplement missing zones. |
| **< 0.60** | No match. Generate from scratch. |

---

## 5. Confidence Score

A recipe's confidence reflects how reliable it is:

```
confidence = base_score * recency_weight * correction_decay
```

| Factor | Formula | Range |
|--------|---------|-------|
| `base_score` | `min(1.0, 0.70 + (successCount * 0.05))` | 0.70 -- 1.00 |
| `recency_weight` | `max(0.50, 1.0 - (days_since_last_use * 0.005))` | 0.50 -- 1.00 |
| `correction_decay` | `max(0.60, 1.0 - (avgCorrections * 0.15))` | 0.60 -- 1.00 |

Confidence is recalculated after each use (`done`) and each evolution (learning patch).

---

## 6. Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Single text value | `{ "name": "title", "type": "string", "default": "Dashboard" }` |
| `number` | Numeric value | `{ "name": "columns", "type": "number", "default": 3 }` |
| `boolean` | Toggle | `{ "name": "showHeader", "type": "boolean", "default": true }` |
| `array` | List with typed items | `{ "name": "items", "type": "array", "itemShape": { "label": "string", "icon": "string" } }` |

Required parameters with no `default` must be provided by the spec. Missing required parameters cause a hydration error.

---

## 7. Graph Placeholders

### Parameter Placeholders: `{{ param }}`

Replaced during hydration with values from the spec or defaults.

- `{{ title }}` -- simple string substitution
- `{{ items.length }}` -- array length for REPEAT count
- `{{ item.label }}` -- per-iteration value inside REPEAT

### Component Lookups: `@lookup:ComponentName`

Resolved against the live component registry during compilation. If the component name is not found, the compiler emits `RESOLVE_COMPONENT_NOT_FOUND`.

This indirection makes recipes portable across DS updates: if a component is renamed or re-keyed, only the registry needs updating.

---

## 8. File Layout

```
knowledge-base/
  recipes/
    _index.json              -- Recipe index (meta + recipe ID list)
    r-settings-screen-001.json
    r-dashboard-001.json
    r-form-flow-001.json
    ...
  schemas/
    recipes.md               -- Formal schema documentation
```

The `_index.json` file is the entry point. It lists all recipe IDs with minimal metadata for fast matching. Full recipe data lives in individual files.
