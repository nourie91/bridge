# {ScreenName}

## Description

{What screen, user goal, context of use.}

**Figma:** {figma_url}

---

## Visual Reference

> Identifies which design pattern this screen follows.
> The layout structure below MUST be based on these references.

| | |
|---|---|
| **Pattern** | {pattern name from `design-patterns.md`} |
| **Screenshots studied** | {list of screenshot filenames, min 2} |
| **Key composition rules** | {bullet list of rules from the pattern that apply} |

**Composition notes:**
{What was observed in the screenshots that informs this spec's layout: zone proportions, content density, visual hierarchy, navigation pattern, card rhythm, etc.}

---

## Layout Structure

> Based on the matched pattern above.

```
┌─────────────────────────────────────────┐
│  Header                                 │
├───────────┬─────────────────────────────┤
│  Sidebar  │  Content Area               │
│           │                             │
│           │                             │
├───────────┴─────────────────────────────┤
│  Footer                                 │
└─────────────────────────────────────────┘
```

---

## Sections

### {SectionName}
- **Purpose**: {what this section shows}
- **DS Components used**: {Component (variant, size)}
- **Content**: {what data is displayed}
- **Behavior**: {interactions, scroll, collapse...}

---

## States

| State | Description |
|-------|-------------|
| Empty | {what shows when no data} |
| Loading | {skeleton, spinner...} |
| Populated | {normal state with data} |
| Error | {error message, retry action} |

---

## DS Components Used

> Look up component keys in `.bridge/registries/components.json`.

| Component | Variant/Size | Figma Key | Location |
|-----------|-------------|-----------|----------|
| `{Name}` | {variant} | {key from registry} | {section} |

---

## New DS Components Required

> List UI patterns NOT covered by existing DS components.
> Each one needs its own `spec → design → done` cycle BEFORE this screen is designed.
> If none, write "None — all patterns covered by existing DS components."

| Component Name | Used in Section | Description | Variants Needed |
|---------------|----------------|-------------|-----------------|
| `{Name}` | {section} | {what it does, why existing don't cover it} | {variants/states} |

---

## Content Structure

{Realistic data examples for each section}

---

## Design Tokens

### Layout
| Token | Value | Usage |
|-------|-------|-------|
| `{token}` | {value} | {usage} |

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `{token}` | {value} | {usage} |

---

## Responsive Rules

| Breakpoint | Layout change |
|-----------|---------------|
| Desktop (>1024px) | {layout} |
| Tablet (768-1024px) | {layout} |
| Mobile (<768px) | {layout} |

---

## Acceptance Criteria

- [ ] {criterion}

---

## Open Questions

1. {question}
