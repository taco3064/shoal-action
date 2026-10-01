# Shoal Reviewer Summary Action

`shoal-action` is the official **distribution repository** for the Shoal Reviewer Summary GitHub Marketplace Action. Reviewer Summary business logic, Protocol parsing, schemas, and the deterministic package source remain owned by [`taco3064/shoal-app`](https://github.com/taco3064/shoal-app).

This repository intentionally contains the root `action.yml`, generated runtime payload, distribution verification, and release machinery only. Do not implement or hand-edit Reviewer Summary behavior here.

## Usage

Production Shoal workflows must pin the Action by an **exact full commit SHA**:

```yaml
- name: Compute Reviewer Summary
  uses: taco3064/shoal-action@<FULL_COMMIT_SHA>
  with:
    network_root_repository_id: '1379044983'
    network_root_repository_name: shoal-station
    github_token: ${{ github.token }}
```

`reviewer_node_repository` is optional and defaults to `GITHUB_REPOSITORY`. The Action writes `reviewer-summary.json` into `GITHUB_WORKSPACE` and does not install dependencies or execute Target Repository code.

A release tag is a distribution/discovery convenience. It is **not** the downstream Shoal trust identity; the canonical Summary Workflow pins the exact `shoal-action` commit SHA.

## Source and deterministic correspondence

The generated payload under `dist/` comes from the accepted `shoal-app` packaging path:

```text
exact shoal-app source commit
→ npm run package:action
→ dist/action-package
→ byte-identical shoal-action/dist
```

`source-package.json` is the committed provenance authority. It records the exact `shoal-app` source commit, that commit's expected tree, the package command, and the package-manifest digest. PR, main/push, and release verification all resolve that tracked source commit, verify its tree, reproduce the package, and require every generated file including `package-manifest.json` to be byte-identical to this repository's `dist/` tree. PR or release text may mirror the source SHA as human-readable evidence, but it is not a trust input.

Local distribution checks:

```bash
npm run verify
npm run smoke
npm run negative
```

To compare against a reproduced `shoal-app` package:

```bash
node scripts/verify-distribution.mjs --source-package /path/to/shoal-app/dist/action-package
```

The verifier rejects payload file-set drift, digest mismatch, a hand-edited generated runtime, and a changed source package paired with stale distribution bytes.

## Exact-candidate verification

PR and tag jobs call the same `.github/actions/verify` composite on Ubuntu and Windows. It resolves the tracked source, verifies both source commit and tree, installs the source lockfile, and calls:

```bash
node scripts/verify-candidate.mjs /path/to/exact-source /tmp/distribution-evidence.json
```

The distribution checkout must be clean. The source checkout must match both recorded identities and be clean before reproduction. The command packages only inside that isolated source checkout, compares the complete 25-file package, executes runtime smoke and negative controls, and verifies that the distribution checkout did not change. This repository has no dependencies to install.

The resulting supplementary evidence binds the exact distribution commit/tree to `source-package.json`, the verified source identity and manifest digest. It is generated outside the candidate to avoid a self-referential commit hash. `source-package.json` remains the committed source-provenance authority; release text is only a mirror. CI evidence is not a second Shoal compatibility or trust authority.

The existing `v0.1.0` payload and its original source remain unchanged and reproducible. The accepted Phase 2 compatibility authority is `shoal-app#23`, merged as `cc102c24646e2da7c95f74f2c11be979556bf67b`. The present runtime still emits the real Protocol 1 / Summary Schema 1 contract. Only `shoal-app` can admit a new Action SHA together with its exact workflow and allowed Summary contract. Publishing this repository does not admit that SHA.

## Release and Marketplace publication

Only tag verification is automated; GitHub Release / Marketplace publication remains an owner action. No workflow creates a competing release. Component release versions do not imply Protocol/schema support.

1. Start from the reviewed, exact-head CI-verified distribution commit. Checkout that commit with a clean worktree. Choose a new unused component version. Fetch tags, then create and push an annotated tag pointing to that exact commit:

   ```bash
   git fetch origin --tags
   git switch --detach <REVIEWED_DISTRIBUTION_COMMIT>
   git tag -a vX.Y.Z <REVIEWED_DISTRIBUTION_COMMIT> -m "Shoal Action vX.Y.Z"
   git push origin refs/tags/vX.Y.Z
   ```

2. Wait for **both** OS jobs in `Release distribution` to succeed. Download `distribution-evidence-ubuntu-latest` from that exact tag run to a directory outside the checkout. For example, using the owner GitHub CLI session:

   ```bash
   gh run view <TAG_RUN_ID> --repo taco3064/shoal-action
   gh run download <TAG_RUN_ID> --repo taco3064/shoal-action --name distribution-evidence-ubuntu-latest --dir /path/outside/checkout/evidence
   node scripts/release-status.mjs vX.Y.Z /path/outside/checkout/evidence/distribution-evidence.json
   ```

   `release-status` checks the remote tag target, current run attempt, successful complete release workflow, and exact local candidate/source/manifest identities. A failed or in-progress run, changed tag/tree/source, or old receipt after rerunning the workflow returns `candidate_verification_failed` with exit 1. Do not publish. A successful gate reports `tag_verification_passed_publication_pending`.

3. Use the repository owner's GitHub release UI to publish from **the existing verified tag**, with the Marketplace publication option enabled. Complete any GitHub owner account / Developer Agreement requirements. Do not select a branch, create another tag, rebuild, or modify metadata during publication.

4. If publication fails, record the observation using:

   ```bash
   node scripts/release-status.mjs vX.Y.Z /path/outside/checkout/evidence/distribution-evidence.json --publication-failed
   ```

   `publication_failed_retryable` retains the same tag, distribution commit/tree, source commit/tree and payload. Resolve the owner-authority / external failure, run the same read-only status check again, and retry the existing tag in the owner UI. The retry command never installs dependencies, packages, rebuilds, commits, or mutates GitHub. If content must change, return through Delivery/Accept/exact-head CI and use a **new component version/tag**. Never move or reuse a public tag for changed bytes.

5. Confirm the public GitHub Release and the Marketplace listing in the owner UI. GitHub Release existence alone does not prove Marketplace publication. After that observation:

   ```bash
   node scripts/release-status.mjs vX.Y.Z /path/outside/checkout/evidence/distribution-evidence.json --marketplace-confirmed
   ```

   `publication_completed` requires a public stable Release and the explicit owner's Marketplace confirmation. The flag records an owner observation; it is not an automated Marketplace probe or Shoal trust admission. Without it, even a public GitHub Release remains publication-pending. Keep this distribution lifecycle evidence outside Reviewer Summary / Network Projection schemas.

These commands use only read-only public GitHub API requests (optional `GITHUB_TOKEN` for rate limits). A required read failure refuses the check. Distribution recovery, release deletion/de-listing, supplementary CI provenance, and component versions cannot change the Action SHA accepted by `shoal-app`. Reviewer Summary Artifact Attestation and the canonical Summary Workflow trust envelope remain mandatory independently.
