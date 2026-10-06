// Package hosted adapts transport and semantic execution to the accepted runtime.
// All admission, judgment validation and lifecycle decisions remain in gh-shoal.
package hosted

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

const SourceCommit = "980d9eaecb820c32d3693aea487a3b3029ed254e"
const CopilotVersion = "1.0.91"

type Config struct {
	Operation, Station, Directory, SemanticToken, ReadToken, LifecycleToken, PersonalToken string
	Copilot, Node                                                                          string
	Timeout                                                                                time.Duration
	MaxCredits                                                                             int
}
type Outcome struct {
	FormatVersion    int                  `json:"formatVersion"`
	Operation        string               `json:"operation"`
	RuntimeSource    string               `json:"runtimeSource"`
	CopilotVersion   string               `json:"copilotVersion"`
	Runtime          reviewruntime.Result `json:"runtime"`
	Failures         []string             `json:"failures"`
	StopSemanticWork bool                 `json:"stopSemanticWork"`
}

var locator = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var sha = regexp.MustCompile(`^[a-f0-9]{40}$`)

func Run(ctx context.Context, c Config) Outcome {
	return run(ctx, c, nil)
}
func run(ctx context.Context, c Config, client *http.Client) Outcome {
	o := Outcome{FormatVersion: 1, Operation: c.Operation, RuntimeSource: SourceCommit, CopilotVersion: CopilotVersion, Failures: []string{}}
	fail := func(code string) Outcome {
		o.Runtime = reviewruntime.Result{Status: "REFUSED", Faults: []reviewruntime.Fault{{Code: code, Detail: "Hosted dependency unavailable or invalid"}}}
		o.Failures = []string{code}
		o.StopSemanticWork = true
		return o
	}
	if c.Operation != "review" && c.Operation != "re-review" {
		return fail("INVOCATION_INVALID")
	}
	if !locator.MatchString(c.Station) || c.Directory == "" || c.Timeout < time.Second || c.Timeout > 10*time.Minute || c.MaxCredits < 30 || c.MaxCredits > 1000 {
		return fail("INVOCATION_INVALID")
	}
	directory, err := filepath.Abs(c.Directory)
	if err != nil {
		return fail("INVOCATION_INVALID")
	}
	c.Directory = directory
	// Required credentials are never resolved from ambient gh/GitHub state.
	if c.ReadToken == "" {
		return fail("GITHUB_READ_UNAVAILABLE")
	}
	if c.LifecycleToken == "" {
		return fail("LIFECYCLE_AUTHORITY_UNAVAILABLE")
	}
	if c.PersonalToken == "" {
		return fail("REVIEWER_AUTHORITY_UNAVAILABLE")
	}
	reads := newGitHub("read", c.ReadToken, c.Station)
	lifecycle := newGitHub("lifecycle", c.LifecycleToken, c.Station)
	personal := newGitHub("personal", c.PersonalToken, c.Station)
	if client != nil {
		reads.client = client
		lifecycle.client = client
		personal.client = client
	}
	agent := &Copilot{Node: c.Node, Program: c.Copilot, Token: c.SemanticToken, Reads: reads, Timeout: c.Timeout, Credits: c.MaxCredits}
	git := func(ctx context.Context, args ...string) ([]byte, error) {
		cmd := exec.CommandContext(ctx, "git", args...)
		cmd.Dir = c.Directory
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + os.DevNull, "GIT_TERMINAL_PROMPT=0"}
		return cmd.Output()
	}
	rt, err := reviewruntime.New(reviewruntime.Dependencies{Reads: reads, Lifecycle: lifecycle, Personal: personal, Git: git, Agent: agent}, reviewruntime.Options{Directory: c.Directory})
	if err != nil {
		return fail("RUNTIME_DEPENDENCY_UNAVAILABLE")
	}
	// The station checkout must match the workflow's explicit repository locator.
	b, err := git(ctx, "-C", c.Directory, "remote", "get-url", "origin")
	if err != nil || !stationRemote(strings.TrimSpace(string(b)), c.Station) {
		return fail("STATION_IDENTITY_INVALID")
	}
	if c.Operation == "review" {
		o.Runtime = rt.Review(ctx)
	} else {
		o.Runtime = rt.ReReview(ctx)
	}
	if len(o.Runtime.Faults) > 0 {
		for _, code := range append(append(append(reads.Failures, lifecycle.Failures...), personal.Failures...), agent.Failures...) {
			o.Failures = unique(o.Failures, code)
		}
	}
	for _, fault := range o.Runtime.Faults {
		// Structured codes only; never parse runtime human diagnostics.
		switch fault.Code {
		case "CLI_UPGRADE_REQUIRED", "REPAIRABLE_STATION_DRIFT", "INCOMPATIBLE_PROTOCOL_EVIDENCE":
			o.Failures = unique(o.Failures, "RUNTIME_COMPATIBILITY_REFUSED")
		case "AGENT_RESULT_INVALID":
			o.Failures = unique(o.Failures, "COPILOT_RESULT_UNUSABLE")
		case "EXTERNAL_STATE_UNAVAILABLE":
			o.Failures = unique(o.Failures, "RUNTIME_CONVERGENCE_INCOMPLETE")
		default:
			o.Failures = unique(o.Failures, fault.Code)
		}
	}
	o.StopSemanticWork = len(o.Failures) > 0
	// Fault text is presentation, can contain arbitrary external content. Publish
	// only structured codes, never raw API errors, prompts or subprocess output.
	for i := range o.Runtime.Faults {
		o.Runtime.Faults[i].Detail = "See structured hosted failure codes; public state remains authoritative"
	}
	return o
}
func unique(values []string, code string) []string {
	for _, v := range values {
		if v == code {
			return values
		}
	}
	return append(values, code)
}
func stationRemote(remote, station string) bool {
	return remote == "https://github.com/"+station+".git" || remote == "https://github.com/"+station || remote == "git@github.com:"+station+".git"
}

// WriteOutputs uses single-line JSON only. Credentials and subprocess diagnostics
// are absent. Operational refusal is a successful Action transport invocation.
func WriteOutputs(path string, o Outcome) error {
	data, err := json.Marshal(o)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Clean(path), os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString("result=" + string(data) + "\nstatus=" + o.Runtime.Status + "\nstop_semantic_work=" + map[bool]string{true: "true", false: "false"}[o.StopSemanticWork] + "\n")
	return err
}
