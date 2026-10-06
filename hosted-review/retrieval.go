package hosted

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/taco3064/gh-shoal/reviewruntime"
)

type evidenceRequest struct {
	Issue int    `json:"issue"`
	Ref   string `json:"ref"`
}

// Requests identify only observed history records or immutable target blobs.
// No model-supplied URL, command, filesystem path, or credential is executed.
func expandEvidence(ctx context.Context, reads reviewruntime.GitHub, e *Evidence, requests []evidenceRequest) error {
	if len(requests) == 0 || len(requests) > 8 {
		return errors.New("invalid evidence request count")
	}
	for _, request := range requests {
		found := false
		for i := range e.Items {
			item := &e.Items[i]
			if item.Issue != request.Issue {
				continue
			}
			for ci, collection := range item.History.Collections {
				for ri, record := range collection.FullRecords {
					if request.Ref != fmt.Sprintf("history:%d:%d", ci, ri) {
						continue
					}
					full := make(map[string]json.RawMessage, len(record)+1)
					for key, value := range record {
						full[key] = value
					}
					full["evidenceRef"], _ = json.Marshal(request.Ref)
					encoded, _ := json.Marshal(full)
					if len(encoded) > 128_000 {
						return errEvidenceIncomplete
					}
					item.ExpandedHistory = append(item.ExpandedHistory, full)
					found = true
				}
			}
			for _, file := range item.AvailableFiles {
				if request.Ref != "file:"+file.Path {
					continue
				}
				var target string
				for _, basis := range e.Work.Items {
					if basis.Issue == item.Issue {
						target = basis.TargetFullName
					}
				}
				if !locator.MatchString(target) {
					return errors.New("missing evidence target")
				}
				var blob struct{ Encoding, Content, SHA string }
				if err := getJSON(ctx, reads, "repos/"+target+"/git/blobs/"+file.Blob, &blob); err != nil {
					return err
				}
				if blob.SHA != file.Blob {
					return errors.New("requested blob correspondence failed")
				}
				text, err := decodeFile(blob.Encoding, blob.Content, file.Blob, 128_000)
				if err != nil {
					return err
				}
				item.Files = append(item.Files, FileEvidence{file.Path, file.Blob, text})
				found = true
			}
		}
		if !found {
			return errors.New("evidence reference not in observed scope")
		}
	}
	encoded, err := json.Marshal(e)
	if err != nil {
		return err
	}
	if len(encoded) > 1_000_000 {
		return errEvidenceIncomplete
	}
	return nil
}

func evidenceInstructions(round int) string {
	remaining := 3 - round
	return fmt.Sprintf("\nUse the minimum sufficient verifiable evidence for each Policy criterion; an exhaustive history or file audit is not required unless Policy explicitly requires one. Recent history includes all lifecycle states but is only a window, not proof that older records do not exist. Body/title omitted-byte markers identify excerpts. Before abstaining for missing detail, request only decisive full records or files using exactly {\"evidenceRequests\":[{\"issue\":1,\"ref\":\"history:0:0\"},{\"issue\":1,\"ref\":\"file:src/example.ts\"}]}. Use observed evidenceRef values or file: plus an availableFiles path, at most 8 requests per round. Full records appear in expandedHistory and fetched files in targetFiles. You have %d retrieval rounds remaining. Do not repeat fulfilled requests. If these scoped sources cannot resolve a criterion, return INSUFFICIENT_EVIDENCE with the specific remaining gap. Do not infer FAIL from collection limits.\n", remaining)
}

func semanticExplanation(events []byte) string {
	decoder := json.NewDecoder(strings.NewReader(string(semanticEventStream(events))))
	for decoder.More() {
		var event struct {
			Type string
			Data struct{ Phase, Content string }
		}
		if decoder.Decode(&event) != nil {
			break
		}
		if event.Type == "assistant.message" && event.Data.Phase == "final_answer" {
			var value struct{ Reason string }
			if json.Unmarshal([]byte(event.Data.Content), &value) == nil && len(value.Reason) <= 3000 {
				return value.Reason
			}
		}
	}
	return ""
}
