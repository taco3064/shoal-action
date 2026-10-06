package hosted

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

var errEvidenceIncomplete = errors.New("evidence exceeds complete collection budget")

// History is observed GitHub state, not immutable Git content. Preserve that
// distinction and endpoint provenance instead of calling it a commit snapshot.
type HistoryEvidence struct {
	ObservedAt  string                     `json:"observedAt"`
	Repository  map[string]json.RawMessage `json:"repository"`
	Collections []HistoryCollection        `json:"collections"`
}

type HistoryCollection struct {
	Endpoint string                       `json:"endpoint"`
	Records  []map[string]json.RawMessage `json:"records"`
	Complete bool                         `json:"complete"`
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
	h := HistoryEvidence{ObservedAt: time.Now().UTC().Format(time.RFC3339), Collections: []HistoryCollection{}}
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
		{"/issues?state=all&sort=created&direction=asc&per_page=100", append(append([]string{}, common...), "pull_request")},
		{"/pulls?state=all&sort=created&direction=asc&per_page=100", common},
		{"/issues/comments?sort=created&direction=asc&per_page=100", common},
		{"/pulls/comments?sort=created&direction=asc&per_page=100", common},
		{"/releases?per_page=100", []string{"id", "html_url", "tag_name", "target_commitish", "name", "body", "draft", "prerelease", "created_at", "published_at", "assets"}},
		{"/commits?sha=" + commit + "&per_page=100", []string{"sha", "html_url", "commit", "parents"}},
	}
	for _, source := range sources {
		endpoint := prefix + source.path
		data, err := reads.Do(ctx, reviewruntime.Request{Method: "GET", Endpoint: endpoint, Paginate: true})
		if err != nil {
			return h, err
		}
		var pages []json.RawMessage
		if json.Unmarshal(data, &pages) != nil || len(pages) == 0 {
			return h, errors.New("history pagination unavailable")
		}
		collection := HistoryCollection{Endpoint: endpoint, Records: []map[string]json.RawMessage{}, Complete: true}
		for _, page := range pages {
			var records []map[string]json.RawMessage
			if json.Unmarshal(page, &records) != nil || records == nil {
				return h, errors.New("history page unavailable")
			}
			for _, record := range records {
				if record == nil {
					return h, errors.New("history record unavailable")
				}
				collection.Records = append(collection.Records, projectRecord(record, source.keys))
			}
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
