import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const results = await Promise.all([
  build({ absWorkingDir: root, entryPoints: ['src/client/index.jsx'], bundle: true, outfile: 'dist/app.js', format: 'esm', platform: 'browser', target: ['chrome120'], jsx: 'automatic', minify: true, legalComments: 'eof', metafile: true, define: { 'process.env.NODE_ENV': '"production"' } }),
  build({ absWorkingDir: root, entryPoints: ['mcp.js'], bundle: true, outfile: 'dist/mcp.mjs', format: 'esm', platform: 'node', target: ['node22'], minify: false, legalComments: 'eof', metafile: true, banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } }),
  build({ absWorkingDir: root, entryPoints: ['cli.js'], bundle: true, outfile: 'dist/cli.mjs', format: 'esm', platform: 'node', target: ['node22'], minify: false, legalComments: 'eof', metafile: true, banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } }),
]);
await copyFile(new URL('../icon.svg', import.meta.url), new URL('../dist/icon.svg', import.meta.url));
await writeFile(new URL('../dist/index.html', import.meta.url), '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>决策画布</title><link rel="icon" href="/icon.svg"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>\n');
const packages = new Set();
for (const result of results) for (const path of Object.keys(result.metafile.inputs)) {
  const match = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); if (match) packages.add(match[1]);
}
const notices = ['# Third-party notices', '', 'This independent project derives its Markdown, graph and UI components from the MIT-licensed dsh-decision-canvas. See LICENSE and UPSTREAM.md.', ''];
for (const name of [...packages].sort()) {
  const pkg = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8'));
  notices.push(`## ${name} ${pkg.version}`, '', `License: ${pkg.license || 'See package'}`, '');
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']) {
    try { notices.push(await readFile(new URL(`../node_modules/${name}/${filename}`, import.meta.url), 'utf8'), ''); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await writeFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), notices.join('\n').trimEnd() + '\n');
console.log(`Built browser, CLI and self-contained MCP server; ${packages.size} dependency notices.`);
