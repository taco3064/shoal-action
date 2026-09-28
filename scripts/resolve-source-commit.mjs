import { appendFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const provenance = JSON.parse(
  await readFile(resolve(repositoryRoot, 'source-package.json'), 'utf8'),
);
const prBody = process.env.PR_BODY || '';
const match = prBody.match(/^Shoal-Source-Commit:\s*`?([0-9a-f]{40})`?\s*$/imu);
if (!match) {
  throw new Error('PR body must contain `Shoal-Source-Commit: <40-character SHA>`.');
}
const sourceCommit = match[1];
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const token = process.env.GITHUB_TOKEN || '';
const response = await fetch(
  `${apiBase}/repos/${provenance.sourceRepository}/commits/${sourceCommit}`,
  {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  },
);
if (!response.ok) {
  throw new Error(`Failed to read source commit ${sourceCommit}: GitHub returned ${response.status}.`);
}
const commit = await response.json();
const tree = commit?.commit?.tree?.sha;
if (tree !== provenance.sourceCandidateTree) {
  throw new Error(
    `Source commit tree mismatch: expected ${provenance.sourceCandidateTree}, got ${tree || 'missing'}.`,
  );
}
console.log(`Resolved exact shoal-app source commit ${sourceCommit} with candidate tree ${tree}.`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `source_commit=${sourceCommit}\n`, 'utf8');
}
