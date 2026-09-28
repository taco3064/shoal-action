import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function verifyDistribution(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const distributionRoot = options.distributionRoot ?? join(root, 'dist');
  const metadataPath = join(root, 'action.yml');
  const provenancePath = join(root, 'source-package.json');
  const manifestPath = join(distributionRoot, 'package-manifest.json');

  const metadata = await readFile(metadataPath, 'utf8');
  assertMetadata(metadata, root);

  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  assertProvenance(provenance);

  const manifestBytes = await readFile(manifestPath);
  const manifestDigest = sha256(manifestBytes);
  if (manifestDigest !== provenance.packageManifestSha256) {
    throw new Error(
      `Package manifest digest mismatch: expected ${provenance.packageManifestSha256}, got ${manifestDigest}.`,
    );
  }

  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Unsupported or malformed package manifest.');
  }

  const actualFiles = (await listFiles(distributionRoot))
    .map((path) => normalize(relative(distributionRoot, path)))
    .filter((path) => path !== 'package-manifest.json')
    .sort();
  const declaredFiles = manifest.files.map((entry) => entry.path).sort();

  if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
    throw new Error('Distribution file set does not exactly match the package manifest.');
  }

  for (const entry of manifest.files) {
    if (
      !entry
      || typeof entry.path !== 'string'
      || typeof entry.sha256 !== 'string'
      || !Number.isSafeInteger(entry.size)
      || entry.size < 0
    ) {
      throw new Error('Malformed package manifest file entry.');
    }

    const bytes = await readFile(join(distributionRoot, entry.path));
    if (bytes.byteLength !== entry.size) {
      throw new Error(`Size mismatch for ${entry.path}.`);
    }
    const digest = sha256(bytes);
    if (digest !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.path}.`);
    }
  }

  if (!existsSync(join(distributionRoot, 'main.mjs'))) {
    throw new Error('Declared Action entry point dist/main.mjs does not exist.');
  }

  return { manifestDigest, payloadFileCount: manifest.files.length };
}

export async function verifySourcePackage(sourcePackageRoot, options = {}) {
  if (!sourcePackageRoot) {
    throw new Error('Source package path is required.');
  }
  const root = options.repositoryRoot ?? repositoryRoot;
  const distributionRoot = options.distributionRoot ?? join(root, 'dist');
  const expectedFiles = (await listFiles(distributionRoot))
    .map((path) => normalize(relative(distributionRoot, path)))
    .sort();
  const sourceRoot = resolve(sourcePackageRoot);
  const sourceFiles = (await listFiles(sourceRoot))
    .map((path) => normalize(relative(sourceRoot, path)))
    .sort();

  if (JSON.stringify(expectedFiles) !== JSON.stringify(sourceFiles)) {
    throw new Error('Source package and distribution file sets differ.');
  }

  for (const path of expectedFiles) {
    const [distributionBytes, sourceBytes] = await Promise.all([
      readFile(join(distributionRoot, path)),
      readFile(join(sourceRoot, path)),
    ]);
    if (!distributionBytes.equals(sourceBytes)) {
      throw new Error(`Source package differs from distribution at ${path}.`);
    }
  }

  return { fileCount: expectedFiles.length };
}

function assertMetadata(metadata, root) {
  const metadataFiles = ['action.yml', 'action.yaml'].filter((name) =>
    existsSync(join(root, name)),
  );
  if (metadataFiles.length !== 1) {
    throw new Error(`Expected exactly one root Action metadata file, found ${metadataFiles.length}.`);
  }
  if (!/^runs:\s*$/mu.test(metadata) || !/^\s+using:\s*node24\s*$/mu.test(metadata)) {
    throw new Error('Action metadata must declare the Node 24 JavaScript runtime.');
  }
  if (!/^\s+main:\s*dist\/main\.mjs\s*$/mu.test(metadata)) {
    throw new Error('Action metadata must point runs.main to dist/main.mjs.');
  }
}

function assertProvenance(value) {
  if (
    !value
    || value.formatVersion !== 1
    || value.sourceRepository !== 'taco3064/shoal-app'
    || !/^[0-9a-f]{40}$/u.test(value.sourceCommit)
    || !/^[0-9a-f]{40}$/u.test(value.sourceCandidateTree)
    || value.packageCommand !== 'npm run package:action'
    || !/^[0-9a-f]{64}$/u.test(value.packageManifestSha256)
  ) {
    throw new Error('Malformed source-package provenance metadata.');
  }
}

async function listFiles(root) {
  if (!existsSync(root)) return [];
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFiles(path));
    } else if (entry.isFile()) {
      results.push(path);
    }
  }
  return results.sort();
}

function normalize(path) {
  return path.split(sep).join('/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const sourceFlagIndex = process.argv.indexOf('--source-package');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const distribution = await verifyDistribution();
  console.log(
    `Verified distribution manifest ${distribution.manifestDigest} (${distribution.payloadFileCount} payload files).`,
  );
  if (sourceFlagIndex !== -1) {
    const sourcePath = process.argv[sourceFlagIndex + 1];
    const source = await verifySourcePackage(sourcePath);
    console.log(`Verified byte-identical source package correspondence (${source.fileCount} files).`);
  }
}
