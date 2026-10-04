# Owner-local probe handoff — action #10

Remote evidence: [ledger.md](ledger.md). This handoff leaves the investigation open. Run credential-bound steps locally, return endpoint/read-back evidence, and resume remote Phase D/E/F. Do not change the Product BR, gh-shoal#20, root station main, action.yml or dist. Do not paste tokens into chat or the Issue.

## C1: Hosted Reviewer personal Star authority

Objective: prove check → Star → verify → Unstar → verify → restore original state, with Reviewer personal authority in GitHub Actions.

- Repository: `taco3064/shoal-station`, Personal Account owner ID `127829492`.
- Branch: `investigation/action-10-personal-star`.
- Exact commit: `fb1294d92530997841a5506ed8fa134387a74ea8`.
- Workflow: `.github/workflows/hosted-star-probe.yml`.
- Exact existing run: `37206801778`, attempt 1 recorded UNKNOWN. Rerun it after supplying the credential; record the new attempt.
- Controlled Target: `taco3064/shoal-action`. Only this owner's Star state is changed, and restored by the script's finally block.
- Preferred token: GitHub App **user access token**, user `Starring:write` (including state reads), authorized by station owner. Verify actual App permission/consent before minting. An installation token or OAuth token of another model is not a substitute.
- Fallback: owner fine-grained PAT, minimum user `Starring:write`, only if preferred App path is unavailable; record why. No repository mutation permission is required for this Star probe token. The local administrative gh session that sets the temporary Actions secret is a separate credential.
- Secret: `SHOAL_PROBE_STAR_TOKEN`; nonsecret variable: `SHOAL_PROBE_STAR_TOKEN_TYPE` = `github-app-user` or `fine-grained-personal`.

Use a local gh session permitted to manage station Actions secrets/variables and rerun/read Actions. First verify the exact run and branch head. If either temporary name already exists, stop this script without overwriting it; choose new explicitly wired probe names instead. The script accepts the token through hidden terminal input and stdin, never command-line arguments. Use a fresh evidence directory.

```bash
bash investigations/10-hosted-review/run-star-probe.sh github-app-user
# Only if the preferred App user model is unavailable:
# bash investigations/10-hosted-review/run-star-probe.sh fine-grained-personal
```

The script deletes its newly created secret and variable on exit, reads back absence, and downloads the attempt-specific public artifact. If killed with SIGKILL or the machine loses connectivity, run these cleanup commands locally and verify absence:

```bash
gh secret delete SHOAL_PROBE_STAR_TOKEN --repo taco3064/shoal-station
gh variable delete SHOAL_PROBE_STAR_TOKEN_TYPE --repo taco3064/shoal-station
gh secret list --repo taco3064/shoal-station --json name
gh variable list --repo taco3064/shoal-station --json name
```

Inspect `report.json`, not only the green run. Require ownerID 127829492, originalStarred, starReadback=true, unstarReadback=true, cleanupRestored=true and result PASS. Preserve the endpoint ledger including GET/PUT/DELETE statuses and accepted-permission headers. If cleanupRestored is missing/false, restore using this same owner's credential and record authoritative GET read-back; do not claim cleanup from the intention alone. Revoke an investigation-only issued token/App authorization afterward; never revoke an unrelated production credential.

Separately supply nonsecret issuance/lifecycle evidence: App identity, actual consent permission, issued/expiry timestamps, whether refresh metadata was returned, whether refresh rotates successfully, and whether current Worker stores/rotates/delivers it server-side. Redact access/refresh/client-secret values. The temporary secret proves Actions delivery only. A passing endpoint cycle does not prove existing Quick Web Join recurring supply. For a PAT, report chosen expiration and user renewal requirement explicitly.

## C2: Current Protocol author authority

Station GITHUB_TOKEN writes as github-actions[bot]; current Protocol requires the Reviewer owner author ID. If the viable hosted design uses personal Issue writes, independently test an owner App-user token or minimum FG PAT with repository `Issues:write` scoped to this station (plus user Starring only when combining is necessary).

Use the exact C1 branch as the base, add a distinct personal-Issue probe on a new non-main experimental branch, and record the resulting commit. Follow the existing lifecycle probe's exact endpoint sequence: POST `/repos/taco3064/shoal-station/issues` with an explicitly disposable **non-Request, non-Protocol** body; POST a non-Protocol comment; GET `/issues/comments/{id}` and require `user.id == 127829492`; PATCH closed, GET closed; PATCH open, GET open; finally PATCH closed and GET closed. Record each HTTP status and accepted permission. No production Review Event is fabricated. Preserve the disposable closed Issue and remove any new temporary credential. The author's identity and permission are part of the evidence, not inferred from Star success.

## B2: Ordinary Personal direct-fork execution

Remote hosted reads proved `taco-gem/gem-station` ID `1404227857`, owner type User, fork=true and direct parent ID `1379044983` in run `37207186016`. That is not fork-owner execution proof. Use only a Personal direct fork the owner explicitly controls; do not mutate third-party forks from the public fork list.

With that fork owner's local gh/git authority, re-read membership and Actions availability. In a fresh clone, use its current default branch as base, copy only the two probe files from root commit `81edc67571cefc2806f1215536920c0074ff10d3`, and commit them on `investigation/action-10-hosted-review`. Do not merge to the fork default branch. A normal commit message without markers runs auth/semantic/lifecycle, making a disposable closed Issue on that fork; no Star token is needed for B2.

```bash
# From a fresh clone of the explicitly controlled direct fork:
git fetch https://github.com/taco3064/shoal-station.git 81edc67571cefc2806f1215536920c0074ff10d3
git switch -c investigation/action-10-hosted-review
git restore --source=81edc67571cefc2806f1215536920c0074ff10d3 -- .github/workflows/hosted-review-probe.yml .github/experiments/hosted-review/probe.py
git add -f .github/workflows/hosted-review-probe.yml .github/experiments/hosted-review/probe.py
git commit -m 'Probe ordinary Personal direct-fork hosted review for action #10'
git push -u origin investigation/action-10-hosted-review
```

Record the fork's actual base/commit/run/attempt and owner entitlement, not the root commit as its new candidate identity. Enable fork Actions only through the owner if required and record that prerequisite. If primary auth fails, record exact error class, then test the documented owner `Copilot Requests:write` FG PAT fallback on a separate explicit branch revision and remove the secret. Preserve malformed/process/auth failures as execution errors. Return curated artifacts; verify disposable Issue cleanup. Do not label root success as ordinary fork success.

## B3: Controlled rename

Requires owner Administration permission unavailable to the remote connector. Use a new disposable public Target under the owner, never rename a production station/action. Record original stable ID/name/default head; rename that disposable repository; perform hosted GET by old locator, new locator and `/repositories/{id}` using only contents-read authority. Record redirect/final status, resolved name and same stable ID/head, then restore the original name and verify it. Reuse topology-only harness from commit `81edc67571cefc2806f1215536920c0074ff10d3` on a new experimental commit with only this controlled locator added. Record actual new commit/run/attempt. A prior locator's 404 does not establish rename survival. Leave the disposable repository as clearly named evidence or delete only that newly created disposable repository if authorized; record which cleanup occurred.

## F: Intended server-side App/Worker authority (after C/D)

Do not replace this with the local owner's broad gh token. Use the real Quick Web Join App installation model issued server-side for a controlled ordinary node, minimum `Actions:write` for dispatch and `Actions:read`/metadata for observation. Record actual installation permissions and node scope; endpoint accepted-permission read-back determines any additional minimum requirement. The browser receives no App/private key/user token.

Use an existing controlled dispatchable workflow or a disposable controlled node with a tiny nonsemantic fixture on its own default branch. Pin the exact fixture generation/commit. Never install it on canonical root main. Record the actual deployed Worker source SHA and the server-side probe entry; there is no runnable Worker dispatch probe in this remote handoff because C/D prerequisites and its credential are unavailable.

Exact API probe sequence from that server-side authority:

1. GET `/repos/{controlled-node}/actions/workflows/{workflow_id}`; verify expected path, enabled state and committed fixture generation.
2. POST `/repos/{controlled-node}/actions/workflows/{workflow_id}/dispatches` with explicit ref and a fresh unique `probe_id` input echoed by fixture run-name. Record HTTP status. Include safe fixture `outcome=success` or `failure`; fixture performs no Target execution or Shoal mutation.
3. Paginate workflow_dispatch runs for **that workflow ID**, require unique nonce/display_title, expected head SHA/ref/event/workflow ID. Persist exact run ID; refuse zero/multiple matches within a bounded window. Never select latest run.
4. GET `/actions/runs/{exact-run-id}` and jobs; preserve queued/in_progress/completed plus success/failure. Repeat once sequentially and dispatch two distinct nonces concurrently; preserve actual correlation/concurrency behavior without assuming all runs survive pending replacement.
5. Repeat with disabled fixture, controlled unavailable Actions, and stale fixture generation; capture safe refusal/status. Restore only the controlled fixture availability settings.
6. Refresh browser and restart/redeploy Worker after persisting the exact run identity; re-query that run from durable correlation data. Neither reload nor restart is completion evidence. Record storage/source/observed exact identity.

Return sanitized server-side request/status transcripts and run URLs plus cleanup. A manual dispatch proves only the primitive and authority model; it does not prove current Worker persistence, browser binding or supported-generation refusal until those paths themselves execute.

## Evidence return contract

For each probe attach: probe name, evidenceType LIVE, repository ID/account type/base/exact commit, workflow path/run URL/ID/attempt or exact command transcript, token **type and permission only**, HTTP/process outcomes, accepted-permission headers, authoritative read-back, cleanup confirmation, PASS/FAIL/UNKNOWN and precise limitation. Add issuance/expiry/refresh/supply evidence for C. Remote Phase D/E/F and final FEASIBLE/BLOCKED decision resume from these facts. Do not return only a local Codex conclusion.
