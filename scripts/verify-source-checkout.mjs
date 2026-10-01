import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertProvenance } from './verify-distribution.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function verifySourceCheckout(sourcePath, root = repositoryRoot) {
  if (!sourcePath) throw new Error('Source checkout path is required.');
  const provenance = JSON.parse(await readFile(resolve(root, 'source-package.json'), 'utf8'));
  assertProvenance(provenance);
  const git = (args) => execFileSync('git', ['-C', sourcePath, ...args], { encoding: 'utf8' }).trim();
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  if (commit !== provenance.sourceCommit || tree !== provenance.sourceCandidateTree) {
    throw new Error(`Source checkout identity mismatch: got ${commit} / ${tree}.`);
  }
  if (git(['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Source checkout must be clean before reproduction.');
  }
  return { commit, tree };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifySourceCheckout(process.argv[2])));
}
