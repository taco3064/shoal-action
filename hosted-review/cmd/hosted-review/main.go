package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	hosted "github.com/taco3064/shoal-action/hosted-review"
)

func main() {
	c := hosted.Config{Operation: os.Getenv("SHOAL_OPERATION"), Station: os.Getenv("SHOAL_STATION"), Directory: os.Getenv("SHOAL_DIRECTORY"), SemanticToken: os.Getenv("SHOAL_SEMANTIC_TOKEN"), ReadToken: os.Getenv("SHOAL_READ_TOKEN"), LifecycleToken: os.Getenv("SHOAL_LIFECYCLE_TOKEN"), PersonalToken: os.Getenv("SHOAL_PERSONAL_TOKEN"), Node: os.Getenv("SHOAL_NODE"), Copilot: os.Getenv("SHOAL_COPILOT")}
	seconds, _ := strconv.Atoi(os.Getenv("SHOAL_TIMEOUT"))
	c.Timeout = time.Duration(seconds) * time.Second
	c.MaxCredits, _ = strconv.Atoi(os.Getenv("SHOAL_MAX_CREDITS"))
	output := os.Getenv("GITHUB_OUTPUT")
	// Drop credential-bearing ambient state before any subprocess is created.
	for _, key := range []string{"SHOAL_SEMANTIC_TOKEN", "SHOAL_READ_TOKEN", "SHOAL_LIFECYCLE_TOKEN", "SHOAL_PERSONAL_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "COPILOT_GITHUB_TOKEN", "INPUT_COPILOT_TOKEN", "INPUT_READ_TOKEN", "INPUT_LIFECYCLE_TOKEN", "INPUT_REVIEWER_TOKEN"} {
		os.Unsetenv(key)
	}
	if runtime.GOOS != "linux" {
		fmt.Fprintln(os.Stderr, "Hosted Review requires a Linux runner")
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	o := hosted.Run(ctx, c)
	if output != "" {
		if hosted.WriteOutputs(output, o) != nil {
			fmt.Fprintln(os.Stderr, "Unable to publish Hosted Review transport output")
			os.Exit(1)
		}
	}
	b, _ := json.Marshal(o)
	fmt.Println(string(b))
}
