package hosted

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

// Observe only the pinned commit's checks and, for a fork, its own changes
// relative to an observed immutable parent head. No exhaustive audit is needed.
func collectVerification(ctx context.Context, reads reviewruntime.GitHub, name, commit string, repository map[string]json.RawMessage) (map[string]any, error) {
	var checks struct {
		Total int                          `json:"total_count"`
		Runs  []map[string]json.RawMessage `json:"check_runs"`
	}
	checkEndpoint := "repos/" + name + "/commits/" + commit + "/check-runs?per_page=100"
	if err := getJSON(ctx, reads, checkEndpoint, &checks); err != nil {
		return nil, err
	}
	if checks.Runs == nil || checks.Total < len(checks.Runs) {
		return nil, errors.New("commit checks unavailable")
	}
	runs := []map[string]json.RawMessage{}
	for _, run := range checks.Runs {
		var head string
		if json.Unmarshal(run["head_sha"], &head) != nil || head != commit {
			return nil, errors.New("check commit mismatch")
		}
		runs = append(runs, projectRecord(run, []string{"name", "status", "conclusion", "head_sha", "html_url", "details_url", "started_at", "completed_at"}))
	}
	result := map[string]any{"checksEndpoint": checkEndpoint, "checkRuns": runs, "checksComplete": checks.Total == len(runs), "checkScope": "Observed check runs at the target commit; not a claim about branch protection or external CI."}
	var fork bool
	if json.Unmarshal(repository["fork"], &fork) != nil || !fork {
		return result, nil
	}
	var parent struct {
		FullName string `json:"full_name"`
		Branch   string `json:"default_branch"`
	}
	if json.Unmarshal(repository["parent"], &parent) != nil || !locator.MatchString(parent.FullName) || parent.Branch == "" {
		return nil, errors.New("fork parent unavailable")
	}
	var ref struct{ Object struct{ SHA string } }
	if err := getJSON(ctx, reads, "repos/"+parent.FullName+"/git/ref/heads/"+url.PathEscape(parent.Branch), &ref); err != nil {
		return nil, err
	}
	if !sha.MatchString(ref.Object.SHA) {
		return nil, errors.New("fork parent commit unavailable")
	}
	endpoint := "repos/" + parent.FullName + "/compare/" + ref.Object.SHA + "..." + strings.Split(name, "/")[0] + ":" + commit + "?per_page=20"
	var comparison struct {
		Base      struct{ SHA string } `json:"base_commit"`
		MergeBase struct{ SHA string } `json:"merge_base_commit"`
		Status    string
		Ahead     int `json:"ahead_by"`
		Behind    int `json:"behind_by"`
		Total     int `json:"total_commits"`
		Files     []map[string]json.RawMessage
		Commits   []map[string]json.RawMessage
	}
	if err := getJSON(ctx, reads, endpoint, &comparison); err != nil {
		return nil, err
	}
	if comparison.Base.SHA != ref.Object.SHA || !sha.MatchString(comparison.MergeBase.SHA) || comparison.Files == nil || comparison.Commits == nil {
		return nil, errors.New("fork comparison unavailable")
	}
	files := []map[string]json.RawMessage{}
	for _, file := range comparison.Files {
		selected := projectRecord(file, []string{"filename", "previous_filename", "status", "additions", "deletions", "changes", "blob_url", "patch"})
		if len(selected["patch"]) > 16_000 {
			delete(selected, "patch")
			selected["patchOmitted"] = json.RawMessage("true")
		}
		files = append(files, selected)
	}
	result["forkComparison"] = map[string]any{"endpoint": endpoint, "parent": parent.FullName, "parentCommit": ref.Object.SHA, "targetCommit": commit, "mergeBase": comparison.MergeBase.SHA, "status": comparison.Status, "aheadBy": comparison.Ahead, "behindBy": comparison.Behind, "totalCommits": comparison.Total, "files": files, "fileListComplete": len(files) < 300, "scope": "GitHub comparison files describe fork changes from the merge base to the pinned target, not credit for upstream work."}
	return result, nil
}
