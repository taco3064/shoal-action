import { existsSync } from 'node:fs';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('~app/')) {
    const resolved = resolvePackageFile(
      resolvePath(packageRoot, 'src', specifier.slice('~app/'.length)),
    );
    if (resolved) return { shortCircuit: true, url: resolved };
  }

  if (specifier.startsWith('~protocol/')) {
    const resolved = resolvePackageFile(
      resolvePath(packageRoot, 'protocol', specifier.slice('~protocol/'.length)),
    );
    if (resolved) return { shortCircuit: true, url: resolved };
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL?.startsWith('file:')
  ) {
    const resolved = resolvePackageFile(
      fileURLToPath(new URL(specifier, context.parentURL)),
    );
    if (resolved) return { shortCircuit: true, url: resolved };
  }

  return nextResolve(specifier, context);
}

function resolvePackageFile(basePath) {
  const candidates = extname(basePath)
    ? [basePath]
    : [`${basePath}.js`, resolvePath(basePath, 'index.js')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }

  return null;
}
