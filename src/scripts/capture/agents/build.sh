#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GO_BIN="${GO_BIN:-/usr/local/go/bin/go}"
if [[ ! -x "$GO_BIN" ]]; then
  if command -v go >/dev/null 2>&1; then
    GO_BIN="$(command -v go)"
  else
    echo "Go binary not found. Set GO_BIN or install Go." >&2
    exit 1
  fi
fi

echo "Using Go: $GO_BIN"

build_target() {
  local goos="$1"
  local goarch="$2"
  local out="$3"
  echo "Building ${out} (${goos}/${goarch})"
  CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" "$GO_BIN" build -trimpath -ldflags="-s -w" -o "$out" ./
}

rm -f MacOSCapture WindowsCapture.exe RHELCapture DebianCapture UbuntuCapture GeneralUnixLinuxCapture AIXCapture HPUXCapture.UNSUPPORTED

build_target darwin amd64 MacOSCapture
build_target windows amd64 WindowsCapture.exe
build_target linux amd64 GeneralUnixLinuxCapture
cp GeneralUnixLinuxCapture RHELCapture
cp GeneralUnixLinuxCapture DebianCapture
cp GeneralUnixLinuxCapture UbuntuCapture

# AIX is supported by Go for ppc64.
build_target aix ppc64 AIXCapture

cat > HPUXCapture.UNSUPPORTED <<'EOF'
HPUX is currently not supported by the Go toolchain for cross-compilation.
Use a native HP-UX toolchain/runtime approach or a C/C++ based agent for HP-UX.
EOF

echo "Done. Binaries generated in: $SCRIPT_DIR"
