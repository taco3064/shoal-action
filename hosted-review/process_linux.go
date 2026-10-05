package hosted

import (
	"os/exec"
	"syscall"
)

// Copilot's npm loader spawns a native child. Kill the entire isolated process
// group on cancellation, including children holding stdout/stderr open.
func isolateProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
}
