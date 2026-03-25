const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Check which Figma MCP transports are configured in Claude Code settings.
 * Returns { console: boolean, official: boolean }.
 */
function checkMcp() {
  const locations = [
    path.join(os.homedir(), '.claude.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(process.cwd(), '.claude', 'settings.local.json'),
  ];

  const result = { console: false, official: false };

  for (const loc of locations) {
    if (!fs.existsSync(loc)) continue;
    try {
      const content = JSON.parse(fs.readFileSync(loc, 'utf8'));
      const servers = content.mcpServers || {};
      for (const [name, config] of Object.entries(servers)) {
        if (!name.toLowerCase().includes('figma')) continue;

        // Check for figma-console-mcp
        if (config.command) {
          const args = (config.args || []).join(' ');
          if (args.includes('figma-console-mcp')) {
            result.console = true;
            continue;
          }
        }

        // Check for official Figma MCP (server named "figma" or similar,
        // but NOT figma-console-mcp)
        const isConsole = config.command &&
          (config.args || []).join(' ').includes('figma-console-mcp');
        if (!isConsole) {
          result.official = true;
        }
      }
    } catch (_) {}
  }

  return result;
}

module.exports = { checkMcp };
