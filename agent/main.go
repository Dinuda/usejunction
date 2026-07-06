package main

import (
	"os"

	"github.com/usejunction/agent/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
