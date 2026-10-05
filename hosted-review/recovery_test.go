package hosted

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPartialSuccessRetryKeepsVerifiedJudgment(t *testing.T) {
	f := newFixture(t)
	f.failClose = true
	c := config(t, "PASS")
	o := run(context.Background(), c, client(f))
	if o.Runtime.Status != "PARTIAL" || !o.StopSemanticWork || !f.star || f.state != "open" || len(f.comments) != 2 {
		t.Fatalf("lost valid partial work: %+v", o)
	}
	f.failClose = false
	c.Copilot = "/unavailable-agent-must-not-be-needed"
	o = run(context.Background(), c, client(f))
	if o.StopSemanticWork || f.state != "closed" || len(f.comments) != 2 {
		t.Fatalf("retry manufactured semantic judgment: %+v", o)
	}
}
func TestAmbiguousWritesAreReadBackWithoutReplay(t *testing.T) {
	f := newFixture(t)
	f.lostStar = true
	f.lostComment = true
	f.lostClose = true
	c := config(t, "PASS")
	o := run(context.Background(), c, client(f))
	if o.StopSemanticWork || o.Runtime.Status != "COMPLETED" || !f.star || f.state != "closed" || len(f.comments) != 2 {
		t.Fatalf("ambiguous write recovery: %+v", o)
	}
	if strings.Count(strings.Join(f.ledger, "\n"), "PUT user/starred/") != 1 || strings.Count(strings.Join(f.ledger, "\n"), "PATCH repos/") != 1 {
		t.Fatal("ambiguous writes blindly replayed")
	}
}
func TestInterruptedSemanticExecution(t *testing.T) {
	f := newFixture(t)
	c := config(t, "timeout")
	c.Timeout = 10 * time.Second
	// Cancel after the semantic process starts, not during variable-speed Git preflight.
	marker := filepath.Join(t.TempDir(), "semantic-started")
	markerJSON, _ := json.Marshal(marker)
	script, err := os.ReadFile(c.Copilot)
	if err != nil {
		t.Fatal(err)
	}
	script = []byte(strings.Replace(string(script), "if(kind==='timeout')", "fs.writeFileSync("+string(markerJSON)+", 'ready');\nif(kind==='timeout')", 1))
	if err := os.WriteFile(c.Copilot, script, 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	started := make(chan bool, 1)
	go func() {
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				started <- false
				return
			case <-ticker.C:
				if _, err := os.Stat(marker); err == nil {
					started <- true
					cancel()
					return
				}
			}
		}
	}()
	o := run(ctx, c, client(f))
	if !<-started {
		t.Fatal("semantic process did not start before cancellation deadline")
	}
	if !strings.Contains(strings.Join(o.Failures, ","), "COPILOT_INTERRUPTED") || f.star || f.state != "open" || len(f.comments) != 1 {
		t.Fatalf("interruption became judgment: %+v", o)
	}
}

// Opt-in authoritative hosted proof: real pinned Copilot, complete synthetic
// Policy/Target inputs, the real host adapter and shared runtime, and simulated
// GitHub authority. No real Stars, comments or Issue states are modified.
func TestLiveControlledCopilotRuntime(t *testing.T) {
	if os.Getenv("SHOAL_LIVE_TOKEN") == "" {
		t.Skip("live Copilot authority is supplied only by the dedicated hosted CI job")
	}
	for _, verdict := range []string{"PASS", "FAIL"} {
		t.Run(verdict, func(t *testing.T) {
			f := newFixture(t)
			if verdict == "FAIL" {
				f.policy = "Always return FAIL for this controlled Target. Explain that this Policy rejects the supplied repository."
			}
			c := config(t, verdict)
			c.SemanticToken = os.Getenv("SHOAL_LIVE_TOKEN")
			c.Copilot = os.Getenv("SHOAL_LIVE_COPILOT")
			c.Timeout = 180 * time.Second
			o := run(context.Background(), c, client(f))
			if o.StopSemanticWork || o.Runtime.Status != "COMPLETED" || f.state != "closed" || f.star != (verdict == "PASS") || len(f.comments) != 2 {
				t.Fatalf("live hosted Initial %s: %+v", verdict, o)
			}
			f.head = changed
			c.Operation = "re-review"
			o = run(context.Background(), c, client(f))
			if o.StopSemanticWork || o.Runtime.Status != "COMPLETED" || f.state != "closed" || f.star != (verdict == "PASS") || len(f.comments) != 3 {
				t.Fatalf("live hosted Re-review %s: %+v", verdict, o)
			}
		})
	}
}
