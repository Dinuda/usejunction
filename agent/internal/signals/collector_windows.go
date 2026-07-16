//go:build windows

package signals

import (
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32                    = windows.NewLazySystemDLL("user32.dll")
	kernel32                  = windows.NewLazySystemDLL("kernel32.dll")
	procGetForegroundWindow   = user32.NewProc("GetForegroundWindow")
	procGetWindowTextW        = user32.NewProc("GetWindowTextW")
	procGetWindowThreadProcID = user32.NewProc("GetWindowThreadProcessId")
	procGetLastInputInfo      = user32.NewProc("GetLastInputInfo")
	procGetTickCount          = kernel32.NewProc("GetTickCount")
)

type platformCollector struct{}

type lastInputInfo struct {
	CbSize uint32
	DwTime uint32
}

func NewCollector() Collector {
	return platformCollector{}
}

func (platformCollector) Snapshot() (Snapshot, error) {
	hwnd, _, _ := procGetForegroundWindow.Call()
	title := windowText(hwnd)
	app := processName(hwnd)
	if app == "" {
		app = title
	}
	domain := inferDomain(app, title)
	return Snapshot{
		ObservedAt: time.Now().UTC(),
		App:        app,
		Domain:     domain,
		Title:      title,
		Idle:       windowsIdleSeconds() >= idleThreshold.Seconds(),
	}, nil
}

func windowText(hwnd uintptr) string {
	buf := make([]uint16, 512)
	n, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if n == 0 {
		return ""
	}
	return windows.UTF16ToString(buf[:n])
}

func processName(hwnd uintptr) string {
	var pid uint32
	procGetWindowThreadProcID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 {
		return ""
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(handle)
	buf := make([]uint16, windows.MAX_PATH)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(handle, 0, &buf[0], &size); err != nil {
		return ""
	}
	name := filepath.Base(windows.UTF16ToString(buf[:size]))
	return strings.TrimSuffix(name, filepath.Ext(name))
}

func windowsIdleSeconds() float64 {
	info := lastInputInfo{CbSize: uint32(unsafe.Sizeof(lastInputInfo{}))}
	ok, _, _ := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return 0
	}
	tick, _, _ := procGetTickCount.Call()
	if tick < uintptr(info.DwTime) {
		return 0
	}
	return float64(uint32(tick)-info.DwTime) / 1000
}
