//go:build !linux

package hosted

import "os/exec"

// The production Hosted Action supports Linux runners only. Other platforms can
// compile the package for correspondence inspection, not hosted execution.
func isolateProcess(cmd *exec.Cmd) {}
