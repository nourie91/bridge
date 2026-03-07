# Extract your Design System

These scripts extract component keys, variable keys, and text style keys from any Figma DS library. The output is JSON files that Claude Code can use to import your real DS assets.

## Prerequisites

1. Bridge server running: `node server/server.js`
2. Your DS library file open in Figma
3. Bridge plugin active (Plugins > Bridge for Claude Code)

## Usage

```bash
# Extract components (open your Components library file first)
cat extract/extract-components.js | jq -Rs '{"action":"runScript","code":.}' | \
  curl -s --max-time 60 -X POST http://localhost:9001/command \
  -H "Content-Type: application/json" -d @- | jq '.result' > registries/components.json

# Extract variables (open your Foundations/Tokens library file first)
cat extract/extract-variables.js | jq -Rs '{"action":"runScript","code":.}' | \
  curl -s --max-time 60 -X POST http://localhost:9001/command \
  -H "Content-Type: application/json" -d @- | jq '.result' > registries/variables.json

# Extract text styles (same Foundations file)
cat extract/extract-text-styles.js | jq -Rs '{"action":"runScript","code":.}' | \
  curl -s --max-time 60 -X POST http://localhost:9001/command \
  -H "Content-Type: application/json" -d @- | jq '.result' > registries/text-styles.json
```

## Output format

### components.json

```json
{
  "count": 116,
  "components": [
    {
      "name": "Button",
      "key": "784e6838...",
      "type": "COMPONENT_SET",
      "variantCount": 12,
      "properties": {
        "variant": { "type": "VARIANT", "variantOptions": ["primary", "secondary"] },
        "size": { "type": "VARIANT", "variantOptions": ["small", "medium", "large"] }
      }
    }
  ]
}
```

### variables.json

```json
{
  "count": 660,
  "variables": [
    {
      "name": "color/background/surface/subtle",
      "key": "ab3fcf61...",
      "type": "COLOR",
      "collection": "color",
      "modes": ["dark", "light"]
    }
  ]
}
```

### text-styles.json

```json
{
  "count": 49,
  "textStyles": [
    {
      "name": "heading/md/bold",
      "key": "39c0d8cc...",
      "fontFamily": "Inter",
      "fontSize": 24,
      "fontWeight": 700
    }
  ]
}
```

## Tips

- For large libraries, extraction may take a few seconds
- If you get a timeout, the library may have too many items on one page — try opening a specific page first
- Re-run extraction when your DS is updated (new components, renamed tokens, etc.)
- Add the registries JSON to your project's CLAUDE.md so Claude Code knows your DS keys
