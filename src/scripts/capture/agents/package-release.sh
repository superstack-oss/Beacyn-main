#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="${1:-${PULSE_RELEASE_VERSION:-v2.0.0}}"
OUT_DIR="${SCRIPT_DIR}/releases/${VERSION}"
DOWNLOAD_BASE_URL="${PULSE_RELEASE_BASE_URL:-}"

FILES=(
  "MacOSCapture"
  "WindowsCapture.exe"
  "RHELCapture"
  "DebianCapture"
  "UbuntuCapture"
  "GeneralUnixLinuxCapture"
  "AIXCapture"
  "install-agent.sh"
  "HPUXCapture.UNSUPPORTED"
)

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd shasum
need_cmd python3

mkdir -p "$OUT_DIR"

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "Required file missing: $f" >&2
    exit 1
  fi
  cp "$f" "$OUT_DIR/"
done

(
  cd "$OUT_DIR"
  shasum -a 256 "${FILES[@]}" > SHA256SUMS
)

python3 - "$OUT_DIR" "$VERSION" "$DOWNLOAD_BASE_URL" <<'PY'
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

out_dir, version, base_url = sys.argv[1], sys.argv[2], sys.argv[3].rstrip('/')

meta = {
    "MacOSCapture": {"targetOS": "darwin", "targetArch": "amd64", "distro": "macOS"},
    "WindowsCapture.exe": {"targetOS": "windows", "targetArch": "amd64", "distro": "windows"},
    "RHELCapture": {"targetOS": "linux", "targetArch": "amd64", "distro": "rhel-family"},
    "DebianCapture": {"targetOS": "linux", "targetArch": "amd64", "distro": "debian"},
    "UbuntuCapture": {"targetOS": "linux", "targetArch": "amd64", "distro": "ubuntu"},
    "GeneralUnixLinuxCapture": {"targetOS": "linux", "targetArch": "amd64", "distro": "generic"},
    "AIXCapture": {"targetOS": "aix", "targetArch": "ppc64", "distro": "aix"},
    "install-agent.sh": {"targetOS": "installer", "targetArch": "any", "distro": "all"},
    "HPUXCapture.UNSUPPORTED": {"targetOS": "hpux", "targetArch": "n/a", "distro": "hpux"},
}

files = []
for name, m in meta.items():
    path = os.path.join(out_dir, name)
    if not os.path.isfile(path):
        continue
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    entry = {
        "name": name,
        "size": os.path.getsize(path),
        "sha256": h.hexdigest(),
        "targetOS": m["targetOS"],
        "targetArch": m["targetArch"],
        "distro": m["distro"],
    }
    if base_url:
        entry["url"] = f"{base_url}/{version}/{name}"
    files.append(entry)

manifest = {
    "version": version,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "downloadBaseURL": f"{base_url}/{version}" if base_url else "",
    "files": files,
}

with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PY

echo "Release packaged at: $OUT_DIR"
echo "Artifacts:"
ls -1 "$OUT_DIR"
