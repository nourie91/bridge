# Schema: recipes

> **Read this BEFORE creating, evolving, or consuming recipes.**

---

## Purpose

Recipe files store parameterized scene graph templates extracted from successful designs. They live in `knowledge-base/recipes/` and are indexed by `_index.json`. The compiler consumes hydrated recipes exactly like any other scene graph.

---

## Required Structure: `_index.json`

```json
{
  "meta": {
    "version": "1.0",
    "lastUpdated": "YYYY-MM-DD"
  },
  "recipes": [
    {
      "id": "r-settings-screen-001",
      "name": "Settings Screen",
      "archetype": "settings",
      "tags": ["sidebar", "form", "preferences"],
      "confidence": 0.92,
      "version": 1
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `meta.version` | **YES** | Schema version (`"1.0"`) |
| `meta.lastUpdated` | **YES** | ISO date of last modification (null until first recipe) |
| `recipes` | **YES** | Array of recipe summary entries (can be empty) |
| `recipes[].id` | **YES** | Unique recipe ID matching the filename |
| `recipes[].name` | **YES** | Human-readable name |
| `recipes[].archetype` | **YES** | Screen archetype (e.g., `settings`, `dashboard`, `form`, `list`, `detail`) |
| `recipes[].tags` | **YES** | Keyword tags for matching |
| `recipes[].confidence` | **YES** | Current confidence score (0.0 -- 1.0) |
| `recipes[].version` | **YES** | Current version number |

---

## Required Structure: Recipe File (`r-{archetype}-{NNN}.json`)

### Top-level

```json
{
  "meta": { ... },
  "parameters": [ ... ],
  "graph": { ... },
  "learnings_applied": [ ... ],
  "evolution_log": [ ... ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `meta` | **YES** | Recipe metadata |
| `parameters` | **YES** | Typed parameter definitions (can be empty array) |
| `graph` | **YES** | Parameterized scene graph (same format as compiler input) |
| `learnings_applied` | **YES** | Array of learning IDs baked into this recipe |
| `evolution_log` | **YES** | Version history |

---

### `meta` Object

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | **YES** | string | `r-{archetype}-{NNN}` format |
| `name` | **YES** | string | Human-readable recipe name |
| `archetype` | **YES** | string | Screen archetype: `settings`, `dashboard`, `form`, `list`, `detail`, `onboarding`, `empty-state`, `auth`, `profile` |
| `tags` | **YES** | string[] | Keywords for matching (lowercase, no spaces) |
| `version` | **YES** | number | Starts at 1, incremented on each evolution |
| `createdFrom` | **YES** | string | Spec name that produced the original design |
| `createdAt` | **YES** | string | ISO date of creation |
| `lastEvolvedAt` | **YES** | string | ISO date of last evolution (equals `createdAt` initially) |
| `successCount` | **YES** | number | Times this recipe has been used successfully (starts at 1) |
| `avgCorrections` | **YES** | number | Running average of corrections per use |
| `confidence` | **YES** | number | Computed score: `base_score * recency_weight * correction_decay` |

---

### `parameters` Array

Each entry defines a typed slot the spec must fill.

```json
{
  "name": "title",
  "type": "string",
  "required": true,
  "default": "Settings"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | **YES** | string | Parameter name (used in `{{ name }}` placeholders) |
| `type` | **YES** | string | One of: `string`, `number`, `boolean`, `array` |
| `required` | **YES** | boolean | Whether the spec must provide this value |
| `default` | no | any | Default value if not provided (required parameters without default cause hydration error) |
| `itemShape` | if `type: "array"` | object | Shape of each array item: `{ "fieldName": "type", ... }` |

#### Parameter Types

| Type | Placeholder Usage | Example |
|------|-------------------|---------|
| `string` | `{{ title }}` in `characters`, `name`, etc. | `"Dashboard"` |
| `number` | `{{ columns }}` in REPEAT `count`, dimensions | `3` |
| `boolean` | `{{ showHeader }}` in CONDITIONAL `when` | `true` |
| `array` | `{{ items.length }}` for count, `{{ item.field }}` per iteration | `[{ "label": "Home" }]` |

---

### `graph` Object

Same structure as the compiler's scene graph input (see `compiler-reference.md` Section 1), with two additional placeholder syntaxes:

#### Parameter Placeholders: `{{ param }}`

Replaced during hydration. Appears in any string value position.

```json
{ "characters": "{{ title }}" }
{ "count": "{{ navItems.length }}" }
{ "properties": { "label": "{{ item.label }}" } }
```

**Rules:**
- `{{ param }}` for top-level parameters
- `{{ param.field }}` for object field access
- `{{ param.length }}` for array length
- `{{ item.field }}` inside REPEAT templates (per-iteration binding)
- Placeholders in non-string positions (e.g., `count`) are coerced to the expected type after substitution

#### Component Lookups: `@lookup:ComponentName`

Used in `component` fields of INSTANCE nodes instead of hardcoded keys.

```json
{
  "type": "INSTANCE",
  "component": "@lookup:NavigationItem",
  "properties": { "label": "{{ item.label }}" }
}
```

Resolved against the live component registry at compile time. The indirection makes recipes survive DS updates (re-keyed or renamed components only need a registry update).

---

### `learnings_applied` Array

```json
["l-20260320-001", "l-20260322-003"]
```

Array of learning IDs from `learnings.json` that have been patched into this recipe's graph. Prevents duplicate application.

---

### `evolution_log` Array

```json
[
  { "version": 1, "date": "2026-03-20", "reason": "Initial extraction from settings-screen-spec" },
  { "version": 2, "date": "2026-03-25", "reason": "Applied l-20260322-003: spacing/medium for card gap in settings screens" }
]
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `version` | **YES** | number | Version number after this change |
| `date` | **YES** | string | ISO date |
| `reason` | **YES** | string | What changed and why |

---

## Extraction Script

When `done` runs and the design qualifies for recipe extraction (screen mode, PASS review, <= 2 corrections), execute this procedure:

### Step 1: Identify Parameters

Scan the spec for variable content:
- Screen title, section headings -> `string` parameters
- Repeated items (nav items, list rows, cards) -> `array` parameters with `itemShape`
- Toggle-controlled zones (optional sections) -> `boolean` parameters
- Numeric counts (columns, items) -> `number` parameters

### Step 2: Templatize the Scene Graph

Take the final (post-correction) scene graph and:
1. Replace concrete text content with `{{ paramName }}` placeholders.
2. Replace component keys with `@lookup:ComponentName` references.
3. Replace concrete REPEAT `count` values with `{{ arrayParam.length }}`.
4. Replace per-iteration bindings in REPEAT `data` with `{{ item.field }}`.
5. Keep all `$token` references as-is (they resolve at compile time).

### Step 3: Compute Initial Metadata

```
id          = "r-{archetype}-{NNN}" (NNN = zero-padded sequence)
version     = 1
successCount = 1
avgCorrections = (number of corrections in this learn cycle)
confidence  = base_score * recency_weight * correction_decay
            = min(1.0, 0.70 + 0.05) * 1.0 * max(0.60, 1.0 - avgCorrections * 0.15)
```

### Step 4: Write Files

1. Write `recipes/r-{archetype}-{NNN}.json` with the full recipe.
2. Append an entry to `recipes/_index.json`.
3. Update `_index.json` `meta.lastUpdated`.

---

## Validation Rules

1. **ID format:** Must match `r-[a-z]+-[0-9]{3}` pattern.
2. **Graph validity:** The `graph` object (after placeholder removal) must be a valid scene graph per compiler schema.
3. **Parameter completeness:** Every `{{ param }}` in the graph must have a corresponding entry in `parameters`.
4. **No orphan parameters:** Every entry in `parameters` must be referenced at least once in the graph.
5. **Learnings consistency:** Every ID in `learnings_applied` must exist in `learnings.json`.
6. **Evolution log integrity:** Log entries must be sequential by version number, with no gaps.
7. **Confidence bounds:** Must be in range [0.0, 1.0].
8. **Index sync:** Every recipe file in `recipes/` must have a corresponding entry in `_index.json`, and vice versa.

---

## Transport Note

Recipes are transport-agnostic. The `graph.metadata.transport` field is omitted in recipes and set at compile time based on the active transport. The compiler handles all transport-specific wrapping.
