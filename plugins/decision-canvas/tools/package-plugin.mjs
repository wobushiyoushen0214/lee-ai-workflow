import { mkdir, cp, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, '.release');
const plugin = join(release, 'plugins', 'decision-canvas');
await mkdir(plugin, { recursive: true });
for (const name of ['dist', 'skills']) await cp(join(root, name), join(plugin, name), { recursive: true });
for (const name of ['plugin.json', 'mcp.json', 'README.md', 'VALIDATION.md', 'UPSTREAM.md', 'DESIGN-LICENSE.txt', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'icon.svg']) await copyFile(join(root, name), join(plugin, name));
// A desktop GUI may have a different PATH from the user's shell. Package the local Node location.
const mcp = JSON.parse(await readFile(join(plugin, 'mcp.json'), 'utf8'));
mcp.mcpServers['decision-canvas'].command = process.execPath;
await writeFile(join(plugin, 'mcp.json'), JSON.stringify(mcp, null, 2) + '\n');
await mkdir(join(release, '.agents', 'plugins'), { recursive: true });
await writeFile(join(release, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
  name: 'lee-ai-workflow-local', interface: { displayName: 'Lee AI Workflow' },
  plugins: [{ name: 'decision-canvas', source: { source: 'local', path: './plugins/decision-canvas' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
}, null, 2) + '\n');
console.log(JSON.stringify({ marketplace: release, plugin }));
