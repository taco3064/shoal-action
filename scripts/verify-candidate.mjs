import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDistribution, verifySourcePackage } from './verify-distribution.mjs';
import { verifySourceCheckout } from './verify-source-checkout.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
const evidencePath = process.argv[3];
const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const run = (script) => {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts', script)], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${script} failed.`);
};
try {
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  if (process.env.EXPECTED_SHA && commit !== process.env.EXPECTED_SHA) {
    throw new Error('Distribution checkout is not the exact event candidate.');
  }
  if (git(['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Distribution candidate must be clean.');
  }
  const distribution = await verifyDistribution();
  const sourceIdentity = await verifySourceCheckout(source);
  // The build writes only into the isolated source checkout, never the candidate.
  const packaged = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'package:action'], {
    cwd: source, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (packaged.status !== 0) throw new Error('Exact-source reproduction failed.');
  await verifySourcePackage(resolve(source, 'dist/action-package'));
  run('smoke.mjs');
  run('negative-controls.mjs');
  run('release-state.test.mjs');
  if (git(['status', '--porcelain', '--untracked-files=all']) || git(['rev-parse', 'HEAD']) !== commit) {
    throw new Error('Verification mutated the distribution candidate.');
  }
  const evidence = {
    formatVersion: 1,
    state: process.env.GITHUB_REF_TYPE === 'tag' ? 'tag_verification_passed_publication_pending' : 'candidate_verified',
    distributionRepository: 'taco3064/shoal-action', distributionCommit: commit, distributionTree: tree,
    source: JSON.parse(await readFile(resolve(root, 'source-package.json'), 'utf8')),
    verifiedSource: sourceIdentity, ...distribution,
    runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    trustAdmission: 'requires_explicit_platform_approval',
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  console.error(JSON.stringify({ state: 'candidate_verification_failed', reason: error.message }));
  process.exitCode = 1;
}
