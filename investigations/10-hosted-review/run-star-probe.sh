#!/usr/bin/env bash
# Owner-local administrative session is distinct from the supplied Star token.
set +x
set -euo pipefail
kind=${1:?Specify github-app-user or fine-grained-personal}
case "$kind" in github-app-user|fine-grained-personal) ;; *) exit 2 ;; esac
repo=taco3064/shoal-station
run=37206801778
expected=fb1294d92530997841a5506ed8fa134387a74ea8
secret=SHOAL_PROBE_STAR_TOKEN
variable=SHOAL_PROBE_STAR_TOKEN_TYPE
command -v gh >/dev/null
command -v python3 >/dev/null
test "$(gh api "repos/$repo/actions/runs/$run" --jq .head_sha)" = "$expected"
test "$(gh api "repos/$repo/git/ref/heads/investigation/action-10-personal-star" --jq .object.sha)" = "$expected"
gh secret list -R "$repo" --json name > /tmp/shoal-probe-secret-names.json
gh variable list -R "$repo" --json name > /tmp/shoal-probe-variable-names.json
python3 - <<'PY'
import json
for path,name in [('/tmp/shoal-probe-secret-names.json','SHOAL_PROBE_STAR_TOKEN'),('/tmp/shoal-probe-variable-names.json','SHOAL_PROBE_STAR_TOKEN_TYPE')]:
    if any(row['name']==name for row in json.load(open(path))):
        raise SystemExit('Reserved probe name already exists; refusing overwrite')
PY
secret_created=false
variable_created=false
cleanup() {
  local failed=0
  if "$secret_created"; then gh secret delete "$secret" -R "$repo" || failed=1; fi
  if "$variable_created"; then gh variable delete "$variable" -R "$repo" || failed=1; fi
  unset probe_token
  gh secret list -R "$repo" --json name > /tmp/shoal-probe-secret-names.json || failed=1
  gh variable list -R "$repo" --json name > /tmp/shoal-probe-variable-names.json || failed=1
  python3 - <<'PY' || failed=1
import json
for path,name in [('/tmp/shoal-probe-secret-names.json','SHOAL_PROBE_STAR_TOKEN'),('/tmp/shoal-probe-variable-names.json','SHOAL_PROBE_STAR_TOKEN_TYPE')]:
    assert not any(row['name']==name for row in json.load(open(path))), 'Probe credential cleanup not confirmed'
print('Temporary secret and variable absence confirmed')
PY
  if (( failed )); then printf 'Cleanup incomplete: follow owner-handoff.md recovery commands\n' >&2; return 1; fi
}
trap cleanup EXIT
read -r -s -p 'Owner Star token (hidden, never written to evidence): ' probe_token
printf '\n'
test -n "$probe_token"
# Mark before request: ambiguous committed writes are cleaned up as well.
secret_created=true
printf '%s' "$probe_token" | gh secret set "$secret" -R "$repo"
unset probe_token
variable_created=true
gh variable set "$variable" -R "$repo" --body "$kind"
before=$(gh api "repos/$repo/actions/runs/$run" --jq .run_attempt)
gh run rerun "$run" -R "$repo"
# Await a strictly newer attempt before watch/download; never read attempt 1 as the probe.
attempt=$before
for ((i=0;i<30;i++)); do
  attempt=$(gh api "repos/$repo/actions/runs/$run" --jq .run_attempt)
  if (( attempt > before )); then break; fi
  sleep 2
done
test "$attempt" -gt "$before"
out="star-evidence-$run-$attempt"
mkdir "$out"
python3 - "$repo" "$run" <<'PY'
import subprocess,sys
try:
    subprocess.run(['gh','run','watch',sys.argv[2],'-R',sys.argv[1],'--interval','5'],timeout=1200,check=True)
except subprocess.TimeoutExpired:
    raise SystemExit('Observation deadline exceeded; credential cleanup still runs. Inspect exact run before retrying.')
PY
gh api "repos/$repo/actions/runs/$run/attempts/$attempt" > "$out/run.json"
gh run download "$run" -R "$repo" --name "personal-star-$run-$attempt" --dir "$out/artifact"
python3 - "$out/artifact/report.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
print(json.dumps(r,indent=2))
assert r['result']=='PASS', 'Probe was not PASS; retain evidence and inspect failure'
assert r['ownerID']==127829492
assert all(r.get(k) is True for k in ['starReadback','unstarReadback','cleanupRestored'])
PY
printf 'Evidence directory: %s\n' "$out"
