import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DecisionCanvasService } from './lib/service.js';
import { decisionCanvasTool } from './lib/tools.js';
import { startHttpServer } from './lib/http-server.js';
import { errorData, check } from './lib/shared.js';

const service = new DecisionCanvasService();
let web;
const assetRoot = new URL('./', import.meta.url); // Bundled beside index.html and app.js.
const tool = decisionCanvasTool(service, async workspaceId => {
  if (workspaceId) await service.workspace(workspaceId);
  web ||= await startHttpServer(service, { assetRoot });
  const context = workspaceId ? await service.dispatch('open_context',{workspaceId}) : {};
  return { ...context, url: web.url(workspaceId, context.contextId), title: '决策画布', presentation: 'In Codex use open_in_codex with placement:right and target:{type:browser,url}. Keep contextId for references(contextId,includeContent:true) in this chat. Other hosts can open this URL in their browser.' };
});
const server = new Server({ name: 'decision-canvas', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    check(request.params.name === tool.name, 'unknown-tool', '未知工具');
    const result = await tool.execute(request.params.arguments || {});
    return { content: [{ type: 'text', text: result.json }], isError: false };
  } catch (error) { return { content: [{ type: 'text', text: JSON.stringify({ error: errorData(error) }) }], isError: true }; }
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await web?.close(); await service.dispose(); await server.close();
}
process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
const transport = new StdioServerTransport();
await server.connect(transport);
transport.onclose = () => { void shutdown(); };
