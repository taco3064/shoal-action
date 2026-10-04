import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDistribution, verifySourcePackage } from './verify-distribution.mjs';
import { verifySourceCheckout } from './verify-source-checkout.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'shoal-action-negative-'));
let count = 0;
try {
  for (const [label, mutate] of [
    ['hand-edited runtime', async (r) => writeFile(join(r, 'dist/main.mjs'), '// altered')],
    ['missing payload', async (r) => unlink(join(r, 'dist/main.mjs'))],
    ['extra payload', async (r) => writeFile(join(r, 'dist/extra.mjs'), '// extra')],
    ['manifest digest mismatch', async (r) => writeFile(join(r, 'dist/package-manifest.json'), '{}')],
    ['wrong entry point', async (r) => {
      const path = join(r, 'action.yml');
      await writeFile(path, (await readFile(path, 'utf8')).replace('dist/main.mjs', 'dist/loader.mjs'));
    }],
    ['decoy metadata outside runs', async (r) => {
      const path = join(r, 'action.yml');
      const text = (await readFile(path, 'utf8')).replace('  main: dist/main.mjs', '  main: dist/loader.mjs');
      await writeFile(path, `${text}\ndecoy:\n  main: dist/main.mjs\n`);
    }],
    ['duplicate runs mapping', async (r) => {
      const path = join(r, 'action.yml');
      await writeFile(path, `${await readFile(path, 'utf8')}\nruns:\n  using: node24\n  main: dist/loader.mjs\n`);
    }],
    ['missing entry point', async (r) => {
      const path = join(r, 'action.yml');
      await writeFile(path, (await readFile(path, 'utf8')).replace('dist/main.mjs', 'dist/missing.mjs'));
    }],
    ['stale provenance digest', async (r) => {
      const path = join(r, 'source-package.json');
      const value = JSON.parse(await readFile(path, 'utf8'));
      value.packageManifestSha256 = '0'.repeat(64);
      await writeFile(path, JSON.stringify(value));
    }],
  ]) {
    const root = join(temporaryRoot, `case-${count}`);
    await cp(join(repositoryRoot, 'dist'), join(root, 'dist'), { recursive: true });
    await cp(join(repositoryRoot, 'action.yml'), join(root, 'action.yml'));
    await cp(join(repositoryRoot, 'source-package.json'), join(root, 'source-package.json'));
    await verifyDistribution({ repositoryRoot: root }); // prove fixture is valid before mutation
    await mutate(root);
    await expectFailure(() => verifyDistribution({ repositoryRoot: root }), label);
  }
  const changedPackage = join(temporaryRoot, 'source-package');
  await cp(join(repositoryRoot, 'dist'), changedPackage, { recursive: true });
  await verifySourcePackage(changedPackage);
  await writeFile(join(changedPackage, 'main.mjs'), '// changed source');
  await expectFailure(() => verifySourcePackage(changedPackage), 'stale distribution after source change');

  const source = join(temporaryRoot, 'checkout');
  const git = (args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  await import('node:fs/promises').then((fs) => fs.mkdir(source));
  git(['init', '-q']);
  await writeFile(join(source, 'package.json'), '{}');
  const commit = (message) => git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-q', '--allow-empty', '-m', message]);
  git(['add', '.']); commit('source');
  const provenanceRoot = join(temporaryRoot, 'provenance');
  await import('node:fs/promises').then((fs) => fs.mkdir(provenanceRoot));
  const provenance = JSON.parse(await readFile(join(repositoryRoot, 'source-package.json'), 'utf8'));
  provenance.sourceCommit = git(['rev-parse', 'HEAD']);
  provenance.sourceCandidateTree = git(['rev-parse', 'HEAD^{tree}']);
  const writeProvenance = () => writeFile(join(provenanceRoot, 'source-package.json'), JSON.stringify(provenance));
  await writeProvenance();
  await verifySourceCheckout(source, provenanceRoot);
  commit('same tree, different source commit');
  await expectFailure(() => verifySourceCheckout(source, provenanceRoot), 'stale source commit with equal tree');
  provenance.sourceCommit = git(['rev-parse', 'HEAD']);
  provenance.sourceCandidateTree = '0'.repeat(40);
  await writeProvenance();
  await expectFailure(() => verifySourceCheckout(source, provenanceRoot), 'wrong source tree');
  provenance.sourceCandidateTree = git(['rev-parse', 'HEAD^{tree}']);
  await writeProvenance();
  await verifySourceCheckout(source, provenanceRoot);
  await writeFile(join(source, 'package.json'), '{"changed":true}');
  await expectFailure(() => verifySourceCheckout(source, provenanceRoot), 'dirty source checkout');
  // Exercise the staged verifier's gate in an isolated repository. No source
  // reproduction should start when any candidate content is omitted.
  await import('node:fs/promises').then((fs) => fs.mkdir(join(source, 'scripts')));
  for (const script of ['verify-candidate.mjs', 'verify-distribution.mjs', 'verify-source-checkout.mjs']) {
    await cp(join(repositoryRoot, 'scripts', script), join(source, 'scripts', script));
  }
  git(['add', '.']);
  const rejectedCandidate = (flags, expected) => {
    const result = spawnSync(process.execPath, [join(source, 'scripts/verify-candidate.mjs'),
      join(temporaryRoot, 'absent-source'), ...flags], {
      encoding: 'utf8', env: { ...process.env, EXPECTED_SHA: '' },
    });
    if (result.status !== 1 || !result.stderr.includes(expected)) {
      throw new Error(`Candidate gate did not reject omitted content: ${result.stderr}`);
    }
    count += 1;
  };
  rejectedCandidate([], 'Distribution candidate must be clean.');
  await writeFile(join(source, 'package.json'), '{"unstaged":true}');
  rejectedCandidate(['--staged'], 'no unstaged or untracked files');
  git(['add', '.']);
  await writeFile(join(source, 'omitted.txt'), 'untracked candidate');
  rejectedCandidate(['--staged'], 'no unstaged or untracked files');
  console.log(`Negative controls passed: ${count} fail-closed cases.`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
async function expectFailure(operation, label) {
  try { await operation(); } catch { count += 1; console.log(`Rejected ${label}.`); return; }
  throw new Error(`Negative control failed: verifier accepted ${label}.`);
}
