package hosted

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

var errEvidenceIncomplete = errors.New("evidence exceeds complete collection budget")

// History is observed GitHub state, not immutable Git content. Preserve that
// distinction and endpoint provenance instead of calling it a commit snapshot.
type HistoryEvidence struct {
	ObservedAt  string                     `json:"observedAt"`
	Selection   string                     `json:"selection"`
	Repository  map[string]json.RawMessage `json:"repository"`
	Collections []HistoryCollection        `json:"collections"`
}

type HistoryCollection struct {
	Endpoint    string                       `json:"endpoint"`
	Records     []map[string]json.RawMessage `json:"records"`
	Complete    bool                         `json:"complete"`
	FullRecords []map[string]json.RawMessage `json:"-"`
}

// Index every record in the recent window, keeping long bodies out of the initial
// model context. The original projected records remain available on demand.
func historyIndex(record map[string]json.RawMessage, ref string) map[string]json.RawMessage {
	index := projectRecord(record, []string{"number", "html_url", "title", "name", "state", "created_at", "updated_at", "closed_at", "merged_at", "issue_url", "pull_request_url", "commit_id", "path", "tag_name", "published_at", "sha", "body"})
	var commit map[string]json.RawMessage
	if json.Unmarshal(record["commit"], &commit) == nil && commit != nil {
		index["body"] = commit["message"]
		index["committer"] = commit["committer"]
	}
	for _, field := range []string{"title", "body"} {
		var value string
		if json.Unmarshal(index[field], &value) != nil || len(value) <= 256 {
			continue
		}
		end := 256
		for !utf8.ValidString(value[:end]) {
			end--
		}
		index[field], _ = json.Marshal(value[:end])
		index[field+"OmittedBytes"], _ = json.Marshal(len(value) - end)
	}
	index["evidenceRef"], _ = json.Marshal(ref)
	return index
}

func projectRecord(record map[string]json.RawMessage, keys []string) map[string]json.RawMessage {
	projected := map[string]json.RawMessage{}
	for _, key := range keys {
		if value, ok := record[key]; ok {
			projected[key] = value
		}
	}
	return projected
}

func collectHistory(ctx context.Context, reads reviewruntime.GitHub, fullName, commit string) (HistoryEvidence, error) {
	h := HistoryEvidence{ObservedAt: time.Now().UTC().Format(time.RFC3339), Selection: "Recent evidence window across all states, not an exhaustive audit. Each record has an evidenceRef for its full body. Establish criteria using the minimum sufficient verifiable evidence; request full records only when needed. Unobserved history is not absence.", Collections: []HistoryCollection{}}
	var repository map[string]json.RawMessage
	prefix := "repos/" + fullName
	if err := getJSON(ctx, reads, prefix, &repository); err != nil {
		return h, err
	}
	if repository == nil {
		return h, errors.New("repository evidence missing")
	}
	h.Repository = projectRecord(repository, []string{"id", "full_name", "html_url", "description", "fork", "parent", "archived", "created_at", "updated_at", "pushed_at", "homepage", "default_branch"})
	common := []string{"id", "number", "html_url", "title", "body", "state", "state_reason", "created_at", "updated_at", "closed_at", "merged_at", "merge_commit_sha", "issue_url", "pull_request_url", "commit_id", "path", "diff_hunk", "in_reply_to_id"}
	sources := []struct {
		path string
		keys []string
	}{
		{"/issues?state=all&sort=updated&direction=desc&per_page=20", append(append([]string{}, common...), "pull_request")},
		{"/pulls?state=all&sort=updated&direction=desc&per_page=20", common},
		{"/issues/comments?sort=updated&direction=desc&per_page=20", common},
		{"/pulls/comments?sort=updated&direction=desc&per_page=20", common},
		{"/releases?per_page=20", []string{"id", "html_url", "tag_name", "target_commitish", "name", "body", "draft", "prerelease", "created_at", "published_at", "assets"}},
		{"/commits?sha=" + commit + "&per_page=20", []string{"sha", "html_url", "commit", "parents"}},
	}
	for sourceIndex, source := range sources {
		endpoint := prefix + source.path
		data, err := reads.Do(ctx, reviewruntime.Request{Method: "GET", Endpoint: endpoint})
		if err != nil {
			return h, err
		}
		var records []map[string]json.RawMessage
		if json.Unmarshal(data, &records) != nil || records == nil {
			return h, errors.New("history page unavailable")
		}
		collection := HistoryCollection{Endpoint: endpoint, Records: []map[string]json.RawMessage{}, Complete: len(records) < 20}
		for _, record := range records {
			if record == nil {
				return h, errors.New("history record unavailable")
			}
			full := projectRecord(record, source.keys)
			ref := fmt.Sprintf("history:%d:%d", sourceIndex, len(collection.FullRecords))
			collection.FullRecords = append(collection.FullRecords, full)
			collection.Records = append(collection.Records, historyIndex(full, ref))
		}
		h.Collections = append(h.Collections, collection)
		encoded, err := json.Marshal(h)
		if err != nil {
			return h, fmt.Errorf("history serialization: %w", err)
		}
		if len(encoded) > 750_000 {
			return h, errEvidenceIncomplete
		}
	}
	return h, nil
}
