package hosted

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// Inspect test output only. Production rendering/parsing remains entirely in
// the integrity-locked shared runtime; the adapter has no evidence codec.
func TestHostedCanonicalEvidenceAndProseIsolation(t *testing.T) {
	f := newFixture(t)
	c := config(t, "PASS")
	o := run(context.Background(), c, client(f))
	if o.Runtime.Status != "COMPLETED" || len(f.comments) != 2 {
		t.Fatalf("initial evidence missing: %+v", o)
	}
	for index, comment := range f.comments {
		body := comment["body"].(string)
		human, payload, ok := strings.Cut(body, "<!-- shoal-evidence:v1:start -->")
		if !ok || !strings.Contains(human, "<summary>Formal Shoal evidence</summary>") {
			t.Fatal("human-first disclosure absent")
		}
		payload, _, ok = strings.Cut(payload, "<!-- shoal-evidence:v1:end -->")
		var document struct {
			FormatVersion int               `json:"formatVersion"`
			Record        map[string]any    `json:"record"`
			Presentation  map[string]string `json:"presentation"`
		}
		if !ok || json.Unmarshal([]byte(payload), &document) != nil || document.FormatVersion != 1 {
			t.Fatal("formal evidence envelope absent")
		}
		if _, exists := document.Record["explanation"]; exists {
			t.Fatal("explanation leaked into Protocol record")
		}
		if index == 0 {
			if !strings.Contains(human, "Canonical Review Thread") || !strings.Contains(human, "alice/project") {
				t.Fatal("Admission context absent")
			}
			continue
		}
		for _, key := range []string{"verdict", "targetRepositoryFullName", "targetCommit", "reviewPolicyCommit"} {
			if !strings.Contains(human, document.Record[key].(string)) {
				t.Fatalf("visible field does not derive from record: %s", key)
			}
		}
		if document.Presentation["explanation"] == "" || !strings.Contains(human, "Actual Star state: starred") {
			t.Fatal("human explanation / actual Star missing")
		}
		comment["body"] = strings.Replace(body, "## Review Result: PASS", "## Review Result: FAIL", 1)
	}
	c.Copilot = "/must-not-run-after-prose-edit"
	o = run(context.Background(), c, client(f))
	if o.Runtime.Status != "NO_CHANGES" || !f.star || len(f.comments) != 2 {
		t.Fatalf("prose changed formal history: %+v", o)
	}
}

func TestHostedMalformedEnvelopeRefusesBeforeEffects(t *testing.T) {
	for _, kind := range []string{"unsupported", "duplicate", "malformed"} {
		t.Run(kind, func(t *testing.T) {
			f := newFixture(t)
			c := config(t, "PASS")
			if o := run(context.Background(), c, client(f)); o.Runtime.Status != "COMPLETED" {
				t.Fatal(o)
			}
			body := f.comments[1]["body"].(string)
			switch kind {
			case "unsupported":
				body = strings.Replace(body, `"formatVersion":1`, `"formatVersion":99`, 1)
			case "duplicate":
				body += body
			case "malformed":
				body = strings.Replace(body, "<!-- shoal-evidence:v1:end -->", "", 1)
			}
			f.comments[1]["body"] = body
			c.Copilot = "/must-not-run-for-incompatible-evidence"
			o := run(context.Background(), c, client(f))
			if o.Runtime.Status != "REFUSED" || o.Runtime.EffectAttempts != 0 || !f.star || len(f.comments) != 2 {
				t.Fatalf("malformed evidence reached effects: %+v", o)
			}
		})
	}
}
