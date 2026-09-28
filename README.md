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

## Release and Marketplace publication

Tags matching `v*` run deterministic distribution and exact-source verification. GitHub release creation and Marketplace publication are owner-authority steps performed through GitHub's release UI after the tag verification succeeds. Component release versions are independent from Shoal Protocol and Reviewer Summary schema versions.

GitHub Marketplace publication may additionally require repository-owner account actions such as accepting the Marketplace Developer Agreement and satisfying GitHub account security requirements. Those owner-authority steps are not bypassed or claimed as automated by this repository. The release workflow intentionally does not create the GitHub release so it cannot race the Marketplace UI release flow.
