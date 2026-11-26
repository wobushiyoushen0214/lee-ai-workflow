import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, [join(root, 'tools/build.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'tools/package-plugin.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync('codex', ['plugin', 'marketplace', 'add', join(root, '.release'), '--json'], { cwd: root, stdio: 'inherit' });
execFileSync('codex', ['plugin', 'add', 'decision-canvas@lee-ai-workflow-local', '--json'], { cwd: root, stdio: 'inherit' });
console.log('安装完成。在项目聊天调用 $decision-canvas 即可打开；新聊天优先使用 MCP，已有聊天可由 Skill 使用随包 CLI。');
