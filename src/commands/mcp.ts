/**
 * MCP command - starts the MCP server for AI assistant integration
 */

import { startMcpServer } from '../mcp/server.js';

export async function mcp(): Promise<void> {
  await startMcpServer();
}
