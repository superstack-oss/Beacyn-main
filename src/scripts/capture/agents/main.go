package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

type Config struct {
	APIBaseURL      string
	APIToken        string
	Interval        time.Duration
	LogPayload      bool
	AgentID         string
	AgentVersion    string
	RequestTimeout  time.Duration
}

type CPUInfo struct {
	UsagePct      float64   `json:"usagePct"`
	Load          []float64 `json:"load"`
	Cores         int       `json:"cores"`
	LogicalCores  int       `json:"logicalCores"`
	PhysicalCores int       `json:"physicalCores"`
	FrequencyMHz  int       `json:"frequencyMHz"`
	TemperatureC  *float64  `json:"temperatureC,omitempty"`
}

type SwapInfo struct {
	Total   uint64  `json:"total"`
	Free    uint64  `json:"free"`
	Used    uint64  `json:"used"`
	UsedPct float64 `json:"usedPct"`
}

type MemoryInfo struct {
	Total   uint64   `json:"total"`
	Free    uint64   `json:"free"`
	Used    uint64   `json:"used"`
	UsedPct float64  `json:"usedPct"`
	Swap    SwapInfo `json:"swap"`
}

type DiskUsageRow struct {
	Filesystem string `json:"filesystem"`
	SizeBytes  uint64 `json:"sizeBytes"`
	UsedBytes  uint64 `json:"usedBytes"`
	AvailBytes uint64 `json:"availBytes"`
	UsedPct    string `json:"usedPct"`
	Mountpoint string `json:"mountpoint"`
}

type InodeUsageRow struct {
	Filesystem string `json:"filesystem"`
	Inodes     uint64 `json:"inodes"`
	Used       uint64 `json:"used"`
	Free       uint64 `json:"free"`
	UsedPct    string `json:"usedPct"`
	Mountpoint string `json:"mountpoint"`
}

type OSEntry struct {
	Platform string `json:"platform"`
	Distro   string `json:"distro"`
	Version  string `json:"version"`
}

type Payload struct {
	Timestamp     string                 `json:"timestamp"`
	Hostname      string                 `json:"hostname"`
	UptimeSeconds uint64                 `json:"uptimeSeconds"`
	OS            OSEntry                `json:"os"`
	CPU           CPUInfo                `json:"cpu"`
	Memory        MemoryInfo             `json:"memory"`
	Disk          map[string]any         `json:"disk"`
	SmartRaw      string                 `json:"smartRaw,omitempty"`
	Network       map[string]any         `json:"network"`
	Docker        []map[string]any       `json:"docker"`
}

var busy int32

func getenvBool(name string, def bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if v == "" {
		return def
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func getenvInt(name string, def int) int {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func buildConfig() Config {
	hostname, _ := os.Hostname()
	base := strings.TrimSpace(os.Getenv("PULSE_API_BASE_URL"))
	if base == "" {
		base = "http://localhost:3001"
	}
	return Config{
		APIBaseURL:     strings.TrimRight(base, "/"),
		APIToken:       strings.TrimSpace(os.Getenv("PULSE_API_TOKEN")),
		Interval:       time.Duration(getenvInt("PULSE_INTERVAL_MS", 300000)) * time.Millisecond,
		LogPayload:     getenvBool("PULSE_LOG_PAYLOAD", false),
		AgentID:        firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_AGENT_ID")), hostname),
		AgentVersion:   firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_AGENT_VERSION")), "v2.0.0-go"),
		RequestTimeout: time.Duration(getenvInt("PULSE_HTTP_TIMEOUT_MS", 10000)) * time.Millisecond,
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func safeExec(cmd string) string {
	var c *exec.Cmd
	if runtime.GOOS == "windows" {
		c = exec.Command("cmd", "/C", cmd)
	} else {
		c = exec.Command("sh", "-c", cmd)
	}
	out, err := c.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func detectOS() OSEntry {
	p := runtime.GOOS
	distro := p
	version := "unknown"

	switch p {
	case "linux":
		distro = "Linux"
		if raw, err := os.ReadFile("/etc/os-release"); err == nil {
			text := string(raw)
			if name := findOSReleaseValue(text, "NAME"); name != "" {
				distro = name
			}
			if v := findOSReleaseValue(text, "VERSION"); v != "" {
				version = v
			}
		}
	case "darwin":
		distro = "macOS"
		version = firstNonEmpty(safeExec("sw_vers -productVersion"), "unknown")
	case "aix":
		distro = "AIX"
		version = firstNonEmpty(safeExec("oslevel"), "unknown")
	case "windows":
		distro = "Windows"
		version = firstNonEmpty(safeExec("ver"), "unknown")
	default:
		distro = strings.ToUpper(p)
	}

	return OSEntry{Platform: p, Distro: distro, Version: version}
}

func findOSReleaseValue(content, key string) string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, key+"=") {
			v := strings.TrimPrefix(line, key+"=")
			v = strings.Trim(v, "\"")
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func cpuUsagePercent() float64 {
	if runtime.GOOS == "linux" {
		aTotal, aIdle, err := readLinuxCPUStat()
		if err != nil {
			return 0
		}
		time.Sleep(250 * time.Millisecond)
		bTotal, bIdle, err := readLinuxCPUStat()
		if err != nil {
			return 0
		}
		totalDelta := bTotal - aTotal
		idleDelta := bIdle - aIdle
		if totalDelta <= 0 {
			return 0
		}
		usage := 100 * (1 - float64(idleDelta)/float64(totalDelta))
		return round2(usage)
	}
	if runtime.GOOS == "darwin" {
		if v := parseTopCPU(safeExec("top -l 1 -n 0 | grep 'CPU usage'")); v >= 0 {
			return round2(v)
		}
	}
	if runtime.GOOS == "windows" {
		out := safeExec("wmic cpu get loadpercentage /value")
		for _, line := range strings.Split(out, "\n") {
			if strings.Contains(strings.ToLower(line), "loadpercentage") {
				parts := strings.Split(line, "=")
				if len(parts) == 2 {
					if n, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64); err == nil {
						return round2(n)
					}
				}
			}
		}
	}
	if runtime.GOOS == "aix" {
		if v := parseAIXCPU(safeExec("vmstat 1 2 | tail -1")); v >= 0 {
			return round2(v)
		}
	}
	return 0
}

func parseTopCPU(line string) float64 {
	if line == "" {
		return -1
	}
	// Example: CPU usage: 10.43% user, 9.95% sys, 79.60% idle
	idx := strings.Index(strings.ToLower(line), "idle")
	if idx == -1 {
		return -1
	}
	idlePct := findLastPercentBefore(line[:idx])
	if idlePct < 0 {
		return -1
	}
	return 100 - idlePct
}

func parseAIXCPU(line string) float64 {
	parts := strings.Fields(strings.TrimSpace(line))
	if len(parts) < 2 {
		return -1
	}
	idleStr := parts[len(parts)-1]
	idle, err := strconv.ParseFloat(idleStr, 64)
	if err != nil {
		return -1
	}
	return 100 - idle
}

func findLastPercentBefore(s string) float64 {
	fields := strings.Fields(s)
	for i := len(fields) - 1; i >= 0; i-- {
		f := strings.TrimSuffix(fields[i], "%")
		if n, err := strconv.ParseFloat(strings.TrimSpace(f), 64); err == nil {
			return n
		}
	}
	return -1
}

func readLinuxCPUStat() (total, idle uint64, err error) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "cpu ") {
			parts := strings.Fields(line)
			if len(parts) < 5 {
				return 0, 0, errors.New("unexpected /proc/stat format")
			}
			var vals []uint64
			for _, p := range parts[1:] {
				n, convErr := strconv.ParseUint(p, 10, 64)
				if convErr != nil {
					return 0, 0, convErr
				}
				vals = append(vals, n)
				total += n
			}
			idle = vals[3]
			if len(vals) > 4 {
				idle += vals[4]
			}
			return total, idle, nil
		}
	}
	return 0, 0, errors.New("cpu line not found")
}

func cpuTemperatureC() *float64 {
	if runtime.GOOS != "linux" {
		return nil
	}
	raw, err := os.ReadFile("/sys/class/thermal/thermal_zone0/temp")
	if err != nil {
		return nil
	}
	v, err := strconv.ParseFloat(strings.TrimSpace(string(raw)), 64)
	if err != nil {
		return nil
	}
	t := round2(v / 1000)
	return &t
}

func physicalCPUCores() int {
	if runtime.GOOS == "darwin" {
		out := safeExec("sysctl -n hw.physicalcpu")
		if n, err := strconv.Atoi(strings.TrimSpace(out)); err == nil {
			return n
		}
	}
	if runtime.GOOS == "linux" {
		out := safeExec("lscpu -p=Core,Socket | grep -v '^#' | sort -u | wc -l")
		if n, err := strconv.Atoi(strings.TrimSpace(out)); err == nil {
			return n
		}
	}
	if n := runtime.NumCPU(); n > 0 {
		return n
	}
	return 0
}

func cpuFrequencyMHz() int {
	if runtime.GOOS == "linux" {
		out := safeExec("lscpu | awk -F: '/CPU MHz/{print $2; exit}'")
		if n, err := strconv.ParseFloat(strings.TrimSpace(out), 64); err == nil {
			return int(n)
		}
	}
	if runtime.GOOS == "darwin" {
		out := safeExec("sysctl -n hw.cpufrequency")
		if hz, err := strconv.ParseFloat(strings.TrimSpace(out), 64); err == nil && hz > 0 {
			return int(hz / 1000000)
		}
	}
	if runtime.GOOS == "windows" {
		out := safeExec("wmic cpu get MaxClockSpeed /value")
		for _, line := range strings.Split(out, "\n") {
			if strings.Contains(strings.ToLower(line), "maxclockspeed") {
				parts := strings.Split(line, "=")
				if len(parts) == 2 {
					if n, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
						return n
					}
				}
			}
		}
	}
	return 0
}

func readLoadAvg() []float64 {
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" || runtime.GOOS == "aix" {
		if raw := safeExec("uptime"); raw != "" {
			idx := strings.Index(raw, "load average")
			if idx >= 0 {
				tail := raw[idx:]
				tail = strings.ReplaceAll(tail, "load averages:", "")
				tail = strings.ReplaceAll(tail, "load average:", "")
				toks := strings.Split(tail, ",")
				vals := make([]float64, 0, 3)
				for _, t := range toks {
					t = strings.TrimSpace(t)
					f, err := strconv.ParseFloat(strings.Fields(t)[0], 64)
					if err == nil {
						vals = append(vals, round2(f))
					}
					if len(vals) == 3 {
						break
					}
				}
				if len(vals) == 3 {
					return vals
				}
			}
		}
	}
	return []float64{0, 0, 0}
}

func memoryInfo() MemoryInfo {
	total, free := readMemBytes()
	used := uint64(0)
	if total > free {
		used = total - free
	}
	usedPct := 0.0
	if total > 0 {
		usedPct = round2((float64(used) / float64(total)) * 100)
	}
	return MemoryInfo{Total: total, Free: free, Used: used, UsedPct: usedPct, Swap: swapInfo()}
}

func readMemBytes() (total, free uint64) {
	if runtime.GOOS == "linux" {
		data, err := os.ReadFile("/proc/meminfo")
		if err == nil {
			var totalKB, freeKB uint64
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(line, "MemTotal:") {
					totalKB = parseMemInfoKB(line)
				}
				if strings.HasPrefix(line, "MemAvailable:") {
					freeKB = parseMemInfoKB(line)
				}
			}
			if totalKB > 0 {
				return totalKB * 1024, freeKB * 1024
			}
		}
	}
	if runtime.GOOS == "darwin" {
		out := safeExec("sysctl -n hw.memsize")
		total64, _ := strconv.ParseUint(strings.TrimSpace(out), 10, 64)
		pageSizeOut := safeExec("sysctl -n hw.pagesize")
		ps, _ := strconv.ParseUint(strings.TrimSpace(pageSizeOut), 10, 64)
		freePagesOut := safeExec("vm_stat | awk '/Pages free/ {print $3}' | tr -d '.'")
		fp, _ := strconv.ParseUint(strings.TrimSpace(freePagesOut), 10, 64)
		if ps == 0 {
			ps = 4096
		}
		return total64, fp * ps
	}
	if runtime.GOOS == "windows" {
		out := safeExec("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value")
		var totalKB, freeKB uint64
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "TotalVisibleMemorySize=") {
				totalKB, _ = strconv.ParseUint(strings.TrimPrefix(line, "TotalVisibleMemorySize="), 10, 64)
			}
			if strings.HasPrefix(line, "FreePhysicalMemory=") {
				freeKB, _ = strconv.ParseUint(strings.TrimPrefix(line, "FreePhysicalMemory="), 10, 64)
			}
		}
		return totalKB * 1024, freeKB * 1024
	}
	return 0, 0
}

func parseMemInfoKB(line string) uint64 {
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return 0
	}
	n, _ := strconv.ParseUint(parts[1], 10, 64)
	return n
}

func swapInfo() SwapInfo {
	if runtime.GOOS == "linux" {
		data, err := os.ReadFile("/proc/meminfo")
		if err == nil {
			totalKB := findMemInfoKB(data, "SwapTotal:")
			freeKB := findMemInfoKB(data, "SwapFree:")
			total := totalKB * 1024
			free := freeKB * 1024
			used := uint64(0)
			if total > free {
				used = total - free
			}
			usedPct := 0.0
			if total > 0 {
				usedPct = round2((float64(used) / float64(total)) * 100)
			}
			return SwapInfo{Total: total, Free: free, Used: used, UsedPct: usedPct}
		}
	}
	if runtime.GOOS == "darwin" {
		out := safeExec("sysctl vm.swapusage")
		if out != "" {
			total := parseMToBytes(out, "total")
			used := parseMToBytes(out, "used")
			free := parseMToBytes(out, "free")
			usedPct := 0.0
			if total > 0 {
				usedPct = round2((float64(used) / float64(total)) * 100)
			}
			return SwapInfo{Total: total, Free: free, Used: used, UsedPct: usedPct}
		}
	}
	return SwapInfo{}
}

func findMemInfoKB(data []byte, key string) uint64 {
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, key) {
			return parseMemInfoKB(line)
		}
	}
	return 0
}

func parseMToBytes(raw, key string) uint64 {
	idx := strings.Index(strings.ToLower(raw), strings.ToLower(key))
	if idx == -1 {
		return 0
	}
	part := raw[idx:]
	start := strings.Index(part, "=")
	end := strings.Index(strings.ToUpper(part), "M")
	if start == -1 || end == -1 || end <= start+1 {
		return 0
	}
	v := strings.TrimSpace(part[start+1 : end])
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0
	}
	return uint64(n * 1024 * 1024)
}

func diskUsage() []DiskUsageRow {
	out := safeExec("df -kP")
	if out == "" {
		return []DiskUsageRow{}
	}
	lines := strings.Split(out, "\n")
	if len(lines) <= 1 {
		return []DiskUsageRow{}
	}
	rows := make([]DiskUsageRow, 0, len(lines)-1)
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 6 {
			continue
		}
		sizeKB, _ := strconv.ParseUint(parts[1], 10, 64)
		usedKB, _ := strconv.ParseUint(parts[2], 10, 64)
		availKB, _ := strconv.ParseUint(parts[3], 10, 64)
		rows = append(rows, DiskUsageRow{
			Filesystem: parts[0],
			SizeBytes:  sizeKB * 1024,
			UsedBytes:  usedKB * 1024,
			AvailBytes: availKB * 1024,
			UsedPct:    parts[4],
			Mountpoint: strings.Join(parts[5:], " "),
		})
	}
	return rows
}

func inodeUsage() []InodeUsageRow {
	out := safeExec("df -iP")
	if out == "" {
		return []InodeUsageRow{}
	}
	lines := strings.Split(out, "\n")
	if len(lines) <= 1 {
		return []InodeUsageRow{}
	}
	rows := make([]InodeUsageRow, 0, len(lines)-1)
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 6 {
			continue
		}
		inodes, _ := strconv.ParseUint(parts[1], 10, 64)
		iused, _ := strconv.ParseUint(parts[2], 10, 64)
		ifree, _ := strconv.ParseUint(parts[3], 10, 64)
		rows = append(rows, InodeUsageRow{
			Filesystem: parts[0],
			Inodes:     inodes,
			Used:       iused,
			Free:       ifree,
			UsedPct:    parts[4],
			Mountpoint: strings.Join(parts[5:], " "),
		})
	}
	return rows
}

func diskIoRaw() string {
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" || runtime.GOOS == "aix" {
		return safeExec("iostat -d 1 2")
	}
	if runtime.GOOS == "windows" {
		return safeExec("wmic diskdrive get Name,Model,Status")
	}
	return ""
}

func smartRaw() string {
	if runtime.GOOS != "linux" {
		return ""
	}
	return safeExec("smartctl -H /dev/sda")
}

func dockerStats() []map[string]any {
	out := safeExec("docker stats --no-stream --format '{{json .}}'")
	if out == "" {
		return []map[string]any{}
	}
	rows := make([]map[string]any, 0)
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		m := map[string]any{}
		if err := json.Unmarshal([]byte(line), &m); err == nil {
			rows = append(rows, m)
		} else {
			rows = append(rows, map[string]any{"raw": line})
		}
	}
	return rows
}

func networkInfo() map[string]any {
	result := map[string]any{}
	ifaces, err := netInterfaces()
	if err != nil {
		return result
	}
	for _, iface := range ifaces {
		ips := make([]string, 0, len(iface.Addrs))
		for _, a := range iface.Addrs {
			ips = append(ips, a)
		}
		result[iface.Name] = map[string]any{
			"up":        iface.Up,
			"loopback":  iface.Loopback,
			"multicast": iface.Multicast,
			"mtu":       iface.MTU,
			"addrs":     ips,
		}
	}
	return result
}

type ifaceInfo struct {
	Name      string
	MTU       int
	Up        bool
	Loopback  bool
	Multicast bool
	Addrs     []string
}

func netInterfaces() ([]ifaceInfo, error) {
	if runtime.GOOS == "windows" {
		// Minimal Windows fallback. Keeps schema stable.
		host := safeExec("hostname")
		return []ifaceInfo{{Name: "primary", MTU: 0, Up: true, Loopback: false, Multicast: true, Addrs: []string{host}}}, nil
	}
	out := safeExec("ifconfig -a")
	if out == "" && runtime.GOOS == "linux" {
		out = safeExec("ip -j address")
		if out != "" {
			var parsed []map[string]any
			if err := json.Unmarshal([]byte(out), &parsed); err == nil {
				all := make([]ifaceInfo, 0, len(parsed))
				for _, p := range parsed {
					name, _ := p["ifname"].(string)
					mtu, _ := p["mtu"].(float64)
					flags, _ := p["flags"].([]any)
					up := false
					for _, f := range flags {
						if strings.EqualFold(fmt.Sprint(f), "UP") {
							up = true
						}
					}
					addrs := []string{}
					if addrInfo, ok := p["addr_info"].([]any); ok {
						for _, ai := range addrInfo {
							if m, ok := ai.(map[string]any); ok {
								if local, ok := m["local"].(string); ok {
									addrs = append(addrs, local)
								}
							}
						}
					}
					all = append(all, ifaceInfo{Name: name, MTU: int(mtu), Up: up, Loopback: strings.Contains(name, "lo"), Multicast: true, Addrs: addrs})
				}
				return all, nil
			}
		}
	}

	if out == "" {
		return nil, errors.New("no interface command output")
	}
	chunks := splitIfconfigBlocks(out)
	all := make([]ifaceInfo, 0, len(chunks))
	for _, c := range chunks {
		lines := strings.Split(strings.TrimSpace(c), "\n")
		if len(lines) == 0 {
			continue
		}
		head := lines[0]
		name := strings.TrimSuffix(strings.Fields(head)[0], ":")
		mtu := 0
		if idx := strings.Index(head, "mtu "); idx >= 0 {
			mtuPart := strings.Fields(head[idx+4:])
			if len(mtuPart) > 0 {
				mtu, _ = strconv.Atoi(mtuPart[0])
			}
		}
		up := strings.Contains(strings.ToUpper(head), "UP")
		loopback := strings.Contains(strings.ToUpper(head), "LOOPBACK") || strings.HasPrefix(name, "lo")
		multicast := strings.Contains(strings.ToUpper(head), "MULTICAST")
		addrs := []string{}
		for _, line := range lines[1:] {
			f := strings.Fields(strings.TrimSpace(line))
			if len(f) >= 2 && (f[0] == "inet" || f[0] == "inet6") {
				addrs = append(addrs, f[1])
			}
		}
		all = append(all, ifaceInfo{Name: name, MTU: mtu, Up: up, Loopback: loopback, Multicast: multicast, Addrs: addrs})
	}
	return all, nil
}

func splitIfconfigBlocks(out string) []string {
	lines := strings.Split(out, "\n")
	blocks := []string{}
	current := []string{}
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if !strings.HasPrefix(line, "\t") && !strings.HasPrefix(line, " ") && len(current) > 0 {
			blocks = append(blocks, strings.Join(current, "\n"))
			current = []string{line}
			continue
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		blocks = append(blocks, strings.Join(current, "\n"))
	}
	return blocks
}

func collectPayload() Payload {
	osInfo := detectOS()
	hostname, _ := os.Hostname()
	cpuCores := runtime.NumCPU()
	physical := physicalCPUCores()
	if physical <= 0 {
		physical = cpuCores
	}

	uptimeSec := uint64(0)
	if runtime.GOOS == "linux" {
		if data, err := os.ReadFile("/proc/uptime"); err == nil {
			parts := strings.Fields(string(data))
			if len(parts) > 0 {
				if f, err := strconv.ParseFloat(parts[0], 64); err == nil {
					uptimeSec = uint64(f)
				}
			}
		}
	}

	timestamp := time.Now().UTC().Format(time.RFC3339)
	return Payload{
		Timestamp:     timestamp,
		Hostname:      hostname,
		UptimeSeconds: uptimeSec,
		OS:            osInfo,
		CPU: CPUInfo{
			UsagePct:      cpuUsagePercent(),
			Load:          readLoadAvg(),
			Cores:         cpuCores,
			LogicalCores:  cpuCores,
			PhysicalCores: physical,
			FrequencyMHz:  cpuFrequencyMHz(),
			TemperatureC:  cpuTemperatureC(),
		},
		Memory: memoryInfo(),
		Disk: map[string]any{
			"usage": diskUsage(),
			"inode": inodeUsage(),
			"ioRaw": diskIoRaw(),
		},
		SmartRaw: smartRaw(),
		Network:  networkInfo(),
		Docker:   dockerStats(),
	}
}

func postJSON(cfg Config, path string, body any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	endpoint := cfg.APIBaseURL + path
	if _, err := url.Parse(endpoint); err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIToken != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIToken)
	}
	client := &http.Client{Timeout: cfg.RequestTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s returned %d: %s", path, resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func sendHeartbeat(cfg Config, payload Payload) error {
	body := map[string]any{
		"agentId":       cfg.AgentID,
		"hostname":      payload.Hostname,
		"os":            payload.OS.Distro,
		"osVersion":     payload.OS.Version,
		"agentVersion":  cfg.AgentVersion,
		"status":        "Actively Syncing",
		"lastHeartbeatAt": time.Now().UTC().Format(time.RFC3339),
	}
	return postJSON(cfg, "/api/agents/heartbeat", body)
}

func sendMetrics(cfg Config, payload Payload) error {
	body := map[string]any{
		"agentId":   cfg.AgentID,
		"hostname":  payload.Hostname,
		"platform":  payload.OS.Platform,
		"distro":    payload.OS.Distro,
		"osVersion": payload.OS.Version,
		"payload":   payload,
		"timestamp": payload.Timestamp,
	}
	return postJSON(cfg, "/api/agents/metrics", body)
}

func runCapture(cfg Config) {
	if !atomic.CompareAndSwapInt32(&busy, 0, 1) {
		fmt.Println("[capture-agent] Previous run still in progress. Skipping this cycle.")
		return
	}
	defer atomic.StoreInt32(&busy, 0)

	payload := collectPayload()
	if err := sendHeartbeat(cfg, payload); err != nil {
		fmt.Printf("[capture-agent] Heartbeat failed: %v\n", err)
	}
	if err := sendMetrics(cfg, payload); err != nil {
		fmt.Printf("[capture-agent] Metrics upload failed: %v\n", err)
		return
	}

	if cfg.LogPayload {
		if out, err := json.MarshalIndent(payload, "", "  "); err == nil {
			fmt.Println(string(out))
		}
	}
	fmt.Printf("[capture-agent] Uploaded snapshot at %s\n", payload.Timestamp)
}

func main() {
	cfg := buildConfig()
	fmt.Printf("[capture-agent] Started for agent %s. Interval %ds. API %s\n", cfg.AgentID, int(cfg.Interval.Seconds()), cfg.APIBaseURL)

	runCapture(cfg)
	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()

	for range ticker.C {
		runCapture(cfg)
	}
}

func round2(v float64) float64 {
	return mathRound(v*100) / 100
}

func mathRound(v float64) float64 {
	if v < 0 {
		return float64(int64(v - 0.5))
	}
	return float64(int64(v + 0.5))
}
