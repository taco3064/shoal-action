package hosted

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

type Copilot struct {
	Node, Program, Token string
	Reads                reviewruntime.GitHub
	Timeout              time.Duration
	Credits              int
	Failures             []string
	Explanation          string
}
type limitedBuffer struct {
	b        bytes.Buffer
	exceeded bool
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.b.Len()+len(p) > 2_000_000 {
		b.exceeded = true
		return 0, errors.New("semantic output bound exceeded")
	}
	return b.b.Write(p)
}
func (c *Copilot) Judge(ctx context.Context, w reviewruntime.SemanticWork) ([]byte, error) {
	fail := func(code string) ([]byte, error) { c.Failures = unique(c.Failures, code); return nil, errors.New(code) }
	if c.Token == "" {
		return fail("COPILOT_AUTH_UNAVAILABLE")
	}
	// This child receives a new empty HOME/cwd, an explicit environment, no
	// ambient GH_TOKEN, station checkout, auth caches, or Reviewer credentials.
	root, err := os.MkdirTemp("", "shoal-semantic-")
	if err != nil {
		return fail("COPILOT_PROCESS_FAILURE")
	}
	defer os.RemoveAll(root)
	home := filepath.Join(root, "home")
	work := filepath.Join(root, "work")
	if os.Mkdir(home, 0700) != nil || os.Mkdir(work, 0700) != nil {
		return fail("COPILOT_PROCESS_FAILURE")
	}
	env := []string{"PATH=" + filepath.Dir(c.Node), "HOME=" + home, "COPILOT_HOME=" + home, "XDG_CONFIG_HOME=" + home, "XDG_CACHE_HOME=" + home, "TMPDIR=" + root, "COPILOT_GITHUB_TOKEN=" + c.Token, "CI=true", "NO_COLOR=1"}
	call := func(args []string) ([]byte, []byte, error) {
		bounded, cancel := context.WithTimeout(ctx, c.Timeout)
		defer cancel()
		cmd := exec.CommandContext(bounded, c.Node, append([]string{c.Program}, args...)...)
		cmd.Dir = work
		cmd.Env = env
		cmd.Stdin = strings.NewReader("")
		cmd.WaitDelay = 2 * time.Second
		isolateProcess(cmd)
		var out, stderr limitedBuffer
		cmd.Stdout = &out
		cmd.Stderr = &stderr
		err := cmd.Run()
		if bounded.Err() != nil {
			return nil, nil, bounded.Err()
		}
		if out.exceeded || stderr.exceeded {
			return nil, nil, errors.New("semantic output bound exceeded")
		}
		return out.b.Bytes(), stderr.b.Bytes(), err
	}
	version, _, err := call([]string{"--version"})
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return fail("COPILOT_TIMEOUT")
		}
		if errors.Is(err, context.Canceled) {
			return fail("COPILOT_INTERRUPTED")
		}
		return fail("COPILOT_PROCESS_FAILURE")
	}
	if !strings.HasPrefix(string(version), "GitHub Copilot CLI "+CopilotVersion+".\n") {
		return fail("COPILOT_VERSION_MISMATCH")
	}
	collectionContext, collectionCancel := context.WithTimeout(ctx, c.Timeout)
	defer collectionCancel()
	evidence, err := Collect(collectionContext, c.Reads, w)
	if err != nil {
		if errors.Is(err, errEvidenceIncomplete) {
			return fail("EVIDENCE_INCOMPLETE")
		}
		return fail("GITHUB_READ_UNAVAILABLE")
	}
	// Use stdin rather than argv: policy/Target bytes can exceed OS argument limits.
	for round := 0; round <= 3; round++ {
		args := []string{"--no-auto-update", "--no-custom-instructions", "--disable-builtin-mcps", "--available-tools=none", "--deny-tool=shell", "--deny-tool=write", "--deny-tool=url", "--no-ask-user", "--no-remote", "--no-remote-export", "--log-level=none", "--silent", "--stream=off", "--output-format=json", "--max-ai-credits=" + credits(c.Credits)}
		bounded, cancel := context.WithTimeout(ctx, c.Timeout)
		defer cancel()
		cmd := exec.CommandContext(bounded, c.Node, append([]string{c.Program}, args...)...)
		cmd.Dir = work
		cmd.Env = env
		cmd.Stdin = strings.NewReader(Prompt(evidence) + evidenceInstructions(round))
		cmd.WaitDelay = 2 * time.Second
		isolateProcess(cmd)
		var out, stderr limitedBuffer
		cmd.Stdout = &out
		cmd.Stderr = &stderr
		err = cmd.Run()
		if bounded.Err() != nil {
			if errors.Is(bounded.Err(), context.DeadlineExceeded) {
				return fail("COPILOT_TIMEOUT")
			}
			return fail("COPILOT_INTERRUPTED")
		}
		if out.exceeded || stderr.exceeded {
			return fail("COPILOT_RESULT_MALFORMED")
		}
		if err != nil {
			return fail(ClassifyFailure(string(out.b.Bytes()) + "\n" + string(stderr.b.Bytes())))
		}
		result, code := DecodeEvents(out.b.Bytes())
		c.Explanation = semanticExplanation(out.b.Bytes())
		if code != "" {
			if code == "COPILOT_PROCESS_FAILURE" {
				code = ClassifyFailure(string(out.b.Bytes()) + "\n" + string(stderr.b.Bytes()))
			}
			return fail(code)
		}
		var requested struct {
			Requests []evidenceRequest `json:"evidenceRequests"`
		}
		if json.Unmarshal(result, &requested) == nil && requested.Requests != nil {
			if round == 3 {
				return fail("EVIDENCE_INCOMPLETE")
			}
			if err := expandEvidence(collectionContext, c.Reads, &evidence, requested.Requests); err != nil {
				return fail("EVIDENCE_INCOMPLETE")
			}
			continue
		}
		return result, nil
	}
	return fail("EVIDENCE_INCOMPLETE")
}
func credits(n int) string { b, _ := json.Marshal(n); return string(b) }

// Classification is a conservative transport adapter, not semantic reasoning.
// Unrecognized failures retain PROCESS_FAILURE and never become FAIL.
func ClassifyFailure(text string) string {
	s := strings.ToLower(text)
	for _, word := range []string{"quota", "credit limit", "ai credits", "budget", "premium request limit", "rate limit"} {
		if strings.Contains(s, word) {
			return "COPILOT_BUDGET_UNAVAILABLE"
		}
	}
	for _, word := range []string{"access denied by policy", "entitlement", "subscription", "not enabled", "policy settings"} {
		if strings.Contains(s, word) {
			return "COPILOT_ENTITLEMENT_UNAVAILABLE"
		}
	}
	for _, word := range []string{"unauthorized", "authentication", "invalid token", "not logged in", "401"} {
		if strings.Contains(s, word) {
			return "COPILOT_AUTH_UNAVAILABLE"
		}
	}
	return "COPILOT_PROCESS_FAILURE"
}
func DecodeEvents(data []byte) ([]byte, string) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, "COPILOT_RESULT_MISSING"
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	finals, completions := 0, 0
	var final string
	for {
		var event struct {
			Type string `json:"type"`
			Data struct {
				Phase        string            `json:"phase"`
				Content      string            `json:"content"`
				ToolRequests []json.RawMessage `json:"toolRequests"`
			} `json:"data"`
			ExitCode *int `json:"exitCode"`
		}
		err := dec.Decode(&event)
		if err == io.EOF {
			break
		}
		if err != nil || event.Type == "" {
			return nil, "COPILOT_RESULT_MALFORMED"
		}
		if len(event.Data.ToolRequests) > 0 || strings.HasPrefix(event.Type, "tool.") {
			return nil, "COPILOT_TOOL_REQUEST"
		}
		if event.Type == "session.error" || event.Type == "error" {
			return nil, ClassifyFailure(string(data))
		}
		if event.Type == "assistant.message" && event.Data.Phase == "final_answer" {
			finals++
			final = event.Data.Content
		}
		if event.Type == "result" {
			completions++
			if event.ExitCode == nil || *event.ExitCode != 0 {
				return nil, "COPILOT_PROCESS_FAILURE"
			}
		}
	}
	if completions != 1 || finals != 1 || strings.TrimSpace(final) == "" {
		return nil, "COPILOT_RESULT_MISSING"
	}
	if !json.Valid([]byte(final)) {
		return nil, "COPILOT_RESULT_MALFORMED"
	}
	var abstention struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if json.Unmarshal([]byte(final), &abstention) == nil && abstention.Status == "INSUFFICIENT_EVIDENCE" {
		return nil, "EVIDENCE_INCOMPLETE"
	}
	// Correspondence, duplicates, verdict and explanation validation belong to
	// the shared runtime, including independently usable partial results.
	return []byte(final), ""
}
