import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Source checkout path is required.');
const provenance = JSON.parse(await readFile(resolve(repositoryRoot, 'source-package.json'), 'utf8'));
const commit = git(['rev-parse', 'HEAD']);
const tree = git(['rev-parse', 'HEAD^{tree}']);
if (tree !== provenance.sourceCandidateTree) {
  throw new Error(`Source checkout tree mismatch: expected ${provenance.sourceCandidateTree}, got ${tree}.`);
}
console.log(`Verified source checkout ${commit} with accepted candidate tree ${tree}.`);

function git(args) {
  return execFileSync('git', ['-C', sourcePath, ...args], { encoding: 'utf8' }).trim();
}
