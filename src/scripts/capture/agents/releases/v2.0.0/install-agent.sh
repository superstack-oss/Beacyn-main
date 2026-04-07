#!/usr/bin/env bash
set -euo pipefail

# PulseIQ Capture Agent installer
# - Detects OS/distribution and architecture
# - Selects and installs the correct binary
# - Creates secure API-based config (no DB creds)
# - Registers and starts systemd service on Linux

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVICE_NAME="${PULSE_SERVICE_NAME:-pulseiq-capture-agent}"
RUN_USER="${PULSE_RUN_USER:-pulseiq-agent}"
INSTALL_DIR="${PULSE_INSTALL_DIR:-/opt/pulseiq/agent}"
BIN_PATH="${INSTALL_DIR}/pulseiq-capture-agent"
CONFIG_DIR="${PULSE_CONFIG_DIR:-/etc/pulseiq}"
CONFIG_FILE="${CONFIG_DIR}/agent.env"
LOG_DIR="${PULSE_LOG_DIR:-/var/log/pulseiq}"

API_BASE_URL="${PULSE_API_BASE_URL:-}"
API_TOKEN="${PULSE_API_TOKEN:-}"
AGENT_ID="${PULSE_AGENT_ID:-$(hostname)}"
INTERVAL_MS="${PULSE_INTERVAL_MS:-300000}"
HTTP_TIMEOUT_MS="${PULSE_HTTP_TIMEOUT_MS:-10000}"
AGENT_VERSION="${PULSE_AGENT_VERSION:-v2.0.0-go}"

DOWNLOAD_BASE_URL="${PULSE_AGENT_DOWNLOAD_BASE_URL:-}"
DOWNLOAD_URL="${PULSE_AGENT_DOWNLOAD_URL:-}"
EXPECTED_SHA256="${PULSE_AGENT_SHA256:-}"
MANIFEST_URL="${PULSE_AGENT_MANIFEST_URL:-}"
MANIFEST_PATH="${PULSE_AGENT_MANIFEST_PATH:-}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root (or with sudo)." >&2
    exit 1
  fi
}

detect_platform() {
  OS_RAW="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH_RAW="$(uname -m | tr '[:upper:]' '[:lower:]')"

  case "${OS_RAW}" in
    linux*) TARGET_OS="linux" ;;
    darwin*) TARGET_OS="darwin" ;;
    aix*) TARGET_OS="aix" ;;
    hp-ux*|hpux*) TARGET_OS="hpux" ;;
    *) TARGET_OS="unknown" ;;
  esac

  case "${ARCH_RAW}" in
    x86_64|amd64) TARGET_ARCH="amd64" ;;
    aarch64|arm64) TARGET_ARCH="arm64" ;;
    ppc64|ppc64le) TARGET_ARCH="ppc64" ;;
    *) TARGET_ARCH="${ARCH_RAW}" ;;
  esac

  DISTRO_ID=""
  DISTRO_LIKE=""
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID:-}"
    DISTRO_LIKE="${ID_LIKE:-}"
  fi
}

select_binary_name() {
  case "${TARGET_OS}" in
    darwin)
      BINARY_NAME="MacOSCapture"
      ;;
    aix)
      BINARY_NAME="AIXCapture"
      ;;
    hpux)
      echo "HP-UX is currently unsupported by Go cross-compilation in this project." >&2
      exit 1
      ;;
    linux)
      local key="${DISTRO_ID} ${DISTRO_LIKE}"
      case "${key}" in
        *ubuntu*) BINARY_NAME="UbuntuCapture" ;;
        *debian*) BINARY_NAME="DebianCapture" ;;
        *rhel*|*centos*|*rocky*|*almalinux*|*fedora*) BINARY_NAME="RHELCapture" ;;
        *) BINARY_NAME="GeneralUnixLinuxCapture" ;;
      esac
      ;;
    *)
      echo "Unsupported OS: ${TARGET_OS}" >&2
      exit 1
      ;;
  esac
}

fetch_binary() {
  mkdir -p "${INSTALL_DIR}"
  TMP_BIN="$(mktemp -t pulseiq-agent.XXXXXX)"

  if [[ -n "${DOWNLOAD_URL}" ]]; then
    echo "Downloading agent from ${DOWNLOAD_URL}"
    need_cmd curl
    curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_BIN}"
  elif [[ -n "${DOWNLOAD_BASE_URL}" ]]; then
    local url="${DOWNLOAD_BASE_URL%/}/${BINARY_NAME}"
    echo "Downloading agent from ${url}"
    need_cmd curl
    curl -fsSL "${url}" -o "${TMP_BIN}"
  elif [[ -f "${SCRIPT_DIR}/${BINARY_NAME}" ]]; then
    echo "Using local bundled binary: ${SCRIPT_DIR}/${BINARY_NAME}"
    cp "${SCRIPT_DIR}/${BINARY_NAME}" "${TMP_BIN}"
  else
    echo "Binary not found locally and no download URL provided." >&2
    echo "Set PULSE_AGENT_DOWNLOAD_BASE_URL or PULSE_AGENT_DOWNLOAD_URL." >&2
    exit 1
  fi

  if [[ -n "${EXPECTED_SHA256}" ]]; then
    need_cmd shasum
    local got
    got="$(shasum -a 256 "${TMP_BIN}" | awk '{print $1}')"
    if [[ "${got}" != "${EXPECTED_SHA256}" ]]; then
      echo "SHA256 mismatch. expected=${EXPECTED_SHA256} got=${got}" >&2
      exit 1
    fi
  fi

  install -m 0755 "${TMP_BIN}" "${BIN_PATH}"
  rm -f "${TMP_BIN}"
}

resolve_from_manifest() {
  if [[ -z "${MANIFEST_URL}" && -z "${MANIFEST_PATH}" ]]; then
    return 0
  fi

  need_cmd python3

  local manifest_json
  if [[ -n "${MANIFEST_PATH}" ]]; then
    if [[ ! -f "${MANIFEST_PATH}" ]]; then
      echo "Manifest file not found: ${MANIFEST_PATH}" >&2
      exit 1
    fi
    manifest_json="$(cat "${MANIFEST_PATH}")"
  else
    need_cmd curl
    manifest_json="$(curl -fsSL "${MANIFEST_URL}")"
  fi

  local parse_result
  parse_result="$(MANIFEST_JSON="${manifest_json}" python3 - "${BINARY_NAME}" <<'PY'
import json
import os
import sys

binary_name = sys.argv[1]
data = json.loads(os.environ.get("MANIFEST_JSON", "{}"))
files = data.get("files") or []
base = (data.get("downloadBaseURL") or "").rstrip("/")

target = None
for f in files:
    if str(f.get("name", "")) == binary_name:
        target = f
        break

if target is None:
    print("\n")
    sys.exit(0)

url = target.get("url") or ""
if not url and base:
    url = f"{base}/{binary_name}"

sha = target.get("sha256") or ""
print(url)
print(sha)
PY
)"

  local resolved_url resolved_sha
  resolved_url="$(printf '%s' "${parse_result}" | sed -n '1p')"
  resolved_sha="$(printf '%s' "${parse_result}" | sed -n '2p')"

  if [[ -z "${DOWNLOAD_URL}" && -n "${resolved_url}" ]]; then
    DOWNLOAD_URL="${resolved_url}"
  fi
  if [[ -z "${EXPECTED_SHA256}" && -n "${resolved_sha}" ]]; then
    EXPECTED_SHA256="${resolved_sha}"
  fi
}

write_config() {
  if [[ -z "${API_BASE_URL}" ]]; then
    echo "PULSE_API_BASE_URL is required." >&2
    exit 1
  fi
  if [[ -z "${API_TOKEN}" ]]; then
    echo "PULSE_API_TOKEN is required." >&2
    exit 1
  fi

  mkdir -p "${CONFIG_DIR}" "${LOG_DIR}"

  cat > "${CONFIG_FILE}" <<EOF
PULSE_API_BASE_URL=${API_BASE_URL}
PULSE_API_TOKEN=${API_TOKEN}
PULSE_AGENT_ID=${AGENT_ID}
PULSE_INTERVAL_MS=${INTERVAL_MS}
PULSE_HTTP_TIMEOUT_MS=${HTTP_TIMEOUT_MS}
PULSE_AGENT_VERSION=${AGENT_VERSION}
EOF

  chown root:"${RUN_USER}" "${CONFIG_FILE}"
  chmod 0640 "${CONFIG_FILE}"
}

setup_linux_service() {
  need_cmd systemctl

  if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "${RUN_USER}" 2>/dev/null || \
    useradd -r -s /usr/bin/false "${RUN_USER}"
  fi

  chown -R root:root "${INSTALL_DIR}"
  chmod 0755 "${INSTALL_DIR}"

  chown -R "${RUN_USER}":"${RUN_USER}" "${LOG_DIR}"
  chmod 0755 "${LOG_DIR}"

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PulseIQ Capture Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
EnvironmentFile=${CONFIG_FILE}
ExecStart=${BIN_PATH}
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}"
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
}

print_non_linux_note() {
  echo "Installed ${BINARY_NAME} at ${BIN_PATH}."
  echo "Automatic background service setup in this installer is for Linux/systemd only."
  echo "For ${TARGET_OS}, register ${BIN_PATH} with native service manager and load ${CONFIG_FILE}."
}

main() {
  require_root
  detect_platform
  select_binary_name
  resolve_from_manifest

  echo "Detected: os=${TARGET_OS} arch=${TARGET_ARCH} distro=${DISTRO_ID:-unknown}"
  echo "Selected binary: ${BINARY_NAME}"

  if [[ "${TARGET_OS}" == "linux" && "${TARGET_ARCH}" != "amd64" ]]; then
    echo "Current bundle has Linux amd64 binaries. Detected arch=${TARGET_ARCH}." >&2
    echo "Build matching binary first, then set PULSE_AGENT_DOWNLOAD_URL." >&2
    exit 1
  fi

  if [[ "${TARGET_OS}" == "darwin" && "${TARGET_ARCH}" != "amd64" ]]; then
    echo "Current MacOSCapture is amd64. Detected arch=${TARGET_ARCH}." >&2
    echo "Build darwin/${TARGET_ARCH} binary and install via PULSE_AGENT_DOWNLOAD_URL." >&2
    exit 1
  fi

  if [[ "${TARGET_OS}" == "aix" && "${TARGET_ARCH}" != "ppc64" ]]; then
    echo "AIXCapture target is ppc64. Detected arch=${TARGET_ARCH}." >&2
    exit 1
  fi

  if [[ "${TARGET_OS}" == "linux" ]]; then
    if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
      useradd --system --no-create-home --shell /usr/sbin/nologin "${RUN_USER}" 2>/dev/null || \
      useradd -r -s /usr/bin/false "${RUN_USER}"
    fi
  fi

  fetch_binary
  write_config

  if [[ "${TARGET_OS}" == "linux" ]]; then
    setup_linux_service
    echo "PulseIQ agent installed and running as service: ${SERVICE_NAME}"
  else
    print_non_linux_note
  fi
}

main "$@"
