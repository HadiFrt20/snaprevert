// Starts the MCP server
const { startServer } = require('../mcp/server');

module.exports = function mcp(_opts) {
  startServer(process.cwd());
};
