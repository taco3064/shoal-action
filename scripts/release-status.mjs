import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDistribution } from './verify-distribution.mjs';
import { publicationState } from './release-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [tagName, evidencePath] = process.argv.slice(2);
if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/u.test(tagName || '') || !evidencePath) {
  throw new Error('Usage: node scripts/release-status.mjs vX.Y.Z /path/to/distribution-evidence.json [--publication-failed | --marketplace-confirmed]');
}
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
if (!/^[0-9]+$/u.test(String(evidence.runId)) || !/^[0-9]+$/u.test(String(evidence.runAttempt))) {
  throw new Error('Evidence must identify the successful tag workflow run attempt.');
}
const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Candidate must be clean.');
await verifyDistribution();
const candidate = {
  commit: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']),
  source: JSON.parse(await readFile(resolve(root, 'source-package.json'), 'utf8')),
};
const api = async (path, optional = false) => {
  const response = await fetch(`https://api.github.com/repos/taco3064/shoal-action/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`Required GitHub read failed: ${response.status}.`);
  return response.json();
};
let object = (await api(`git/ref/tags/${encodeURIComponent(tagName)}`)).object;
let depth = 0;
while (object.type === 'tag') {
  if (++depth > 8) throw new Error('Tag nesting exceeds safety bound.');
  object = (await api(`git/tags/${object.sha}`)).object;
}
if (object.type !== 'commit') throw new Error('Tag must resolve to a commit.');
// Read the current run, not an older successful attempt after a failed rerun.
const run = await api(`actions/runs/${evidence.runId}`);
const release = await api(`releases/tags/${encodeURIComponent(tagName)}`, true);
const result = publicationState({
  candidate, evidence, run, tag: { name: tagName, commit: object.sha }, release,
  publicationFailed: process.argv.includes('--publication-failed'),
  marketplaceConfirmed: process.argv.includes('--marketplace-confirmed'),
});
console.log(JSON.stringify(result, null, 2));
if (!result.publicationEligible) process.exitCode = 1;
