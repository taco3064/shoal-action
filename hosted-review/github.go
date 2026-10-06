package hosted

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

type GitHub struct {
	Role, token, Station string
	client               *http.Client
	Failures             []string
}

func newGitHub(role, token, station string) *GitHub {
	return &GitHub{Role: role, token: token, Station: station, client: &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

var issueTail = regexp.MustCompile(`^issues/[1-9][0-9]*$`)
var verificationPath = regexp.MustCompile(`^repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(?:commits/[a-f0-9]{40}/check-runs|compare/[a-f0-9]{40}\.\.\.[A-Za-z0-9_.-]+:[a-f0-9]{40})$`)
var readPath = regexp.MustCompile(`^(repositories/[1-9][0-9]*|users/[A-Za-z0-9_.-]+/repos|repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/(?:issues(?:/comments|/[1-9][0-9]*(?:/comments)?)?|pulls(?:/comments)?|releases|commits|branches/.+|git/ref/heads/.+|git/commits/[a-f0-9]{40}|git/trees/[a-f0-9]{40}|git/blobs/[a-f0-9]{40}|contents/.+))?)$`)

func (g *GitHub) allowed(r reviewruntime.Request) bool {
	u, err := url.Parse(r.Endpoint)
	if err != nil || u.IsAbs() || u.Host != "" || strings.HasPrefix(u.Path, "/") || strings.Contains(u.Path, "\\") || u.Fragment != "" {
		return false
	}
	for _, segment := range strings.Split(u.Path, "/") {
		if segment == "." || segment == ".." {
			return false
		}
	}
	path := u.Path
	if g.Role == "read" {
		return r.Method == "GET" && len(r.Fields) == 0 && (readPath.MatchString(path) || verificationPath.MatchString(path))
	}
	if u.RawQuery != "" || r.Paginate {
		return false
	}
	stationPrefix := "repos/" + g.Station + "/"
	tail := strings.TrimPrefix(path, stationPrefix)
	if g.Role == "lifecycle" {
		return strings.HasPrefix(path, stationPrefix) && issueTail.MatchString(tail) && r.Method == "PATCH" && len(r.Fields) == 1 && (r.Fields["state"] == "open" || r.Fields["state"] == "closed")
	}
	if g.Role == "personal" {
		if path == "user" {
			return r.Method == "GET" && len(r.Fields) == 0
		}
		if strings.HasPrefix(path, "user/starred/") && locator.MatchString(strings.TrimPrefix(path, "user/starred/")) {
			return (r.Method == "GET" || r.Method == "PUT" || r.Method == "DELETE") && len(r.Fields) == 0
		}
		return strings.HasPrefix(path, stationPrefix) && strings.HasSuffix(tail, "/comments") && issueTail.MatchString(strings.TrimSuffix(tail, "/comments")) && r.Method == "POST" && len(r.Fields) == 1 && r.Fields["body"] != ""
	}
	return false
}
func (g *GitHub) failed() {
	code := map[string]string{"read": "GITHUB_READ_UNAVAILABLE", "lifecycle": "LIFECYCLE_AUTHORITY_UNAVAILABLE", "personal": "REVIEWER_AUTHORITY_UNAVAILABLE"}[g.Role]
	g.Failures = unique(g.Failures, code)
}
func (g *GitHub) Do(ctx context.Context, r reviewruntime.Request) ([]byte, error) {
	if !g.allowed(r) {
		g.failed()
		return nil, errors.New("host operation allowlist refused request")
	}
	endpoint := "https://api.github.com/" + r.Endpoint
	// GitHub's Link header can use the immutable repository ID alias. Bind
	// that alias to authoritative metadata, never to an arbitrary Link path.
	alias := ""
	parts := strings.Split(strings.SplitN(r.Endpoint, "?", 2)[0], "/")
	if r.Paginate && len(parts) > 3 && parts[0] == "repos" {
		name := parts[1] + "/" + parts[2]
		data, err := g.Do(ctx, reviewruntime.Request{Method: "GET", Endpoint: "repos/" + name})
		var repository struct {
			ID       int64
			FullName string `json:"full_name"`
		}
		if err != nil || json.Unmarshal(data, &repository) != nil || repository.ID <= 0 || !strings.EqualFold(repository.FullName, name) {
			g.failed()
			return nil, errors.New("pagination repository identity unavailable")
		}
		alias = fmt.Sprintf("/repositories/%d/%s", repository.ID, strings.Join(parts[3:], "/"))
	}
	var pages []json.RawMessage
	totalBytes := 0
	seen := map[string]bool{}
	for page := 0; page < 1000; page++ {
		if seen[endpoint] {
			g.failed()
			return nil, errors.New("pagination loop")
		}
		seen[endpoint] = true
		var payload []byte
		if len(r.Fields) > 0 {
			payload, _ = json.Marshal(r.Fields)
		}
		req, err := http.NewRequestWithContext(ctx, r.Method, endpoint, bytes.NewReader(payload))
		if err != nil {
			g.failed()
			return nil, errors.New("invalid GitHub request")
		}
		req.Header.Set("Authorization", "Bearer "+g.token)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
		req.Header.Set("User-Agent", "shoal-hosted-review")
		req.Header.Set("Content-Type", "application/json")
		res, err := g.client.Do(req)
		if err != nil {
			g.failed()
			return nil, errors.New("GitHub transport unavailable")
		}
		data, readErr := io.ReadAll(io.LimitReader(res.Body, 4_000_001))
		res.Body.Close()
		if readErr != nil || len(data) > 4_000_000 {
			g.failed()
			return nil, errors.New("GitHub response unavailable or exceeds bound")
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			// Observable 404 is absence; every other failure is unverified state.
			if res.StatusCode != 404 {
				g.failed()
			}
			return nil, reviewruntime.APIError{Status: res.StatusCode, Message: "GitHub operation unavailable"}
		}
		if !r.Paginate {
			return data, nil
		}
		totalBytes += len(data)
		if totalBytes > 16_000_000 {
			g.failed()
			return nil, errEvidenceIncomplete
		}
		var collection []json.RawMessage
		if json.Unmarshal(data, &collection) != nil || strings.TrimSpace(string(data)) == "null" {
			g.failed()
			return nil, errors.New("malformed paginated collection")
		}
		pages = append(pages, json.RawMessage(data))
		next, err := nextPage(res.Header.Get("Link"), req.URL, alias)
		if err != nil {
			g.failed()
			return nil, err
		}
		if next == "" {
			return json.Marshal(pages)
		}
		endpoint = next
	}
	g.failed()
	return nil, errors.New("incomplete GitHub pagination")
}
func nextPage(link string, current *url.URL, aliases ...string) (string, error) {
	var next string
	for _, part := range strings.Split(link, ",") {
		if !strings.Contains(part, `rel="next"`) {
			continue
		}
		left, right := strings.Index(part, "<"), strings.Index(part, ">")
		if left < 0 || right <= left || next != "" {
			return "", errors.New("invalid pagination link")
		}
		u, err := url.Parse(part[left+1 : right])
		if err != nil {
			return "", errors.New("invalid pagination URL")
		}
		// Never follow a credential-bearing redirect or foreign/query-expanded path.
		pathOK := u.Path == current.Path
		for _, alias := range aliases {
			pathOK = pathOK || (alias != "" && u.Path == alias)
		}
		if u.Scheme != "https" || u.Host != "api.github.com" || u.User != nil || !pathOK || u.RawPath != "" || u.Fragment != "" {
			return "", errors.New("unsafe pagination URL")
		}
		a, err := url.ParseQuery(u.RawQuery)
		if err != nil {
			return "", errors.New("invalid pagination query")
		}
		b := current.Query()
		for _, key := range []string{"page", "after", "before"} {
			if values, ok := a[key]; ok {
				if len(values) != 1 || values[0] == "" || len(values[0]) > 4096 {
					return "", errors.New("invalid pagination cursor")
				}
				if key == "page" {
					if n, err := strconv.Atoi(values[0]); err != nil || n < 1 {
						return "", errors.New("invalid pagination page")
					}
				}
			}
			a.Del(key)
			b.Del(key)
		}
		if a.Encode() != b.Encode() {
			return "", fmt.Errorf("pagination changed query")
		}
		next = u.String()
	}
	return next, nil
}
