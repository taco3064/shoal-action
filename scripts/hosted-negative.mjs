import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHosted } from './hosted-package.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
for (const control of ['runtime-edit', 'runtime-omission', 'runtime-addition', 'copilot-pin', 'adapter-edit', 'module-replace', 'vendor-module-metadata', 'hosted-fixture-edit', 'final-caller-edit', 'human-first-caller-edit', 'f01-caller-edit']) {
  const temp = await mkdtemp(resolve(tmpdir(), 'shoal-host-negative-'));
  try {
    const directory = resolve(temp, 'hosted-review');
    await cp(resolve(root, 'hosted-review'), directory, { recursive: true, filter: (p) => !p.split(/[\\/]/u).includes('node_modules') });
    const runtime = resolve(directory, 'vendor/github.com/taco3064/gh-shoal/reviewruntime/runtime.go');
    if (control === 'runtime-edit') await writeFile(runtime, `${await readFile(runtime, 'utf8')}\n// stale\n`);
    if (control === 'runtime-omission') await rm(runtime);
    if (control === 'runtime-addition') await writeFile(resolve(directory, 'vendor/foreign.go'), 'package foreign\n');
    if (control === 'copilot-pin') {
      const p = resolve(directory, 'copilot/package-lock.json');
      await writeFile(p, (await readFile(p, 'utf8')).replaceAll('1.0.91', '1.0.92'));
    }
    if (control === 'adapter-edit') await writeFile(resolve(directory, 'host.go'), `${await readFile(resolve(directory, 'host.go'), 'utf8')}\n// hand edit\n`);
    if (control === 'module-replace') {
      const p = resolve(directory, 'go.mod');
      await writeFile(p, `${await readFile(p, 'utf8')}\nreplace github.com/taco3064/gh-shoal => ../untrusted\n`);
    }
    if (control === 'vendor-module-metadata') await writeFile(resolve(directory, 'vendor/modules.txt'), '# untrusted module\n');
    if (control === 'hosted-fixture-edit') await writeFile(resolve(directory, 'testdata/reviewer-summary-hosted.yml'), 'untrusted caller\n');
    if (control === 'human-first-caller-edit') await writeFile(resolve(directory, 'testdata/reviewer-summary-human-first.yml'), 'untrusted human-first caller\n');
    if (control === 'f01-caller-edit') await writeFile(resolve(directory, 'testdata/reviewer-summary-f01.yml'), 'untrusted repaired caller\n');
    if (control === 'final-caller-edit') await writeFile(resolve(directory, 'testdata/reviewer-summary-final-hosted.yml'), 'untrusted final caller\n');
    await assert.rejects(() => verifyHosted(source, { directory }), `Control did not reject ${control}`);
    console.log(`PASS hosted negative: ${control}`);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
