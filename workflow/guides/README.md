# 🧱 Knowledge Base — Guides

These guides are generated during `bridge init` by analyzing your extracted DS registries and UI reference screenshots.

## Structure

```
guides/
  design-patterns.md          ← Your app's layout patterns (built from screenshots)
  tokens/
    color-usage.md             ← Color token decision tree
    spacing-usage.md           ← Spacing scale + usage contexts
    typography-usage.md        ← Type hierarchy + font families
  components/
    overview.md                ← Component decision tree (which component for which need)
    {group}.md                 ← Guides per component group (actions, form-controls, etc.)
  patterns/
    navigation-patterns.md     ← Navigation patterns in your app
    form-patterns.md           ← Form layout patterns
    feedback-patterns.md       ← Feedback/status patterns
    multi-step-flow.md         ← Multi-step flow patterns
  assets/
    icons.md                   ← Available icons guide
    logos.md                   ← Available logos guide
    illustrations.md           ← Available illustrations guide
```

## How to rebuild

If your DS evolves, re-run:
```bash
bridge extract
```
Then ask Claude Code to regenerate the guides from the updated registries.
