# Hosted Review integration contract

`hosted-review/action.yml` is the stable Hosted Review Action entrypoint for
`shoal-station#17`. It invokes `github.com/taco3064/gh-shoal/reviewruntime`; it does
not replace the root Reviewer Summary Action or implement a second lifecycle.

## Immutable source and distribution

| Fact | Value |
| --- | --- |
| Action path | `taco3064/shoal-action/hosted-review@<FULL_ACTION_COMMIT_SHA>` |
| Pinned runtime candidate | `taco3064/gh-shoal@978d2fec6b036ecd9453a95b3e2fcbd4b44ec6a3` |
| Pinned source tree | `c87e3c411e18cc8300b7c4402e8072229babfbec` |
| Exact module candidate | `v0.8.1-0.20261005115422-978d2fec6b03` |
| Public interface | `github.com/taco3064/gh-shoal/reviewruntime` |
| Copilot | `@github/copilot` exactly `1.0.91` |
| Host toolchain | Go `1.25.1`, Node `24.19.0` |
| Supported hosted runners | Linux, supported Copilot x64/arm64 native npm packages |
| Provenance | `hosted-source-package.json` |

The public Go package and its embedded Protocol/capability files are vendored as
exact accepted source bytes. Runtime compilation is offline (`-mod=vendor`,
`-trimpath`, `-buildvcs=false`, `CGO_ENABLED=0`); there is no runtime latest-version
lookup or source download. The Action sets up the exact toolchain and installs
Copilot from its npm integrity lock in an ephemeral directory outside the station.
The resolved Copilot executable version is verified before every semantic batch.
An install failure yields a non-judgment process refusal when semantic work is
required. No semantic installation or invocation is needed to infer a FAIL.

The full accepted **post-merge Action commit** is the station's eventual pin. PR
head identity is review evidence, not a claim that a merge has happened. The owner
or Shaper must confirm the post-merge tree equals the accepted candidate tree,
wait for its exact-head CI, and hand off that commit to `shoal-station#17`. This
delivery does not merge, tag, publish, or admit a new station generation. A release
tag may mirror the verified commit; it never replaces immutable commit identity.

## Invocation and authority

The station workflow owns checkout, cadence, concurrency, run-level ordering and
the `automated_review` setting. The Action accepts only `review` or `re-review`;
it does not interpret scheduled modes. The runtime requires a clean station
checkout with the explicit station locator as its GitHub origin. Targets are
read as data through GitHub APIs and are never checked out or executed.

```yaml
# Permissions for the semantic request credential only:
permissions:
  contents: read
  copilot-requests: write

# After the caller has obtained the separately authorized lifecycle and user
# credentials, and checked out the Reviewer station with persist-credentials:false:
- name: Hosted Initial Review
  id: hosted
  uses: taco3064/shoal-action/hosted-review@<FULL_VERIFIED_POST_MERGE_SHA>
  with:
    operation: review
    station: ${{ github.repository }}
    station_directory: ${{ github.workspace }}
    copilot_token: ${{ github.token }}
    read_token: ${{ github.token }}
    lifecycle_token: ${{ steps.authority.outputs.lifecycle_token }}
    reviewer_token: ${{ steps.authority.outputs.reviewer_token }}
    max_ai_credits: '30'
    timeout_seconds: '180'
```

`steps.authority` illustrates an explicit caller dependency, not an existing broker
in this repository. Broker issuance, OIDC, refresh, encrypted retention and grant
recovery belong to `shoal-app#49`. The canonical caller wiring belongs to #17.

| Input | Authorized role |
| --- | --- |
| `copilot_token` | Workflow `GITHUB_TOKEN`, `contents: read` + `copilot-requests: write`; no repository mutation permission required. |
| `read_token` | Required authoritative public repository/Membership/basis/file/Issue/comment reads, including complete pagination. May explicitly use the same read-capable workflow token. |
| `lifecycle_token` | Required station authority; only PATCH of that station's Issue `state` to `open` or `closed`. |
| `reviewer_token` | Required explicit Reviewer user authority; `/user`, Star GET/PUT/DELETE, and owner-authored comments on this station. Stable owner identity is checked by the shared runtime. |

All roles are explicit; missing Reviewer authority never uses a workflow/bot token
as fallback. A caller may explicitly supply the same Reviewer user token for both
personal and Issue-state roles if it authorizes those operations. The adapter's
allowlists still enforce each role. The tested cross-owner public Star authority
is refreshable OAuth `public_repo`; this broad scope does not authorize repository
settings, contents writes, workflow dispatch, arbitrary Issues or unrelated actions.

Tokens exist only in host memory/explicit transport inputs. They are not written
to files, logs, results or evidence. Git inspection has no GitHub credentials.
Copilot receives only its semantic token, a fresh empty HOME/config/cache/cwd,
controlled executable paths and semantic data on stdin. It receives no host
credential environment, station auth cache, mutation adapter or station checkout.
No user custom instructions or MCP configuration are loaded. Shell, write and URL
tools are denied and available tools are set to none. Any reported tool request
invalidates execution. Timeout/cancellation kills the Linux process group,
including the npm loader's native child, and deletes temporary semantic state.

## Evidence and semantic results

Every batch uses the runtime's supplied stable Reviewer/Target IDs and exact
Target/Policy commits. Evidence collection verifies repository identity, commit
tree, full tree availability and Git blob hashes. Policy is supplied complete up
to 128KB; larger/malformed/unavailable Policy refuses semantic work instead of
truncating it. Target sampling is explicit: README/manifests, workflows, docs,
then lexically ordered source/tests, up to 24 complete UTF-8 blobs of 16KB each
and 192KB total per item. Unsupported/binary/oversized/remaining files are omitted
and their count is disclosed. A selected blob that cannot be verified refuses
semantic work rather than inventing evidence. No builds, packages, hooks, tests,
scripts or workflows from a Target are executed.

Copilot emits JSONL transport. Exactly one successful completion and final
answer, with zero tool requests, is required. The final answer must parse as JSON.
The untrusted array or `{"results": [...]}` is passed to the **shared runtime**
for Issue correspondence, duplicate handling, verdict, explanation and partial
result validation. Host code does not construct Events, decide Stars or close
work. Independently usable partial results may complete; unusable items remain
retryable under the same shared-runtime rules.

`max_ai_credits` accepts 30..1000, defaults to 30 and applies to each bounded
Copilot batch session. It is Copilot's session soft ceiling, not a cumulative
scheduled-run promise. The station owns further run-level orchestration/budget
policy. `timeout_seconds` accepts 1..600 and defaults to 180.

## Machine-readable result

Outputs are `result` (single-line JSON), `status` and `stop_semantic_work` (string
`true`/`false`). Operational refusal or partial convergence is emitted as a
successful Action transport step so the caller can keep unrelated Summary work
running. Toolchain/build/output-transport infrastructure failures still fail the
Action step; the caller must independently preserve Summary execution for those.

```json
{
  "formatVersion": 1,
  "operation": "review",
  "runtimeSource": "978d2fec6b036ecd9453a95b3e2fcbd4b44ec6a3",
  "copilotVersion": "1.0.91",
  "runtime": {"status": "PARTIAL", "effectAttempts": 1, "faults": [{"code": "AGENT_UNAVAILABLE", "detail": "See structured hosted failure codes; public state remains authoritative"}]},
  "failures": ["COPILOT_BUDGET_UNAVAILABLE", "AGENT_UNAVAILABLE"],
  "stopSemanticWork": true
}
```

The four runtime statuses are `NO_CHANGES`, `COMPLETED`, `REFUSED`, and `PARTIAL`.
`effectAttempts` counts **attempted** writes, not completed judgments or confirmed
mutations. Runtime fault codes are preserved. Raw external diagnostics are
deliberately omitted so outputs cannot disclose credentials or untrusted log text.

| Failure code | Meaning |
| --- | --- |
| `COPILOT_ENTITLEMENT_UNAVAILABLE` | Copilot entitlement/subscription/policy denial. |
| `COPILOT_BUDGET_UNAVAILABLE` | Quota, AI-credit budget or rate allowance unavailable. |
| `COPILOT_AUTH_UNAVAILABLE` | No usable semantic authentication. |
| `COPILOT_TIMEOUT` / `COPILOT_INTERRUPTED` / `COPILOT_PROCESS_FAILURE` | Deadline, cancellation or unsuccessful execution. |
| `COPILOT_VERSION_MISMATCH` | Resolved version differs from exactly 1.0.91. |
| `COPILOT_TOOL_REQUEST` | Tool capability requested; result unusable. |
| `COPILOT_RESULT_MISSING` / `COPILOT_RESULT_MALFORMED` / `COPILOT_RESULT_UNUSABLE` | Missing transport, malformed JSON or shared-runtime rejection. |
| `RUNTIME_COMPATIBILITY_REFUSED` | Exact station or Protocol compatibility safe refusal; original runtime code is retained. |
| `GITHUB_READ_UNAVAILABLE` | Required authoritative read/evidence cannot be completed or verified. |
| `LIFECYCLE_AUTHORITY_UNAVAILABLE` | Required Issue-state authority missing or its request unavailable. |
| `REVIEWER_AUTHORITY_UNAVAILABLE` | Explicit personal authority missing or its request unavailable. |
| `RUNTIME_CONVERGENCE_INCOMPLETE` | Shared runtime cannot prove effect convergence. |
| `INVOCATION_INVALID` / `STATION_IDENTITY_INVALID` / `RUNTIME_DEPENDENCY_UNAVAILABLE` | Invalid invocation, mismatched station checkout or missing host dependency. |

Unrecognized transport errors stay process failures; no guessed semantic FAIL.
Failure classifications are additive, so use membership tests on `failures` and
runtime fault `code`, not their ordering or diagnostic text. A transient write
failure that the shared runtime verifies as converged is not reclassified as a
failed invocation. `stop_semantic_work=true` tells #17 to stop additional semantic
work while independently valid Summary continues. Retry the same operation:
the runtime reconstructs public state, preserves valid Events/Stars and verifies
ambiguous writes before deciding whether any mutation is needed.

## Verification and handoff gates

```sh
# Locked source integration and full hosted payload correspondence:
node scripts/hosted-package.mjs /path/to/exact-gh-shoal
node scripts/hosted-negative.mjs /path/to/exact-gh-shoal
cd hosted-review
go test -mod=vendor -race -count=1 ./...
CGO_ENABLED=0 go build -mod=vendor -trimpath -buildvcs=false -o /tmp/hosted-review ./cmd/hosted-review
```

The packaging command is the same verifier with `--package`; it updates the
record only during Delivery before Candidate Set freeze. Verification checks
the exact accepted Git source/tree, every vendored source/embed byte, Go vendor
reproduction, complete payload hashes, test fixture correspondence and every
Copilot platform package's pin/integrity. Negative controls edit/remove/add
runtime bytes, change the Copilot pin and hand-edit the adapter.

Exact-head CI runs existing Ubuntu/Windows Summary reproduction/regressions and
separate Linux Hosted Review correspondence, isolation, refusal and recovery
controls. A dedicated semantic job uses real pinned Copilot with only workflow
`contents:read`/`copilot-requests:write`; all Review/Re-review lifecycle effects
in that job use synthetic GitHub fixtures, so no external Shoal state is mutated.
The live test is opt-in locally (`SHOAL_LIVE_TOKEN` and `SHOAL_LIVE_COPILOT`) and
must not be claimed as passed when it is skipped.

Before #17 consumes this delivery, confirm independent Acceptance, exact PR/main
head CI, accepted-tree preservation at merge, and the exact post-merge Action
commit. #17 then owns canonical schedule/mode/Summary wiring; #49 owns broker and
Platform admission. The runtime capability snapshot continues to refuse station
generations not yet admitted by the Platform. This adapter does not bypass it.


### Coordinated source reproduction

The pinned runtime commit/tree is the source identity. Verification archives its
committed bytes with line-ending conversion disabled, runs Go vendor generation
against that exact source in a temporary directory, and compares the complete
vendor file set. The temporary local-module replacement is removed from generated
vendor metadata; shipped go.mod contains no replacement. Reproduction performs no
module-proxy resolution, so unpublished coordinated commits can be validated
locally without substituting a mutable release. This does not grant review,
release, or Platform admission to a candidate.

After an explicit runtime-pin change, regenerate using:

```text
node scripts/hosted-package.mjs <exact-runtime-checkout> --refresh-vendor --package
```

Normal verification omits both mutation flags. CI must be able to fetch the exact
runtime commit; local-only prerequisite commits must be published and reviewed
before their dependent PR can pass remote verification.
