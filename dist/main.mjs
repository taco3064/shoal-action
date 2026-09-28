import { register } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

register('./loader.mjs', import.meta.url);

const { runReviewerSummaryAction } = await import('./src/action/reviewer_summary_action.js');

try {
  const networkRootRepositoryId = parsePositiveInteger(
    requiredInput('network_root_repository_id'),
    'network_root_repository_id',
  );
  const networkRootRepositoryName = requiredInput('network_root_repository_name');
  const reviewerNodeRepository = input('reviewer_node_repository')
    || process.env.GITHUB_REPOSITORY
    || '';

  if (!reviewerNodeRepository) {
    throw new Error(
      'Reviewer Node repository is required through reviewer_node_repository or GITHUB_REPOSITORY.',
    );
  }

  const result = await runReviewerSummaryAction({
    baseUrl: process.env.GITHUB_API_URL || undefined,
    networkRootRepositoryId,
    networkRootRepositoryName,
    reviewerNodeRepository,
    token: input('github_token') || process.env.GITHUB_TOKEN || null,
  });

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const outputPath = resolve(workspace, result.filename);
  await writeFile(outputPath, result.text, 'utf8');
  console.log(`Reviewer Summary written to ${outputPath}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Shoal Reviewer Summary failed: ${message}`);
  process.exitCode = 1;
}

function input(name) {
  return (process.env[`INPUT_${name.toUpperCase()}`] || '').trim();
}

function requiredInput(name) {
  const value = input(name);
  if (!value) throw new Error(`Missing required Action input: ${name}.`);
  return value;
}

function parsePositiveInteger(value, name) {
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error(`Action input ${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Action input ${name} exceeds the safe integer range.`);
  }
  return parsed;
}
