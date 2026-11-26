import { posix } from 'node:path';
import { check, relativePath } from './shared.js';

export const DEFAULT_WORKFLOW = {
  notesDir: '.agents/notes', evidenceDir: 'docs/ux-evidence', releasesDir: 'docs/releases',
  evidenceReadmes: ['README.md', 'report.md'],
};

export async function readWorkflowConfig(files) {
  const file = await files.readJson('workflow.config.json', { missing: true, maxBytes: 128 * 1024 });
  if (!file) return { ...DEFAULT_WORKFLOW };
  const config = file.value;
  check(config && typeof config === 'object' && !Array.isArray(config), 'invalid-workflow-config', 'workflow.config.json 必须是对象');
  const result = { ...DEFAULT_WORKFLOW };
  for (const [key, field] of [['notes_dir', 'notesDir'], ['evidence_dir', 'evidenceDir'], ['releases_dir', 'releasesDir']]) {
    if (config[key] === undefined) continue;
    const path = relativePath(config[key]);
    check(path !== '.', 'invalid-workflow-config', `${key} 需要指向专用目录`);
    result[field] = path.replace(/\/$/, '');
  }
  if (config.evidence_readmes !== undefined) {
    check(Array.isArray(config.evidence_readmes) && config.evidence_readmes.length > 0 && config.evidence_readmes.length <= 20 &&
      config.evidence_readmes.every(name => typeof name === 'string' && posix.basename(name) === name && !name.includes('\\') && /\.md$/i.test(name)),
    'invalid-workflow-config', 'evidence_readmes 必须是 Markdown 文件名列表');
    result.evidenceReadmes = [...new Set(config.evidence_readmes)];
  }
  return result;
}
