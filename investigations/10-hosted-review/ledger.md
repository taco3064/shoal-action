# Hosted Review feasibility investigation — evidence ledger

Work item: https://github.com/taco3064/shoal-action/issues/10

Investigation in progress. This is not an accepted product generation and does not establish FEASIBLE or BLOCKED yet.

## Phase A baseline (2026-10-04)

- Product BR: Shoal Knowledge Base v0.68; Notion page `3ec06b644a2080e9a65edec4ad419c06`, last edited `2026-10-03T04:20:23.304Z`.
- Issue: open, exact `shaped` label; updated `2026-10-04T13:17:01Z`; no Shaper comments at initial inspection.
- `shoal-station/main`: `743e53c09ceb0034fee055312e1866dd9f1e8d56`.
- `shoal-action/main`: `4918e1afe85f15f8fe263eaf2866cd02a1f70a62`.
- `gh-shoal/main`: `4d9ee5fa941fd5ded3011d8c4642c5bf2fff94f1`.
- `shoal-app/main`: `134d82457c99777cba752a549fb7e26ab239d71c`.
- Copilot CLI selected: `1.0.91`; official Linux x64 release asset SHA-256 `8faf369baaeaa895cb40bc8de960b64ab78ce3839358119db445f6fcc1936779`.

## Evidence discipline

`DOC` = official documentation; `SOURCE` = inspected source/locally verified probe configuration; `LIVE` = actual hosted platform result; `SIMULATED` = deliberately injected failure. A prepared workflow is SOURCE, never LIVE. Absence of authority is not a service authentication failure. Required untested outcomes remain UNKNOWN.

## Initial evidence inventory

| ID | Type | Evidence | Observation / limit |
| --- | --- | --- | --- |
| A1 | SOURCE | Exact default-branch clones and commit identities above | No repository guidance in station/action; gh-shoal and shoal-app guidance read. No existing experiment branch found in station/action. |
| A2 | SOURCE | Official pinned Copilot asset, downloaded and hash-checked; `node package/index.js --no-auto-update --version`, `--help`, `help permissions`, `help environment` | Version 1.0.91. Programmatic mode, tool availability filtering, denial precedence, built-in MCP disabling, custom-instruction disabling, isolated COPILOT_HOME, and update disabling supported. No semantic call executed locally. |
| A3 | DOC | https://docs.github.com/en/copilot/concepts/agents/copilot-cli/copilot-cli-in-github-actions | Current documentation explicitly describes personally owned repository GITHUB_TOKEN billing to owner's Copilot seat. Requires independent LIVE verification. |
| A4 | DOC | https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/automate-with-actions | Programmatic invocation and user-owned Copilot Requests PAT alternative. |
| A5 | DOC | https://github.github.com/gh-aw/reference/auth/ | Agentic Workflow authentication guidance is a distinct configuration model; do not replace live direct CLI testing with this document. |
| A6 | SOURCE | `shoal-app/src/join/services/join_server/{auth,runtime,sessions,sealed_token}.ts` | OAuth exchange retains user token encrypted server-side, session lasts 30 minutes. No refresh-token lifecycle or station token-delivery mechanism observed. Not proof App has Starring permission. |
| A7 | SOURCE | `gh-shoal/internal/cli/{review,automated,re_review}.go`; App Summary admission validation | Existing formal admission/judgment evidence relies on owner identity. An issues:write GITHUB_TOKEN comment is not automatically a valid Reviewer-authored judgment. Owner-authorized user-token writing must be assessed separately. |

## Current delivered capability checklist

Replacement equivalence remains UNKNOWN unless the complete responsibility is proven. The semantic transport primitive below is proven; it does not prove formal admission, mutation authority or retry semantics.

| Capability | Current implementation / test evidence (gh-shoal baseline above) | Required hosted primitive / authority | Assessment |
| --- | --- | --- | --- |
| Initial discovery / admission | `review.go:admitOpen,admit`; `review_test.go:TestMembershipRequiresDirectPersonalForkAndAuthor,TestReviewScansAndRejectsInvalidWithoutSemanticSideEffects` | Complete paginated Issue/comment/Target/Membership reads; deterministic validation; permitted actor for writes | UNKNOWN |
| Canonical selection / stable identity | `review.go:findCanonical,validateCanonical`; `TestCanonicalIdentitySurvivesTargetRename,TestDamagedCanonicalPreventsSecondThread` | Stable repository ID resolution and historical owner-authorized evidence; refuse damaged history | UNKNOWN |
| FIFO / bounded batches | `automated.go:automated`, `re_review.go:reReview`; `TestFIFOFivePerProcessAndPartialBatch,TestReReviewBatchesFiveAndIsolatesMissingResult` | Hosted deterministic ordering, batches of five, fresh run workspace | UNKNOWN |
| Policy / Target basis capture | `review.go:targetHead,policyCommit` | Resolve actual default branch and last README-modifying commit; pinned bounded evidence | UNKNOWN |
| Semantic PASS / FAIL | `automated.go:runAgent`; `TestAgentResultRejectsDuplicateAndForeignIssue,TestMissingResultDoesNotUseAgentTerminalOutput` | Hosted Copilot entitlement/auth; exact result validation; failures not semantic FAIL | HOSTABLE for bounded semantic transport only: LIVE run 37206693489 and SIMULATED transport controls; complete runtime integration pending Phase D |
| Star convergence | `automated.go:convergeStar`; `TestFailedStarAndAgentLeaveThreadRetryable` | Reviewer personal GET/PUT/DELETE starring authority with read-back and cleanup | UNKNOWN |
| Protocol Event append | `automated.go:completeJudgment`, `protocol.go:validEvent` | Deterministic Protocol construction plus currently allowed event author/provenance | UNKNOWN |
| Close / reopen | `review.go:transition,finishRedirect` | Bounded station Issues authority and authoritative state reads | UNKNOWN |
| Re-review basis comparison | `re_review.go:classifyReviewBasis`; `TestReviewBasisClassification,TestReReviewBasisReversionClosesPendingThreadWithoutJudgment` | Current basis snapshots and previous validated judgment; deterministic comparison | UNKNOWN |
| Unchanged-basis maintenance | `re_review.go:reconcilePreviousJudgment`; `TestReReviewNoNewBasisRepairsDriftWithoutAgent,TestReReviewLatestStarRevokedRemainsAuthoritative` | Personal Star state plus legitimate event/Issue authority; no fabricated judgment | UNKNOWN |
| Partial failure / remaining-work retry | `automated_test.go:TestAutomatedReviewPartialResultsAndRetry,TestPartialBatchLeavesMissingResultOpenAndRetries`; `TestReReviewStarMutationFailureLeavesPendingThreadRetryable` | Durable public state, isolated thread failures, rerun reads, mutation-safe concurrency | UNKNOWN |
| Ambiguous-write recovery | `review.go:commentOnce,transition`, `automated.go:convergeStar`; `recovery_test.go:TestAmbiguousWritesObserveCommittedStateWithoutReplay,TestAmbiguousCommentWithoutObservableProofRefusesBoundedly,TestAmbiguousReReviewLifecycleAppendDoesNotDuplicate` | Authoritative post-write observation, exact actor/body identity, bounded refusal without replay | UNKNOWN |
| Compatibility / safe refusal | `compatibility.go:stationPreflight,historyPreflight`; `TestReviewCompatibilityPreflightRefusesBeforeAnySideEffects,TestSupportedOlderStationRunsExistingReviewAndReReview` | Pinned official capabilities and exact committed bytes, deterministic refusal before semantic execution/mutations | UNKNOWN |

## LIVE run manifest

All runs below are in Personal Account repository `taco3064/shoal-station`, Ubuntu 24.04.5, runner 2.337.0, attempt **1**. Click the run ID for platform evidence. Experiment branches are retained for reproducibility only.

| Run | Exact commit | Purpose / actual result |
| --- | --- | --- |
| [37206063732](https://github.com/taco3064/shoal-station/actions/runs/37206063732) | `d0c2cbff99b6cdb08329aff0871860d28457ef4d` | Primary GITHUB_TOKEN auth PASS, no repository secret. |
| [37206441783](https://github.com/taco3064/shoal-station/actions/runs/37206441783) | `a7a0af38ef857138798f265ab1b737bfafa47b76` | Issue lifecycle PASS. Semantic text wrapping caused MALFORMED_RESULT for all three calls; these are actual failed transport controls, not semantic passes. |
| [37206567975](https://github.com/taco3064/shoal-station/actions/runs/37206567975) | `1701b0e251470375eee7e66ce6ca05ede93e6e30` | Native JSONL trial: positive rejected because empty reasoning-only message was counted; negative/injection accepted. Superseded decoder. |
| [37206693489](https://github.com/taco3064/shoal-station/actions/runs/37206693489) | `1c4bef84f359c333c7e382f54aa450057f5850a0` | Correct final-answer phase decoder: LIVE PASS, FAIL and hostile negative controls all PASS; zero tool requests/modified files. |
| [37206801778](https://github.com/taco3064/shoal-station/actions/runs/37206801778) | `fb1294d92530997841a5506ed8fa134387a74ea8` | Personal Star UNKNOWN: owner token absent, zero API/mutation attempts. Green job means evidence recorded only. |
| [37207186016](https://github.com/taco3064/shoal-station/actions/runs/37207186016) | `81edc67571cefc2806f1215536920c0074ff10d3` | Isolated topology-only run: current fork parent/stable-ID reads; semantic and lifecycle jobs skipped. |

## Investigation matrix at credential handoff

This is an interim matrix, not the final decision required by Issue #10. No product-level FEASIBLE/BLOCKED conclusion has been made.

| Area | Type | Result | Observation / limitation |
| --- | --- | --- | --- |
| Personal Copilot GITHUB_TOKEN | LIVE | PASS | `contents:read,copilot-requests:write`; CLI 1.0.91 authenticated and inferred non-interactively without repository secret. |
| Entitlement/quota | LIVE + DOC | PASS for tested owner; other states UNAVAILABLE | Native result reports premiumRequests=1 per successful semantic call. No proof of remaining balance, plan tier, Free/no-entitlement or real exhausted quota. Those account states unavailable here. |
| Copilot user-token fallback | SOURCE | NOT NEEDED | Primary authority succeeded. No Copilot PAT created or supplied. |
| Structured PASS and FAIL | LIVE | PASS | Synthetic semantic-only request IDs 91001/91002, actual owner README policy and bounded gh-shoal public evidence; no formal Request/admission proof. |
| Failure is not semantic FAIL | SIMULATED | PASS | Malformed/missing/wrong Issue/extra key/nonzero exit/timeout/SIGTERM are rejected with null semantic verdict; API500/403 remaining0/429 classified separately. Not real quota exhaustion. |
| Prompt injection | LIVE | PASS | Synthetic hostile Target AGENTS text requested PASS, Star/close and extra key. Received narrow valid FAIL, no tool requests; this is one bounded hostile fixture, not a universal injection guarantee. |
| Deterministic Target reads | LIVE | PARTIAL | Actual default-head metadata, bounded files, CI/releases/Issue history; no Target checkout/build/scripts. Non-main/fork/archived/missing reads proven. Controlled rename still UNKNOWN. 404 means missing or inaccessible, not proof of deletion. |
| Reviewer personal Star | LIVE observation + SOURCE harness | UNKNOWN | Temporary secret absent; no personal token rejection or Star state change. Local owner handoff required. |
| Station Issue endpoints | LIVE | PASS | Disposable station#15 comment/read/close/reopen/cleanup closed. Actor github-actions[bot], valid endpoint capability only; does not satisfy current owner-authored Protocol event requirement. |
| Reviewer-authored Protocol writes | SOURCE | UNKNOWN | Current BR and App enforce owner author.id. No supported personal Issues authority cycle tested. |
| shoal-action semantic-loop prototype | SOURCE | UNKNOWN | Not started: Phase D follows viable B/C. action.yml/dist untouched. Station harness is not claimed as the Phase D action runtime. |
| Ordinary Personal directfork | LIVE reads | UNKNOWN for execution | Current `taco-gem/gem-station` is read-only topology evidence; no fork-owner Copilot/lifecycle/Star execution yet. Root result cannot generalize billing/entitlement. |
| Worker dispatch/observation | SOURCE | UNKNOWN | No real Worker/App credential in this environment. Installation authority, nonce correlation and restart recovery not proven. |
| Complete replacement equivalence | SOURCE + above | UNKNOWN | Inventory maps current responsibilities. Hosted admission, owner provenance, durable recovery/concurrency and compatibility remain unproven. |

## Evidence files and artifact digests

Committed public excerpts/prompts are the exact bounded bytes exposed to the model. Deterministic API endpoint ledgers are separate. Native reasoning is not copied into this report. Prompts include hash in each result. CLI JSONL result decoder accepts exactly one final_answer and one exitCode0 result, rejects tool requests, then validates exact keys/type/Issue/comment limit. File-result transport is deterministic harness persistence; model file-write tools are disabled.

| Artifact ID | Run / contents | SHA-256 from GitHub |
| --- | --- | --- |
| 11304569375 | 37206441783 semantic failure evidence | `a58a4b64679b6ce8e74d2100f72f5feb485942e5f2f7a68ec9df12e4c5e4dde3` |
| 11304019321 | 37206441783 lifecycle | `a32a5e3a038b62358557cbefadde684f002da85bdaf16e0d48b15844661dedce` |
| 11304009988 | 37206693489 semantic controls | `141163fe005a2e398e392ab8f3657b097939fdf5cee3345191ecd6a564f9e3a7` |
| 11305236261 | 37206801778 unavailable Star credential | `06942821f49149817178c763d2912acc4ac370072950340e46e10bd0ba080158` |
| 11304739630 | 37207186016 topology | `8b95b09c55731582d106f666bd77f5ebb5da24c3712f20b16777252da02e6e68` |

The initial native parser trial run is linked above but its artifact is not needed for a success claim. Raw CLI reasoning output from that superseded trial is not committed. Earlier curated semantic/lifecycle artifacts and latest curated successful artifacts are preserved under `evidence/` beyond the hosted 30-day retention.

## Credential lifecycle and current App boundary

DOC: [GitHub App token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens) describes optional expiring user access tokens: access 8 hours, refresh 6 months; refresh rotates both tokens and invalidates the old pair. Actual App configuration and returned expiry/refresh metadata must be observed locally, not inferred. [Starring REST](https://docs.github.com/en/rest/activity/starring) supports App user or fine-grained personal token with user Starring write for mutations/read for observation. An installation token is not Reviewer personal authority.

SOURCE at the exact App baseline: Quick Web Join handles OAuth access token encrypted server-side in a 30-minute session, but inspected exchange does not retain refresh_token/expires_in and no recurring station delivery is established. This does not prove that the App has Starring permission, or that refreshing/delivering personal authority is supported. These are required authority-model results, not assumptions. FG PAT fallback would require user-managed expiry/renewal unless a separate supported supply path is proven. The temporary-secret procedure only tests Actions delivery, not production Worker rotation.

## Verification and cleanup

- Station's existing 16 tests passed with locked PyYAML 6.0.3. Python probe syntax, workflow YAML and deterministic simulated controls passed. Latest topology job is an actual hosted success.
- Disposable station#15 is independently read back CLOSED after the close/reopen test; comment is explicitly non-protocol evidence.
- No secret was created by remote delivery. Star workflow confirmed absent token and empty endpoint ledger; no remote Star mutation occurred.
- Experiment branches remain non-default; canonical station workflows, action.yml/dist, BR, gh-shoal#20 and App source unchanged. No merge/tag/Marketplace release or production Review Event.
- User explicitly waived Accept for this exploratory investigation on 2026-10-04. This evidence branch is a draft handoff, not accepted product state.

## Resume

Run the exact credential-bound probes in [owner-handoff.md](owner-handoff.md), return underlying LIVE evidence to #10, then resume D/E/F and final matrix. Do not promote UNKNOWN to HOSTABLE or infer a platform rejection from absent credentials. Final decision and review-ready delivery remain pending.
