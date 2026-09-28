import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDistribution, verifySourcePackage } from './verify-distribution.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'shoal-action-negative-'));

try {
  const alteredDistribution = join(temporaryRoot, 'distribution');
  await cp(repositoryRoot, alteredDistribution, { recursive: true });
  const alteredMain = join(alteredDistribution, 'dist', 'main.mjs');
  await writeFile(alteredMain, `${await readFile(alteredMain, 'utf8')}\n// altered\n`, 'utf8');
  await expectFailure(
    () => verifyDistribution({ repositoryRoot: alteredDistribution }),
    'hand-edited distribution runtime',
  );

  const changedSourcePackage = join(temporaryRoot, 'source-package');
  await cp(join(repositoryRoot, 'dist'), changedSourcePackage, { recursive: true });
  const changedSourceFile = join(changedSourcePackage, 'src', 'action', 'reviewer_summary_action.js');
  await writeFile(
    changedSourceFile,
    `${await readFile(changedSourceFile, 'utf8')}\n// changed source package\n`,
    'utf8',
  );
  await expectFailure(
    () => verifySourcePackage(changedSourcePackage),
    'changed source package with stale distribution',
  );

  console.log('Negative controls passed: hand edits and stale distribution are both rejected.');
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

async function expectFailure(operation, label) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`Negative control failed: verifier accepted ${label}.`);
}
