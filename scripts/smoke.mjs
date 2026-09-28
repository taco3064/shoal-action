import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [join(repositoryRoot, 'dist', 'main.mjs')], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    INPUT_NETWORK_ROOT_REPOSITORY_ID: '',
    INPUT_NETWORK_ROOT_REPOSITORY_NAME: '',
  },
});

if (result.status !== 1) {
  throw new Error(`Expected packaged Action to fail closed with exit 1, got ${result.status}.`);
}

const expected = 'Missing required Action input: network_root_repository_id.';
if (!result.stderr.includes(expected)) {
  throw new Error(`Packaged Action did not reach input validation. stderr: ${result.stderr}`);
}

console.log('Packaged Node 24 entry point started and failed closed at required-input validation.');
