import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function walk(dir){for(const file of await readdir(join(root,dir),{withFileTypes:true})){const path=join(dir,file.name);if(file.isDirectory())await walk(path);else if(/\.[cm]?js$/.test(file.name))execFileSync(process.execPath,['--check',join(root,path)]);}}
for(const dir of ['lib','tools','test'])await walk(dir);
for(const file of ['mcp.js','cli.js'])execFileSync(process.execPath,['--check',join(root,file)]);
for(const file of ['dist/app.js','dist/app.css','dist/index.html','dist/mcp.mjs','dist/cli.mjs','plugin.json','mcp.json','skills/decision-canvas/SKILL.md','LICENSE'])assert.ok((await stat(join(root,file))).size>0);
const manifest=JSON.parse(await readFile(join(root,'plugin.json'),'utf8'));
assert.equal(manifest.name,'decision-canvas');
const mcp=JSON.parse(await readFile(join(root,'mcp.json'),'utf8'));assert.equal(mcp.mcpServers['decision-canvas'].type,'stdio');
const bundled=await readFile(join(root,'dist/mcp.mjs'),'utf8');
assert.ok(!/from ["']@deepseek-ai\//.test(bundled));
console.log('Source syntax, build outputs and plugin entry points checked.');
