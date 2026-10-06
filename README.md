# Shoal Actions

`shoal-action` is the official **distribution repository** for the Shoal Reviewer Summary GitHub Marketplace Action. Reviewer Summary business logic, Protocol parsing, schemas, and the deterministic package source remain owned by [`taco3064/shoal-app`](https://github.com/taco3064/shoal-app).

The root `action.yml` remains Reviewer Summary. The separate [`hosted-review/action.yml`](hosted-review/action.yml) invokes the accepted `gh-shoal` public runtime with a pinned, isolated Copilot semantic adapter. Review / Re-review lifecycle logic remains owned by `gh-shoal`. Do not implement or hand-edit Reviewer Summary behavior here.

Hosted Review's invocation, authority roles, failure contract, provenance and downstream `shoal-station#17` handoff are documented in [`docs/hosted-review.md`](docs/hosted-review.md). The two Actions have separate source records: `source-package.json` for Summary and `hosted-source-package.json` for Hosted Review.

## Human-first evidence generation

The root Summary distribution now consumes shoal-app#65, source commit `94947abae5f90b5b18233f2ad6d710fe5cd247d9`, tree `eb818036210d02243fdf968044334fb5e174639d`. Its package manifest SHA-256 is `3db6da4a8ea77eaa54c1bf630dfd492248c0aa217762208819c9ff1100ba1bd6`. Canonical evidence format 1 keeps Protocol 1 / Summary Schema 2 and existing S/R/Q/I/P/C semantics. Hosted Review remains on its independently recorded source until shoal-action#18. The immutable verified root Action commit is the shoal-station#26 Stage A handoff.

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
npm run test:runtime
npm run test:compatibility
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

The distribution checkout must be clean for committed PR/main/tag verification. Before commit, stage the complete candidate and run the same verifier with `--staged`:

```bash
node scripts/verify-candidate.mjs /path/to/exact-source /tmp/candidate-evidence.json --staged
```

That mode verifies the index tree, rejects omitted untracked or unstaged files, and checks that the index, tracked working content and base commit remain unchanged. Its supplementary evidence records the base commit and candidate tree; no future distribution commit is invented. The source checkout must match both recorded identities and be clean before reproduction. The command packages only inside that isolated source checkout, compares the complete generated package (including its manifest), executes runtime smoke, packaged-runtime regressions and negative controls, and verifies that the distribution checkout did not change. This repository has no dependencies to install.

The packaged-runtime regressions start `dist/main.mjs` with controlled read-only API fixtures and a temporary output workspace. They prove equivalent Root-owner/direct-fork accounting, reject invalid Membership, and preserve Initial/Manual Review, Re-review, invalid formal result, self-review, Target/Policy freshness, Star-state and Protocol/schema behavior. Both OS candidate jobs invoke these checks. The workload fixtures additionally prove pending Initial Review, completed Initial PASS/FAIL, pending and completed Re-review epochs, terminal no-new-basis resolution, ordering, excluded Requests, and `P + C = R`. Supplemental probes of the distributed schema modules verify exact v1/v2 metric keys, trust-selected validation, invariant rejection, unchanged legacy workflow bindings, and absence of fabricated legacy P/C.

The committed provenance records the accepted source candidate from `shoal-app#32` / PR #46: commit `38db6e8503a0d1c41bc95be97f2fb6fa6a1cf1c3`, tree `76d72f6696150a4b1d3cb193f7c3112559918cd6`. The package manifest SHA-256 is `2a2397fc86225acdf2cca7dd9bb1f84b317f3068a8f4665ac8d4dfc00a181f0d`. This distribution emits Protocol 1 / Summary Schema 2 with exactly the existing R/Q/S/I primitives plus `pendingReviewRequestCount` and `completedReviewRequestCount`. P/C are workload facts, not endorsement or ranking facts.

After owner-authorized merge, the exact verified main commit must preserve the accepted candidate tree. That post-merge Action SHA is the handoff to `shoal-station#13`; `shoal-app#33` separately owns admission of the resulting canonical workflow generation.

The resulting supplementary evidence binds the exact distribution commit/tree to `source-package.json`, the verified source identity and manifest digest. It is generated outside the candidate to avoid a self-referential commit hash. `source-package.json` remains the committed source-provenance authority; release text is only a mirror. CI evidence is not a second Shoal compatibility or trust authority.

The existing `v0.1.0` payload and its original source remain unchanged and reproducible. The accepted Phase 2 compatibility authority is `shoal-app#23`, merged as `cc102c24646e2da7c95f74f2c11be979556bf67b`. Previously trusted workflow generations retain Protocol 1 / Summary Schema 1 without synthetic workload values; this source generation emits Protocol 1 / Summary Schema 2. Only `shoal-app` can admit a new Action SHA together with its exact workflow and allowed Summary contract. Publishing this repository does not admit that SHA.

## Release and Marketplace publication

Only tag verification is automated; GitHub Release / Marketplace publication remains an owner action. No workflow creates a competing release. Component release versions do not imply Protocol/schema support.

1. After owner-authorized merge, identify the exact post-merge main commit, verify that its tree equals the independently accepted candidate tree, and wait for its exact-SHA main verification to succeed. Start from that verified post-merge distribution commit. Checkout that commit with a clean worktree. Choose a new unused component version. Fetch tags, then create and push an annotated tag pointing to that exact commit:

   ```bash
   git fetch origin --tags
   git switch --detach <VERIFIED_POST_MERGE_COMMIT>
   git tag -a vX.Y.Z <VERIFIED_POST_MERGE_COMMIT> -m "Shoal Action vX.Y.Z"
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

## Hosted minimum sufficient evidence

Hosted Copilot remains tool-isolated. The read-only host starts with 20 recent
records per collection: all-state Issues and PRs (including closed/merged),
Issue discussion, inline PR comments, releases, and commits anchored at the
reviewed commit. Repository metadata includes fork, archive and maintenance
fields. This is a disclosed evidence window, not an exhaustive history audit.
Pinned-commit check runs and an immutable parent-head comparison for forks provide targeted CI and fork-specific evidence. Counts alone are not review criteria. Mutable history carries its observation
time and endpoint; Policy and target files remain pinned to immutable Git blobs.

Initial bodies are UTF-8 excerpts with explicit omitted-byte counts and stable
references. Copilot can request only the decisive complete records or files
needed by the Policy, up to eight references per round and three retrieval
rounds. The host resolves only observed references and commit-verified blobs;
it never executes model-supplied URLs, commands or paths. Minimum sufficient
verifiable evidence is enough unless the Policy explicitly requires an audit.

The initial target file selection remains 24 files/192KB; an immutable file
catalog supports additional reads up to 128KB per file. History indexes are
bounded to 750KB and a prompt to 1MB. The full requested history record limit is
128KB. API failures, invalid references, exhausted retrieval or unresolved
criteria produce operational refusal, never a fabricated FAIL. Copilot may
return INSUFFICIENT_EVIDENCE with the specific remaining gap. Existing judgments
and Stars remain owned by the shared runtime. A release record by itself does
not prove a working deployment; sources not inspected must not be called absent.

General GitHub pagination accepts page and before/after cursors while preserving
all query filters. Numeric repository aliases must match an independently read
repository ID; foreign origins and unrelated paths remain refused. Transport is
bounded to 16MB per paginated request. Each Copilot process uses the configured
soft credit ceiling and timeout; a batch can use at most four semantic processes.

This adapter does not rewrite prior events or change re-review eligibility.
Exact Action pins and broker trust admission require a separate verified rollout.
