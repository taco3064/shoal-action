import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir, lstat, mkdtemp, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hosted = resolve(root, 'hosted-review');
const recordPath = resolve(root, 'hosted-source-package.json');
const commit = '2c01d267ffe7c910bbf82ceba7553e3bb961056a';
const tree = '7ffa7ec52f296292337a086fdae7d9b7f380b72d';
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
  assert.equal(git(['rev-parse', 'HEAD']), commit, 'Wrong accepted runtime source commit');
  assert.equal(git(['rev-parse', 'HEAD^{tree}']), tree, 'Wrong accepted runtime source tree');
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '', 'Source must be clean');
  const goMod = await readFile(resolve(directory, 'go.mod'), 'utf8');
  assert.match(goMod, /require github\.com\/taco3064\/gh-shoal v0\.8\.0\s*$/u);
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
  for (const [local, upstream] of [['review-request.yml', 'review-request.yml'], ['reviewer-summary-current.yml', 'reviewer-summary-current.yml']]) {
    assert.equal(hash(await readFile(resolve(directory, 'testdata', local))), hash(execFileSync('git', ['-C', source, 'show', `${commit}:reviewruntime/testdata/${upstream}`])));
  }
  // Go's own vendor reproduction checks completeness: omitted imports/embed
  // files, added vendor payloads and changed module records all fail equality.
  const isolated = await mkdtemp(resolve(tmpdir(), 'shoal-host-reproduce-'));
  try {
    await cp(directory, isolated, { recursive: true, filter: (path) => !path.split(/[\\/]/u).some((p) => p === 'node_modules' || p === 'vendor') });
    execFileSync('go', ['mod', 'vendor'], { cwd: isolated, stdio: 'pipe', env: { ...process.env, GOTOOLCHAIN: 'local', GOFLAGS: '', GOENV: 'off' } });
    assert.deepEqual(await inventory(resolve(isolated, 'vendor')), await inventory(resolve(directory, 'vendor')), 'Vendored payload is not reproducible');
  } finally { await rm(isolated, { recursive: true, force: true }); }
  const evidence = {
    formatVersion: 1, sourceRepository: 'taco3064/gh-shoal', sourceCommit: commit, sourceTree: tree,
    module: 'github.com/taco3064/gh-shoal', moduleVersion: 'v0.8.0', publicInterface: 'github.com/taco3064/gh-shoal/reviewruntime',
    actionPath: 'hosted-review', goVersion: '1.25.1', copilotPackage: '@github/copilot', copilotVersion: '1.0.91',
    packaging: 'integrity-locked vendored Go source; compile offline on Linux with -mod=vendor -trimpath -buildvcs=false and CGO_ENABLED=0',
    verification: 'node scripts/hosted-package.mjs <exact-gh-shoal-checkout>',
    files: await inventory(directory),
  };
  if (packageCandidate) await writeFile(record, `${JSON.stringify(evidence, null, 2)}\n`);
  else assert.deepEqual(JSON.parse(await readFile(record, 'utf8')), evidence, 'Complete hosted payload differs from correspondence record');
  return evidence;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2]; assert(source, 'An exact gh-shoal source checkout is required');
  const result = await verifyHosted(source, { packageCandidate: process.argv.includes('--package') });
  console.log(`Hosted correspondence verified: ${result.sourceCommit}; ${Object.keys(result.files).length} payload files; Copilot ${result.copilotVersion}`);
}
