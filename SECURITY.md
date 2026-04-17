# Security Policy

## Reporting vulnerabilities

If you discover a security vulnerability in Bridge, please **do not** open a public issue. Instead, email the maintainer directly: https://github.com/noemuch (follow the contact link in the profile).

We aim to acknowledge reports within 48 hours and ship a fix within 7 days for critical issues.

## Token handling

Bridge requires a Figma Personal Access Token (`FIGMA_TOKEN`) to extract design-system data from Figma.

**Scope minimization (user responsibility):** Generate tokens with read-only scopes:

- `File content` → Read-only
- `File variables` → Read-only (Enterprise plans only)
- `Library content` → Read-only

**Lifecycle hygiene:**

- Tokens pasted interactively in Claude Code use a stdin-only pipe (no echo, no shell history).
- Tokens are validated in-memory, then sent directly to GitHub Secrets via `gh secret set` (stdin-piped, never via argv).
- Tokens never touch `process.env`, `.env` files, or local logs.
- Token values are masked to `figd_***<last4>` in any log output.

**Rotation (user responsibility):** Rotate your `FIGMA_TOKEN` every 90 days or immediately if compromised.

## Supply chain

`@noemuch/bridge-ds` is published to npm with `--access public`.

**User mitigation:** Pin Bridge versions in your cron workflow:

```yaml
- run: npx -y @noemuch/bridge-ds@6.0.0 cron --config docs.config.yaml
```

**CI considerations:** The `bridge-kb-cron.yml` workflow runs inside GitHub Actions with access to `FIGMA_TOKEN`. Scope this secret to that workflow file only; do not add it to other workflows.

## Known limitations

- **figma-console-mcp** (the MCP server for interactive extraction) is a third-party unofficial tool. Its WebSocket runs on localhost. Mitigation: the WebSocket pairs only with Figma Desktop; no tokens transit through it.
- **Figma REST API for variables** requires an Enterprise plan. Non-Enterprise users will see a 403 for `/variables/local` and fall back to a reduced extract (components + text styles only). Interactive MCP extraction bypasses this limitation.

---

_Last updated: 2026-04-17_
