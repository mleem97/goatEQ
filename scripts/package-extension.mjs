import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const artifactRoot = resolve(root, 'artifacts');
const stagingRoot = resolve(root, '.package-staging');
const targets = ['chrome', 'firefox'];
const sourceEntries = [
  'CHANGELOG.md',
  'README.md',
  'audio-engine.js',
  'design-qa.md',
  'docs',
  'goateq16.png',
  'goateq32.png',
  'goateq48.png',
  'goateq64.png',
  'goateq128.png',
  'goateq_transsource.png',
  'index.html',
  'manifest.firefox.json',
  'manifest.json',
  'mastering-worklet.js',
  'offscreen.html',
  'package-lock.json',
  'package.json',
  'scripts',
  'service-worker.js',
  'src',
  'tests',
  'vite.config.js'
];

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(artifactRoot, { recursive: true });

for (const target of targets) {
  const staging = resolve(stagingRoot, target);
  mkdirSync(staging, { recursive: true });
  cpSync(resolve(root, 'dist'), staging, { recursive: true });
  if (target === 'firefox') {
    writeFileSync(resolve(staging, 'manifest.json'), readFileSync(resolve(root, 'manifest.firefox.json')));
  }
  const output = resolve(artifactRoot, `goatEQ-v${version}-${target}.zip`);
  rmSync(output, { force: true });
  const result = spawnSync('zip', ['-qr', output, '.'], { cwd: staging, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Failed to package ${target}`);
}

const sourceOutput = resolve(artifactRoot, `goatEQ-v${version}-source.zip`);
rmSync(sourceOutput, { force: true });
const sourceResult = spawnSync('zip', ['-qr', sourceOutput, ...sourceEntries], { cwd: root, stdio: 'inherit' });
if (sourceResult.status !== 0) throw new Error('Failed to package source');

rmSync(stagingRoot, { recursive: true, force: true });
console.log(`Created goatEQ ${version} Chrome, Firefox and source packages in ${artifactRoot}`);
