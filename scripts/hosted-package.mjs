import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir, lstat, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hosted = resolve(root, 'hosted-review');
const recordPath = resolve(root, 'hosted-source-package.json');
const commit = 'd7e0e1fb7efdd8923ed46a493147299d8e629f0f';
const tree = '0af19296794f8c1d523120ea3d7e4bb9f069fba9';
const moduleVersion = 'v0.11.2';
const hash = (b) => createHash('sha256').update(b).digest('hex');
async function inventory(directory) {
  const files = {};
  async function visit(path) {
    for (const entry of (await readdir(path)).sort()) {
      if (entry === 'node_modules') continue;
      const full = resolve(path, entry), stat = await lstat(full);
      assert(!stat.isSymbolicLink(), 'Payload must not contain symlinks');
      if (stat.isDirectory()) await visit(full);
      else { assert(stat.isFile()); files[relative(directory, full).split('\\').join('/')] = hash(await readFile(full)); }
    }
  }
  await visit(directory);
  return files;
}
export async function verifyHosted(source, { packageCandidate = false, directory = hosted, record = recordPath } = {}) {
  const git = (args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), commit, 'Wrong pinned runtime source commit');
  assert.equal(git(['rev-parse', 'HEAD^{tree}']), tree, 'Wrong pinned runtime source tree');
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '', 'Source must be clean');
  const goMod = await readFile(resolve(directory, 'go.mod'), 'utf8');
  assert(goMod.trimEnd().endsWith(`require github.com/taco3064/gh-shoal ${moduleVersion}`), 'Wrong pinned module generation');
  assert(!goMod.includes('replace'), 'No runtime replacement permitted');
  const lock = JSON.parse(await readFile(resolve(directory, 'copilot/package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].dependencies['@github/copilot'], '1.0.91');
  assert.equal(lock.packages['node_modules/@github/copilot'].version, '1.0.91');
  for (const [name, value] of Object.entries(lock.packages)) {
    if (!name) continue;
    assert(value.integrity?.startsWith('sha512-'), 'All npm payloads require locked integrity');
    if (name.startsWith('node_modules/@github/copilot')) assert.equal(value.version, '1.0.91');
  }
  const hostSource = await readFile(resolve(directory, 'host.go'), 'utf8');
  assert(hostSource.includes(`const SourceCommit = "${commit}"`));
  assert(hostSource.includes('const CopilotVersion = "1.0.91"'));
  // Vendored upstream files must be byte-identical to the accepted Git tree.
  const vendor = resolve(directory, 'vendor/github.com/taco3064/gh-shoal');
  const upstreamFiles = await inventory(vendor);
  for (const [path, digest] of Object.entries(upstreamFiles)) {
    assert.equal(hash(execFileSync('git', ['-C', source, 'show', `${commit}:${path}`])), digest, `Stale or hand-edited runtime: ${path}`);
  }
  for (const [local, upstream] of [['reviewer-summary-f02.yml', 'reviewer-summary-f02.yml'], ['reviewer-summary-f01.yml', 'reviewer-summary-f01.yml'], ['reviewer-summary-human-first.yml', 'reviewer-summary-human-first.yml'], ['review-request.yml', 'review-request.yml'], ['reviewer-summary-current.yml', 'reviewer-summary-current.yml'], ['reviewer-summary-hosted.yml', 'reviewer-summary-hosted.yml'], ['reviewer-summary-final-hosted.yml', 'reviewer-summary-final-hosted.yml']]) {
    assert.equal(hash(await readFile(resolve(directory, 'testdata', local))), hash(execFileSync('git', ['-C', source, 'show', `${commit}:reviewruntime/testdata/${upstream}`])));
  }
  // Reproduce exclusively from the identity-checked source checkout. This also
  // supports coordinated, not-yet-published commits without trusting a proxy.
  const reproduced = await reproduceVendor(source, directory);
  try {
    assert.deepEqual(await inventory(resolve(reproduced, 'vendor')), await inventory(resolve(directory, 'vendor')), 'Vendored payload is not reproducible');
  } finally { await rm(reproduced, { recursive: true, force: true }); }
  const evidence = {
    formatVersion: 1, sourceRepository: 'taco3064/gh-shoal', sourceCommit: commit, sourceTree: tree,
    module: 'github.com/taco3064/gh-shoal', moduleVersion, publicInterface: 'github.com/taco3064/gh-shoal/reviewruntime',
    actionPath: 'hosted-review', goVersion: '1.25.1', copilotPackage: '@github/copilot', copilotVersion: '1.0.91',
    packaging: 'integrity-locked vendored Go source; compile offline on Linux with -mod=vendor -trimpath -buildvcs=false and CGO_ENABLED=0',
    verification: 'node scripts/hosted-package.mjs <exact-gh-shoal-checkout>',
    files: await inventory(directory),
  };
  if (packageCandidate) await writeFile(record, `${JSON.stringify(evidence, null, 2)}\n`);
  else assert.deepEqual(JSON.parse(await readFile(record, 'utf8')), evidence, 'Complete hosted payload differs from correspondence record');
  return evidence;
}
async function reproduceVendor(source, directory) {
  source = resolve(source);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', 'HEAD'), commit, 'Wrong pinned source commit');
  assert.equal(git('rev-parse', 'HEAD^{tree}'), tree, 'Wrong pinned source tree');
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Source must be clean');
  const isolated = await mkdtemp(resolve(tmpdir(), 'shoal-host-reproduce-'));
  try {
    await cp(directory, isolated, { recursive: true, filter: (path) => !path.split(/[\\/]/u).some((p) => p === 'node_modules' || p === 'vendor') });
    // Archive committed bytes, not a Windows checkout's CRLF conversions.
    const exactSource = resolve(isolated, '.runtime-source');
    await mkdir(exactSource);
    const archive = execFileSync('git', ['-c', 'core.autocrlf=false', '-C', source, 'archive', commit], { maxBuffer: 32 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-', '-C', exactSource], { input: archive });
    const options = { cwd: isolated, stdio: 'pipe', env: { ...process.env, GOTOOLCHAIN: 'local', GOFLAGS: '', GOENV: 'off', GOWORK: 'off', GOPROXY: 'off', GOSUMDB: 'off' } };
    // Replacement exists only in the disposable reproduction directory. The
    // committed go.mod is checked above and must never contain a replacement.
    execFileSync('go', ['mod', 'edit', `-replace=github.com/taco3064/gh-shoal=${exactSource}`], options);
    execFileSync('go', ['mod', 'vendor'], options);
    const modules = resolve(isolated, 'vendor/modules.txt');
    const lines = (await readFile(modules, 'utf8')).split('\n');
    const header = `# github.com/taco3064/gh-shoal ${moduleVersion}`;
    const normalized = lines.filter(line => !line.startsWith('# github.com/taco3064/gh-shoal => '))
      .map(line => line.startsWith(header + ' => ') ? header : line).join('\n');
    await writeFile(modules, normalized);
    return isolated;
  } catch (error) { await rm(isolated, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2]; assert(source, 'An exact gh-shoal source checkout is required');
  if (process.argv.includes('--refresh-vendor')) {
    const reproduced = await reproduceVendor(source, hosted);
    try {
      await rm(resolve(hosted, 'vendor'), { recursive: true, force: true });
      await cp(resolve(reproduced, 'vendor'), resolve(hosted, 'vendor'), { recursive: true });
    } finally { await rm(reproduced, { recursive: true, force: true }); }
  }
  const result = await verifyHosted(source, { packageCandidate: process.argv.includes('--package') });
  console.log(`Hosted correspondence verified: ${result.sourceCommit}; ${Object.keys(result.files).length} payload files; Copilot ${result.copilotVersion}`);
}
