#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  install.sh  ·  Beacyn Platform Installer  ·  v2.0.1
# ═══════════════════════════════════════════════════════════════════════════════
#  Supported platforms: macOS 13+, Ubuntu 20.04+, Debian 11+, RHEL/CentOS 8+
#
#  Environment overrides (all optional):
#    BEACYN_REPO_URL   Git URL to clone from (default: GitHub main)
#    BEACYN_BRANCH     Branch to clone          (default: main)
#    BEACYN_INSTALL_DIR  Override install path
#    EULA_ACCEPTED=true  Skip interactive EULA prompt (CI/automated)
#    BEACYNCTL_AUTO_PATH=true  Auto-add beacynctl to PATH without prompt
#
#  Flags:
#    --no-auto-path    Disable PATH auto-update (overrides env var)
#    -h, --help        Show quick installer options
# ═══════════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail
IFS=$'\n\t'

NO_AUTO_PATH_FLAG=false
for arg in "$@"; do
  case "$arg" in
    --no-auto-path)
      NO_AUTO_PATH_FLAG=true
      ;;
    -h|--help)
      cat <<'HELP'
Beacyn install.sh options

Flags:
  --no-auto-path    Do not auto-add beacynctl to PATH
  -h, --help        Show this help

Environment overrides:
  BEACYN_REPO_URL
  BEACYN_BRANCH
  BEACYN_INSTALL_DIR
  EULA_ACCEPTED          Set to true to skip the EULA prompt
  BEACYN_ASSUME_YES      Set to true to accept default yes/no prompts
  BEACYN_DB_PASSWORD     Database password for non-interactive installs
  BEACYNCTL_AUTO_PATH

Non-interactive example:
  EULA_ACCEPTED=true BEACYN_ASSUME_YES=true BEACYN_DB_PASSWORD='secret' \\
    bash deployment/install.sh
HELP
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Run ./deployment/install.sh --help for supported flags." >&2
      exit 1
      ;;
  esac
done

# ─── Repository ────────────────────────────────────────────────────────────────
BEACYN_REPO_URL="${BEACYN_REPO_URL:-https://github.com/superstack-oss/Beacyn-main.git}"
BEACYN_BRANCH="${BEACYN_BRANCH:-main}"
BEACYN_VERSION="2.0.1"

# ─── Install directory ─────────────────────────────────────────────────────────
if [[ -n "${BEACYN_INSTALL_DIR:-}" ]]; then
  INSTALL_DIR="$BEACYN_INSTALL_DIR"
elif [[ $EUID -eq 0 ]]; then
  INSTALL_DIR="/opt/beacyn"
else
  INSTALL_DIR="$HOME/beacyn"
fi

# ─── Minimum versions ──────────────────────────────────────────────────────────
NODE_MIN_MAJOR=20
NODE_INSTALL_VERSION="20"       # LTS stream to install when missing

# ─── Ports (defaults — overridable in configuration step) ──────────────────────
DEFAULT_BACKEND_PORT=5145
DEFAULT_FRONTEND_PORT=7145
DEFAULT_DB_PORT=3306

# ─── ANSI colours (disabled when not a TTY or NO_COLOR is set) ─────────────────
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  RST=$'\e[0m';  BOLD=$'\e[1m';  DIM=$'\e[2m'
  GRN=$'\e[32m'; YEL=$'\e[33m'; CYN=$'\e[36m'
  BLU=$'\e[34m'; RED=$'\e[31m'; GRY=$'\e[90m'; WHT=$'\e[97m'
else
  RST=''; BOLD=''; DIM=''
  GRN=''; YEL=''; CYN=''
  BLU=''; RED=''; GRY=''; WHT=''
fi

# ─── Box helpers ───────────────────────────────────────────────────────────────
BW=76   # inner box width  (total line = BW + 4 = 80)
BC=72   # content width    (BW - 4)

_hline() { printf '═%.0s' $(seq 1 $BW); }
_sline() { printf '─%.0s' $(seq 1 $BW); }

box_top()   { echo "  ${GRY}╔$(_hline)╗${RST}"; }
box_btm()   { echo "  ${GRY}╚$(_hline)╝${RST}"; }
box_div()   { echo "  ${GRY}╠$(_hline)╣${RST}"; }
box_empty() { printf "  ${GRY}║%-${BW}s║${RST}\n" ""; }
box_row()   {
  local content="$1"
  # strip ANSI to measure visible length
  local visible; visible=$(echo -e "$content" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g')
  local pad=$(( BC - ${#visible} ))
  [[ $pad -lt 0 ]] && pad=0
  printf "  ${GRY}║${RST}  %s%-${pad}s  ${GRY}║${RST}\n" "$content" ""
}

sbox_top()  {
  local title="$1"
  local n=$(( 73 - ${#title} )); [[ $n -lt 1 ]] && n=1
  printf "  ${GRY}┌─ ${BOLD}${YEL}%s${RST}${GRY} " "$title"
  printf '─%.0s' $(seq 1 $n)
  printf "┐${RST}\n"
}
sbox_btm()   { echo "  ${GRY}└$(_sline)┘${RST}"; }
sbox_div()   {
  local title="${1:-}"
  if [[ -z "$title" ]]; then
    echo "  ${GRY}├$(_sline)┤${RST}"
  else
    local n=$(( 73 - ${#title} )); [[ $n -lt 1 ]] && n=1
    printf "  ${GRY}├─ ${YEL}%s${RST}${GRY} " "$title"
    printf '─%.0s' $(seq 1 $n)
    printf "┤${RST}\n"
  fi
}
sbox_empty() { printf "  ${GRY}│%-${BW}s│${RST}\n" ""; }
sbox_row()   {
  local content="$1"
  local visible; visible=$(echo -e "$content" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g')
  local pad=$(( BC - ${#visible} ))
  [[ $pad -lt 0 ]] && pad=0
  printf "  ${GRY}│${RST}  %s%-${pad}s  ${GRY}│${RST}\n" "$content" ""
}

# ─── Logging helpers ───────────────────────────────────────────────────────────
log_step()  { echo ""; echo "  ${CYN}${BOLD}◆${RST}  ${WHT}${BOLD}$*${RST}"; }
log_ok()    { echo "  ${GRN}✓${RST}  ${DIM}$*${RST}"; }
log_warn()  { echo "  ${YEL}⚠${RST}  ${YEL}$*${RST}"; }
log_error() { echo "  ${RED}✖${RST}  ${RED}$*${RST}"; }
log_info()  { echo "  ${GRY}·${RST}  ${DIM}$*${RST}"; }
log_sep()   { echo "  ${GRY}$(_sline)${RST}"; }
ln_blank()  { echo ""; }

# ─── Error handler ─────────────────────────────────────────────────────────────
_on_error() {
  local line="$1"
  ln_blank
  log_error "Installation failed at line ${line}."
  log_info  "Review the output above for details."
  ln_blank
  exit 1
}
trap '_on_error $LINENO' ERR

# ─── Utility: ask yes/no ───────────────────────────────────────────────────────
ask_yn() {
  # ask_yn "Question" [default: y|n]  → returns 0 for yes, 1 for no
  local prompt="$1"
  local default="${2:-y}"
  if [[ ! -r /dev/tty ]]; then
    if [[ "${BEACYN_ASSUME_YES:-}" == "true" ]]; then
      [[ "$default" == "y" ]]
      return
    fi
    log_error "No interactive terminal for: ${prompt}"
    log_info "Re-run in a terminal, or set EULA_ACCEPTED=true and BEACYN_ASSUME_YES=true."
    exit 1
  fi
  local hint
  [[ "$default" == "y" ]] && hint="${WHT}[Y/n]${RST}" || hint="${WHT}[y/N]${RST}"
  while true; do
    printf "  ${BOLD}${WHT}%s${RST}  ${GRY}%s${RST}  " "$prompt" "$hint" >/dev/tty
    read -r answer < /dev/tty
    answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]' | xargs)
    [[ -z "$answer" ]] && answer="$default"
    case "$answer" in
      y|yes) return 0 ;;
      n|no)  return 1 ;;
      *)     echo "  ${YEL}⚠${RST}  ${DIM}Please type ${WHT}y${RST}${DIM} or ${WHT}n${RST}${DIM} and press Enter.${RST}" ;;
    esac
  done
}

# ─── Utility: prompt with default ─────────────────────────────────────────────
ask_value() {
  # ask_value "Prompt" "default"  → echoes entered value (or default)
  local prompt="$1"
  local default="$2"
  local secret="${3:-}"   # pass "secret" to hide input
  local answer
  if [[ ! -r /dev/tty ]]; then
    if [[ "$secret" == "secret" && -n "${BEACYN_DB_PASSWORD+x}" ]]; then
      printf '%s' "$BEACYN_DB_PASSWORD"
      return
    fi
    printf '%s' "$default"
    return
  fi
  # Write prompt to /dev/tty so it is NOT captured by $(...) substitution
  printf "  ${BOLD}${WHT}%s${RST}  ${GRY}[%s]${RST}  " "$prompt" "$default" >/dev/tty
  if [[ "$secret" == "secret" ]]; then
    read -rs answer < /dev/tty
    printf "\n" >/dev/tty
  else
    read -r answer < /dev/tty
  fi
  # Trim leading/trailing whitespace without invoking a subshell
  answer="${answer#"${answer%%[! $'\t']*}"}"
  answer="${answer%"${answer##*[! $'\t']}"}"
  printf '%s' "${answer:-$default}"
}

valid_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  (( 10#$port >= 1 && 10#$port <= 65535 ))
}

env_dquote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/}"
  value="${value//$'\r'/}"
  printf '"%s"' "$value"
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\'/&apos;}"
  value="${value//\"/&quot;}"
  printf '%s' "$value"
}

# ─── Utility: check if port is free ───────────────────────────────────────────
port_free() {
  local port="$1"
  ! (lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null 2>&1 ||
     ss -tlnp 2>/dev/null | grep -q ":${port} " ||
     netstat -tlnp 2>/dev/null | grep -q ":${port} ")
}

# ─── Utility: command exists ───────────────────────────────────────────────────
has_cmd() { command -v "$1" &>/dev/null; }

# ─── Utility: OS detection ─────────────────────────────────────────────────────
detect_os() {
  OS_NAME="unknown"; OS_PKG="unknown"; OS_ARCH="$(uname -m)"

  case "$(uname -s)" in
    Darwin)
      OS_NAME="macos"
      OS_PKG="brew"
      OS_VERSION="$(sw_vers -productVersion 2>/dev/null || echo 'unknown')"
      ;;
    Linux)
      if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        case "${ID:-}" in
          ubuntu|debian)      OS_NAME="$ID"; OS_PKG="apt" ;;
          rhel|centos|rocky|almalinux|fedora)   OS_NAME="$ID"; OS_PKG="dnf" ;;
          *)                  OS_NAME="${ID:-linux}"; OS_PKG="unknown" ;;
        esac
        OS_VERSION="${VERSION_ID:-unknown}"
      fi
      ;;
    *)
      OS_NAME="$(uname -s)"; OS_VERSION="$(uname -r)"
      ;;
  esac
}

# ─── Utility: Node.js version check ───────────────────────────────────────────
node_major() {
  node --version 2>/dev/null | sed 's/v//' | cut -d. -f1
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 0 — System & architecture
# ═══════════════════════════════════════════════════════════════════════════════
detect_os

ln_blank
box_top
box_empty
box_row "${BOLD}${WHT}BEACYN${RST}  ${DIM}Enterprise Infrastructure Monitoring & Observability${RST}"
box_row "${DIM}Community Edition${RST}  ${CYN}v${BEACYN_VERSION}${RST}"
box_empty
box_div
box_empty
box_row "${GRY}Installer   ${RST}${DIM}Beacyn Platform Setup${RST}"
box_row "${GRY}Developer   ${RST}${DIM}Beacyn Labs by Atanu Kumar Paul${RST}"
box_row "${GRY}License     ${RST}${DIM}Lifetime Free Community${RST}"
box_empty
box_btm
ln_blank

# ─── System info ──────────────────────────────────────────────────────────────
log_step "System"
log_info "OS:           ${OS_NAME} ${OS_VERSION:-} (${OS_ARCH})"
log_info "Kernel:       $(uname -r 2>/dev/null || echo 'n/a')"
log_info "Shell:        ${SHELL:-unknown}"
log_info "User:         $(whoami)"

if [[ "$OS_NAME" == "unknown" ]]; then
  log_warn "Unrecognised operating system — some automated steps may be skipped."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Dependency requirements
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Dependency Requirements"

# ─── Node.js ──────────────────────────────────────────────────────────────────
NEED_NODE=false
if has_cmd node; then
  NODE_VER="$(node_major)"
  if [[ "$NODE_VER" -ge "$NODE_MIN_MAJOR" ]]; then
    log_ok "Node.js $(node --version) — meets minimum requirement (v${NODE_MIN_MAJOR}+)"
  else
    log_warn "Node.js $(node --version) found but v${NODE_MIN_MAJOR}+ is required."
    NEED_NODE=true
  fi
else
  log_warn "Node.js not found. v${NODE_MIN_MAJOR} LTS is required."
  NEED_NODE=true
fi

# ─── MySQL ────────────────────────────────────────────────────────────────────
NEED_MYSQL=false
if has_cmd mysql && has_cmd mysqladmin; then
  MYSQL_VER="$(mysql --version 2>/dev/null | awk '{print $3}' | tr -d ',' || echo 'unknown')"
  log_ok "MySQL ${MYSQL_VER} — found"
else
  log_warn "MySQL client / server not found."
  NEED_MYSQL=true
fi

# ─── git ──────────────────────────────────────────────────────────────────────
if has_cmd git; then
  log_ok "git $(git --version | awk '{print $3}') — found"
else
  log_warn "git not found — required to fetch Beacyn source."
  NEED_GIT=true
fi
NEED_GIT="${NEED_GIT:-false}"

ln_blank

# ─── Optional tools notice ────────────────────────────────────────────────────
log_step "Optional Tools (for public / private exposure)"
sbox_top "Recommended External Tools"
sbox_empty
sbox_row "${YEL}Cloudflare Tunnel${RST}  ${DIM}Zero-trust public access — no open inbound ports${RST}"
sbox_row "${GRY}Install:${RST}  ${CYN}https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/${RST}"
sbox_empty
sbox_row "${YEL}NGINX${RST}             ${DIM}Reverse proxy / TLS termination for self-hosted setups${RST}"
sbox_row "${GRY}Install:${RST}  ${CYN}https://nginx.org/en/docs/install.html${RST}"
sbox_empty
sbox_row "${YEL}ngrok${RST}             ${DIM}Quick temporary tunnels for development / demos${RST}"
sbox_row "${GRY}Install:${RST}  ${CYN}https://ngrok.com/download${RST}"
sbox_empty
sbox_row "${DIM}These tools are optional — Beacyn runs fully without them.${RST}"
sbox_empty
sbox_btm
ln_blank

# ─── Consent to install missing mandatory dependencies ────────────────────────
INSTALL_NODE=false
INSTALL_MYSQL=false
INSTALL_GIT=false

if [[ "$NEED_NODE" == "true" ]]; then
  if ask_yn "Node.js v${NODE_INSTALL_VERSION} LTS not found. Install it now?" "y"; then
    INSTALL_NODE=true
  else
    log_error "Node.js is mandatory. Aborting."
    exit 1
  fi
fi

if [[ "$NEED_MYSQL" == "true" ]]; then
  if ask_yn "MySQL not found. Install it now?" "y"; then
    INSTALL_MYSQL=true
  else
    log_error "MySQL is mandatory. Aborting."
    exit 1
  fi
fi

if [[ "$NEED_GIT" == "true" ]]; then
  if ask_yn "git not found. Install it now?" "y"; then
    INSTALL_GIT=true
  else
    log_error "git is required to fetch Beacyn source. Aborting."
    exit 1
  fi
fi

ln_blank

# ─── Install git ──────────────────────────────────────────────────────────────
if [[ "$INSTALL_GIT" == "true" ]]; then
  log_step "Installing git"
  case "$OS_PKG" in
    brew) brew install git ;;
    apt)  sudo apt-get update -qq && sudo apt-get install -y git ;;
    dnf)  sudo dnf install -y git ;;
    *)    log_error "Cannot install git automatically on $OS_NAME. Please install git manually."; exit 1 ;;
  esac
  log_ok "git installed."
fi

# ─── Install Node.js ──────────────────────────────────────────────────────────
if [[ "$INSTALL_NODE" == "true" ]]; then
  log_step "Installing Node.js v${NODE_INSTALL_VERSION} LTS"
  case "$OS_NAME" in
    macos)
      if ! has_cmd brew; then
        log_info "Homebrew not found — installing Homebrew first…"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      fi
      brew install node@${NODE_INSTALL_VERSION}
      brew link --overwrite node@${NODE_INSTALL_VERSION} || true
      ;;
    ubuntu|debian)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_INSTALL_VERSION}.x" | sudo -E bash -
      sudo apt-get install -y nodejs
      ;;
    rhel|centos|rocky|almalinux|fedora)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_INSTALL_VERSION}.x" | sudo bash -
      sudo dnf install -y nodejs
      ;;
    *)
      log_warn "Unsupported OS for automated Node.js install. Using nvm fallback…"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      # shellcheck source=/dev/null
      export NVM_DIR="$HOME/.nvm"
      [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
      nvm install "$NODE_INSTALL_VERSION"
      nvm use "$NODE_INSTALL_VERSION"
      ;;
  esac
  hash -r || true
  if ! has_cmd node || [[ "$(node_major)" -lt "$NODE_MIN_MAJOR" ]]; then
    log_error "Node.js v${NODE_MIN_MAJOR}+ is still not available on PATH after installation."
    log_info "Open a new shell, or add the Node.js bin directory to PATH, then re-run."
    exit 1
  fi
  log_ok "Node.js $(node --version) installed."
fi

# ─── Install MySQL ────────────────────────────────────────────────────────────
if [[ "$INSTALL_MYSQL" == "true" ]]; then
  log_step "Installing MySQL"
  case "$OS_NAME" in
    macos)
      if ! has_cmd brew; then
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      fi
      brew install mysql
      brew services start mysql
      log_ok "MySQL installed and started via Homebrew."
      log_warn "Run ${CYN}mysql_secure_installation${RST}${YEL} after setup to harden MySQL."
      ;;
    ubuntu|debian)
      sudo apt-get update -qq
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
      sudo systemctl enable mysql --now
      log_ok "MySQL installed and started."
      log_warn "Run ${CYN}sudo mysql_secure_installation${RST}${YEL} after setup to harden MySQL."
      ;;
    rhel|centos|rocky|almalinux|fedora)
      sudo dnf install -y mysql-server
      sudo systemctl enable mysqld --now
      log_ok "MySQL installed and started."
      ;;
    *)
      log_error "Cannot install MySQL automatically on $OS_NAME. Please install MySQL manually and re-run."
      exit 1
      ;;
  esac
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Port Availability Check
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Port Availability Check"

BACKEND_PORT="$DEFAULT_BACKEND_PORT"
FRONTEND_PORT="$DEFAULT_FRONTEND_PORT"
DB_PORT="$DEFAULT_DB_PORT"

_port_status() {
  local port="$1"; local name="$2"
  if port_free "$port"; then
    log_ok "Port ${port}  →  ${name} — available"
  else
    log_warn "Port ${port}  →  ${name} — IN USE (will prompt to change during configuration)"
  fi
}

_port_status "$BACKEND_PORT"  "Backend API"
_port_status "$FRONTEND_PORT" "Frontend"
_port_status "$DB_PORT"       "MySQL"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Installation Summary
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Installation Summary"
ln_blank

sbox_top "What will be installed"
sbox_empty
sbox_row "${GRN}✦${RST}  ${DIM}Beacyn Platform  v${BEACYN_VERSION}${RST}"
sbox_row "   ${DIM}Source branch: ${WHT}${BEACYN_BRANCH}${RST}"
sbox_empty
sbox_div "Components"
sbox_empty
sbox_row "  ${CYN}Backend API${RST}       ${DIM}Express 5 — port ${BACKEND_PORT}${RST}"
sbox_row "  ${BLU}Frontend${RST}          ${DIM}React 19 + Vite — port ${FRONTEND_PORT}${RST}"
sbox_row "  ${YEL}Security Monitor${RST}  ${DIM}Portal health watchdog (scheduled)${RST}"
sbox_empty
sbox_div "Databases"
sbox_empty
sbox_row "  ${GRN}pulseiq${RST}  ${DIM}Application database (monitoring, users, assets, settings)${RST}"
sbox_row "  ${GRN}bsa${RST}      ${DIM}Agent telemetry database (infrastructure metrics)${RST}"
sbox_empty
sbox_div "Service"
sbox_empty
if [[ "$OS_NAME" == "macos" ]]; then
  sbox_row "  ${DIM}macOS launchd — auto-starts on login${RST}"
else
  sbox_row "  ${DIM}systemd service — auto-starts on boot${RST}"
fi
sbox_empty
sbox_btm
ln_blank

if ! ask_yn "Proceed with installation?" "y"; then
  log_info "Installation cancelled."
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4 — End-User License Agreement
# ═══════════════════════════════════════════════════════════════════════════════
log_step "End-User License Agreement"
ln_blank

EULA_ENV="$(echo "${EULA_ACCEPTED:-}" | tr '[:upper:]' '[:lower:]')"

if [[ "$EULA_ENV" == "true" || "$EULA_ENV" == "1" || "$EULA_ENV" == "yes" ]]; then
  log_ok "EULA accepted via environment variable EULA_ACCEPTED."
  EULA_RESULT="accepted"
elif [[ ! -r /dev/tty ]]; then
  log_error "EULA acceptance is required."
  log_info "Set EULA_ACCEPTED=true to accept non-interactively."
  exit 1
else
  sbox_top "END-USER LICENSE AGREEMENT (EULA)"
  sbox_empty
  sbox_row "${DIM}IMPORTANT — READ CAREFULLY: This End-User License Agreement (\"Agreement\")${RST}"
  sbox_row "${DIM}is a legally binding contract between you (\"Licensee\") and Beacyn Labs${RST}"
  sbox_row "${DIM}(\"Licensor\") governing your use of the Beacyn software platform. By${RST}"
  sbox_row "${DIM}downloading, installing, accessing, or using Beacyn in any form, you${RST}"
  sbox_row "${DIM}acknowledge that you have read, understood, and agree to be bound by${RST}"
  sbox_row "${DIM}all terms of this Agreement. If you do not agree, do not install or use${RST}"
  sbox_row "${DIM}the Software.${RST}"
  sbox_empty
  sbox_div "Key Terms"
  sbox_empty
  sbox_row "${GRN}✦${RST}  ${DIM}Free for individuals and SMBs (< 250 employees / < USD 50M revenue)${RST}"
  sbox_row "   ${DIM}via Git, Docker, or Podman self-hosted deployments.${RST}"
  sbox_empty
  sbox_row "${GRN}✦${RST}  ${DIM}Large enterprises (≥ 250 employees or ≥ USD 50M revenue) require${RST}"
  sbox_row "   ${DIM}a paid Enterprise License.${RST}"
  sbox_empty
  sbox_row "${GRN}✦${RST}  ${DIM}SaaS usage is subject to a separate paid Subscription Agreement.${RST}"
  sbox_empty
  sbox_row "${GRN}✦${RST}  ${DIM}Modification, rebranding, reselling, or repurposing the Software${RST}"
  sbox_row "   ${DIM}is prohibited without explicit written consent from Beacyn Labs.${RST}"
  sbox_empty
  sbox_row "${GRN}✦${RST}  ${DIM}All intellectual property rights remain with Beacyn Labs.${RST}"
  sbox_empty
  sbox_div "References"
  sbox_empty
  sbox_row "${GRY}Full EULA   ${RST}${CYN}https://beacyn.io/legal/eula${RST}"
  sbox_row "${GRY}Support     ${RST}${CYN}support@beacyn.io${RST}"
  sbox_row "${GRY}Legal       ${RST}${CYN}legal@beacyn.io${RST}"
  sbox_empty
  sbox_btm
  ln_blank

  EULA_RESULT="declined"
  while true; do
    printf "  ${BOLD}${WHT}Do you agree to the End-User License Agreement?${RST}  ${GRY}[yes / no]${RST}  "
    read -r eula_answer < /dev/tty
    eula_answer="$(echo "$eula_answer" | tr '[:upper:]' '[:lower:]' | xargs)"
    case "$eula_answer" in
      yes|y)
        EULA_RESULT="accepted"; break ;;
      no|n)
        ln_blank
        log_error "You declined the EULA. Beacyn will not be installed."
        log_info  "Review the full agreement: ${CYN}https://beacyn.io/legal/eula${RST}"
        ln_blank
        exit 0
        ;;
      *)
        echo "  ${YEL}⚠${RST}  ${DIM}Please type ${WHT}yes${RST}${DIM} or ${WHT}no${RST}${DIM} and press Enter.${RST}"
        ;;
    esac
  done

  ln_blank
  log_ok "EULA accepted. Continuing installation…"
fi

ln_blank
# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Application Configuration
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Application Configuration"
log_info "Press Enter to accept defaults shown in [brackets]."
ln_blank

# ─── Database ─────────────────────────────────────────────────────────────────
sbox_top "Database (MySQL)"
sbox_empty
CFG_DB_HOST="$(ask_value "DB Host"     "localhost")"
if [[ -z "$CFG_DB_HOST" ]]; then
  log_error "DB Host cannot be empty."
  exit 1
fi
CFG_DB_PORT="$DEFAULT_DB_PORT"
CFG_DB_USER="$(ask_value "DB User"     "root")"
if [[ -z "$CFG_DB_USER" ]]; then
  log_error "DB User cannot be empty."
  exit 1
fi
CFG_DB_PASS="$(ask_value "DB Password" ""         "secret")"
if [[ -z "$CFG_DB_PASS" ]]; then
  log_warn "DB password is empty. MySQL will reject the connection if a password is required."
fi
sbox_empty
sbox_btm
ln_blank

# ─── Ports ────────────────────────────────────────────────────────────────────
sbox_top "Service Ports"
sbox_empty
while true; do
  CFG_BACKEND_PORT="$(ask_value "Backend API port" "$DEFAULT_BACKEND_PORT")"
  if ! valid_port "$CFG_BACKEND_PORT"; then
    log_warn "Backend port must be a number from 1 to 65535."
    [[ -r /dev/tty ]] || exit 1
    continue
  fi
  if port_free "$CFG_BACKEND_PORT"; then
    break
  fi
  log_warn "Port ${CFG_BACKEND_PORT} is already in use. Choose a different port."
  [[ -r /dev/tty ]] || exit 1
done
while true; do
  CFG_FRONTEND_PORT="$(ask_value "Frontend port" "$DEFAULT_FRONTEND_PORT")"
  if ! valid_port "$CFG_FRONTEND_PORT"; then
    log_warn "Frontend port must be a number from 1 to 65535."
    [[ -r /dev/tty ]] || exit 1
    continue
  fi
  if [[ "$CFG_FRONTEND_PORT" == "$CFG_BACKEND_PORT" ]]; then
    log_warn "Frontend and backend cannot share port ${CFG_FRONTEND_PORT}."
    [[ -r /dev/tty ]] || exit 1
    continue
  fi
  if port_free "$CFG_FRONTEND_PORT"; then
    break
  fi
  log_warn "Port ${CFG_FRONTEND_PORT} is already in use. Choose a different port."
  [[ -r /dev/tty ]] || exit 1
done
sbox_empty
sbox_btm
ln_blank

FRONTEND_URL="http://localhost:${CFG_FRONTEND_PORT}"
BACKEND_URL="http://localhost:${CFG_BACKEND_PORT}"

# Confirm before continuing
ln_blank
log_sep
log_info "Configuration Summary:"
log_info "  DB:         ${CFG_DB_HOST}:${CFG_DB_PORT}  (user: ${CFG_DB_USER})"
log_info "  Backend:    ${BACKEND_URL}"
log_info "  Frontend:   ${FRONTEND_URL}"
log_sep
ln_blank

if [[ "$CFG_BACKEND_PORT" != "5145" || "$CFG_FRONTEND_PORT" != "7145" ]]; then
  log_warn "The API process listens on 5145 and Vite preview listens on 7145."
  log_warn "Those ports are fixed in the application. Custom ports are stored in .env for reference."
fi

if ! ask_yn "Confirm configuration and begin installation?" "y"; then
  log_info "Installation cancelled."
  exit 0
fi

ln_blank


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Fetching Beacyn Source
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Fetching Beacyn Source"
log_info "Branch: ${BEACYN_BRANCH}"

# Create install directory
INSTALL_PARENT="$(dirname "$INSTALL_DIR")"
if ! mkdir -p "$INSTALL_PARENT"; then
  log_error "Cannot create ${INSTALL_PARENT}."
  exit 1
fi
if [[ ! -w "$INSTALL_PARENT" ]]; then
  log_error "No write permission for ${INSTALL_PARENT}."
  log_info "Choose another path with BEACYN_INSTALL_DIR, or re-run with permission to write there."
  exit 1
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log_info "Existing installation found — pulling latest changes…"
  git -C "$INSTALL_DIR" fetch origin "$BEACYN_BRANCH" --depth=1 2>&1 | sed "s/^/  ${GRY}·${RST}  /"
  git -C "$INSTALL_DIR" reset --hard "origin/${BEACYN_BRANCH}" 2>&1 | sed "s/^/  ${GRY}·${RST}  /"
  log_ok "Source updated to latest ${BEACYN_BRANCH}."
else
  if [[ -d "$INSTALL_DIR" ]] && [[ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
    log_warn "Directory ${INSTALL_DIR} already exists and is not empty. Moving to ${INSTALL_DIR}.bak"
    mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
  fi
  log_info "Cloning repository (branch: ${BEACYN_BRANCH})…"
  git clone --branch "$BEACYN_BRANCH" --depth=1 "$BEACYN_REPO_URL" "$INSTALL_DIR" 2>&1 \
    | sed "s/^/  ${GRY}·${RST}  /"
  log_ok "Source cloned successfully."
fi

if [[ ! -f "$INSTALL_DIR/src/scripts/start.ts" ]]; then
  log_error "The fetched repository is not compatible with this installer."
  log_info "Missing required file: src/scripts/start.ts"
  log_info "Verify BEACYN_REPO_URL points to the Beacyn platform repository and branch."
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Install Node.js Dependencies
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Installing Node.js Dependencies"

cd "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"

# Prefer ci for reproducible installs if lockfile exists
if [[ -f "package-lock.json" ]]; then
  log_info "Running npm ci (lockfile found)…"
  if ! npm ci > "$INSTALL_DIR/logs/npm-ci.log" 2>&1; then
    log_error "npm ci failed. Last lines from ${INSTALL_DIR}/logs/npm-ci.log:"
    tail -30 "$INSTALL_DIR/logs/npm-ci.log" | sed "s/^/  /"
    exit 1
  fi
else
  log_info "Running npm install…"
  if ! npm install > "$INSTALL_DIR/logs/npm-install.log" 2>&1; then
    log_error "npm install failed. Last lines from ${INSTALL_DIR}/logs/npm-install.log:"
    tail -30 "$INSTALL_DIR/logs/npm-install.log" | sed "s/^/  /"
    exit 1
  fi
fi

log_ok "Dependencies installed."

mkdir -p "$INSTALL_DIR/logs"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 8 — Write .env
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Writing Environment Configuration"

ENV_FILE="$INSTALL_DIR/.env"

cat > "$ENV_FILE" <<EOF
# Beacyn Platform — Environment Configuration
# Generated by install.sh on $(date -u '+%Y-%m-%dT%H:%M:%SZ')
# ─────────────────────────────────────────────

# ── Database ──────────────────────────────────
DB_HOST=$(env_dquote "$CFG_DB_HOST")
DB_PORT=$(env_dquote "$CFG_DB_PORT")
DB_USER=$(env_dquote "$CFG_DB_USER")
DB_PASSWORD=$(env_dquote "$CFG_DB_PASS")
DB_NAME="pulseiq"
INFRA_DB_NAME="bsa"
DB_SSL="false"

# ── Service URLs ──────────────────────────────
PORT=$(env_dquote "$CFG_BACKEND_PORT")
VITE_APP_URL=$(env_dquote "$FRONTEND_URL")
VITE_API_BASE_URL=$(env_dquote "$BACKEND_URL")
PULSE_API_BASE_URL=$(env_dquote "$BACKEND_URL")

# ── Startup behaviour ─────────────────────────
EULA_ACCEPTED="true"
NODE_ENV="production"
EOF

# Restrict file permissions — contains DB password
chmod 600 "$ENV_FILE"
log_ok ".env written and permissions set to 600."

# Build after .env exists so the browser bundle receives the API URL.
log_step "Building Frontend Assets"
export VITE_API_BASE_URL="$BACKEND_URL"
export VITE_APP_URL="$FRONTEND_URL"
export NODE_ENV=production
if ! npm run build > "$INSTALL_DIR/logs/install-build.log" 2>&1; then
  log_error "Frontend build failed. Last lines from ${INSTALL_DIR}/logs/install-build.log:"
  tail -30 "$INSTALL_DIR/logs/install-build.log" | sed "s/^/  /"
  exit 1
fi
log_ok "Frontend build completed."

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 9 — Create Databases & Schema
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Creating Databases & Applying Schema"

# Test MySQL connectivity
log_info "Testing MySQL connection…"
MYSQL_CONN_TEST=0

# Try connecting (suppress verbose error for clean output)
if mysql -h "$CFG_DB_HOST" -P "$CFG_DB_PORT" -u "$CFG_DB_USER" \
    ${CFG_DB_PASS:+-p"$CFG_DB_PASS"} \
    -e "SELECT 1;" &>/dev/null 2>&1; then
  MYSQL_CONN_TEST=1
fi

if [[ $MYSQL_CONN_TEST -eq 0 ]]; then
  log_error "Cannot connect to MySQL with the provided credentials."
  log_info "Ensure MySQL is running and the credentials are correct, then re-run."
  log_info "  mysql -h ${CFG_DB_HOST} -P ${CFG_DB_PORT} -u ${CFG_DB_USER} -p"
  exit 1
fi
  log_ok "MySQL connection successful."

  # Detect existing databases and require explicit consent before overwrite.
  DB_EXISTS_PULSEIQ=0
  DB_EXISTS_BSA=0

  if mysql -h "$CFG_DB_HOST" -P "$CFG_DB_PORT" -u "$CFG_DB_USER" \
      ${CFG_DB_PASS:+-p"$CFG_DB_PASS"} \
      -Nse "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='pulseiq';" \
      2>/dev/null | grep -q '^pulseiq$'; then
    DB_EXISTS_PULSEIQ=1
  fi

  if mysql -h "$CFG_DB_HOST" -P "$CFG_DB_PORT" -u "$CFG_DB_USER" \
      ${CFG_DB_PASS:+-p"$CFG_DB_PASS"} \
      -Nse "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='bsa';" \
      2>/dev/null | grep -q '^bsa$'; then
    DB_EXISTS_BSA=1
  fi

  OVERWRITE_DATABASES=false
  if [[ $DB_EXISTS_PULSEIQ -eq 1 || $DB_EXISTS_BSA -eq 1 ]]; then
    log_warn "Existing database(s) detected:"
    [[ $DB_EXISTS_PULSEIQ -eq 1 ]] && log_warn "  - pulseiq"
    [[ $DB_EXISTS_BSA -eq 1 ]] && log_warn "  - bsa"
    ln_blank
    if ask_yn "Overwrite existing databases? This will permanently delete data." "n"; then
      OVERWRITE_DATABASES=true
      log_warn "Overwrite approved — existing databases will be dropped and recreated."
    else
      log_info "Overwrite declined — existing databases will be preserved."
      log_info "Installer will run non-destructive schema initialization only."
    fi
  fi

  if [[ "$OVERWRITE_DATABASES" == "true" ]]; then
    log_info "Dropping existing databases…"
    mysql -h "$CFG_DB_HOST" -P "$CFG_DB_PORT" -u "$CFG_DB_USER" \
      ${CFG_DB_PASS:+-p"$CFG_DB_PASS"} \
      -e "DROP DATABASE IF EXISTS \`pulseiq\`; DROP DATABASE IF EXISTS \`bsa\`;" 2>/dev/null
    log_ok "Existing databases dropped."
  fi

  # Create the bsa database (schema-only, tables created by agent on first connect)
  log_info "Creating 'bsa' database…"
  mysql -h "$CFG_DB_HOST" -P "$CFG_DB_PORT" -u "$CFG_DB_USER" \
    ${CFG_DB_PASS:+-p"$CFG_DB_PASS"} \
    -e "CREATE DATABASE IF NOT EXISTS \`bsa\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  log_ok "'bsa' database ready."

  # Create pulseiq + all application tables via the built-in init script
  log_info "Initialising 'pulseiq' schema (this may take a moment)…"
  mkdir -p "$INSTALL_DIR/logs"
  if ! npm run initdb > "$INSTALL_DIR/logs/initdb.log" 2>&1; then
    log_error "Database initialisation failed. Last lines from ${INSTALL_DIR}/logs/initdb.log:"
    tail -30 "$INSTALL_DIR/logs/initdb.log" | sed "s/^/  /"
    exit 1
  fi
  log_ok "Database schema applied successfully."

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 10 — Install as System Service
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Configuring System Service"

SERVICE_INSTALLED=false
SERVICE_NAME="beacyn"
NPM_BIN="$(which npm)"
NODE_BIN="$(which node)"
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"
SERVICE_MANAGER="unknown"
SERVICE_LOG_PATH=""
SERVICE_ERR_LOG_PATH=""
PLIST_LABEL=""
PLIST_FILE=""

# ─── macOS — launchd ──────────────────────────────────────────────────────────
if [[ "$OS_NAME" == "macos" ]]; then
  LAUNCHD_LOG_DIR="/var/log/beacyn"
  if [[ $EUID -eq 0 ]]; then
    PLIST_DIR="/Library/LaunchDaemons"
    PLIST_LABEL="io.beacyn.platform"
  else
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST_LABEL="io.beacyn.platform.${USER}"
    LAUNCHD_LOG_DIR="$HOME/.beacyn/logs"
  fi
  mkdir -p "$PLIST_DIR"
  mkdir -p "$LAUNCHD_LOG_DIR"
  PLIST_FILE="${PLIST_DIR}/${PLIST_LABEL}.plist"
  SERVICE_MANAGER="launchd"
  SERVICE_LOG_PATH="${LAUNCHD_LOG_DIR}/beacyn.log"
  SERVICE_ERR_LOG_PATH="${LAUNCHD_LOG_DIR}/beacyn-error.log"

  XML_DB_HOST="$(xml_escape "$CFG_DB_HOST")"
  XML_DB_PORT="$(xml_escape "$CFG_DB_PORT")"
  XML_DB_USER="$(xml_escape "$CFG_DB_USER")"
  XML_DB_PASS="$(xml_escape "$CFG_DB_PASS")"
  XML_BACKEND_PORT="$(xml_escape "$CFG_BACKEND_PORT")"
  XML_FRONTEND_URL="$(xml_escape "$FRONTEND_URL")"
  XML_BACKEND_URL="$(xml_escape "$BACKEND_URL")"

  cat > "$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>--import=tsx/esm</string>
    <string>${INSTALL_DIR}/src/scripts/start.ts</string>
  </array>
  <key>WorkingDirectory</key>  <string>${INSTALL_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>            <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DB_HOST</key>         <string>${XML_DB_HOST}</string>
    <key>DB_PORT</key>         <string>${XML_DB_PORT}</string>
    <key>DB_USER</key>         <string>${XML_DB_USER}</string>
    <key>DB_PASSWORD</key>     <string>${XML_DB_PASS}</string>
    <key>DB_NAME</key>         <string>pulseiq</string>
    <key>INFRA_DB_NAME</key>   <string>bsa</string>
    <key>PORT</key>            <string>${XML_BACKEND_PORT}</string>
    <key>VITE_APP_URL</key>    <string>${XML_FRONTEND_URL}</string>
    <key>VITE_API_BASE_URL</key> <string>${XML_BACKEND_URL}</string>
    <key>PULSE_API_BASE_URL</key> <string>${XML_BACKEND_URL}</string>
    <key>EULA_ACCEPTED</key>   <string>true</string>
    <key>NODE_ENV</key>        <string>production</string>
  </dict>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>${LAUNCHD_LOG_DIR}/beacyn.log</string>
  <key>StandardErrorPath</key> <string>${LAUNCHD_LOG_DIR}/beacyn-error.log</string>
</dict>
</plist>
PLIST

  # Unload existing if present, then load
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  launchctl load -w "$PLIST_FILE" && SERVICE_INSTALLED=true
  log_ok "macOS launchd service registered: ${PLIST_LABEL}"

# ─── Linux — systemd ──────────────────────────────────────────────────────────
elif [[ -d /run/systemd/system ]] || has_cmd systemctl; then
  UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  BEACYN_USER="$(whoami)"
  SERVICE_MANAGER="systemd"
  SERVICE_LOG_PATH="/var/log/beacyn/beacyn.log"
  SERVICE_ERR_LOG_PATH="/var/log/beacyn/beacyn-error.log"

  sudo mkdir -p /var/log/beacyn

  sudo tee "$UNIT_FILE" > /dev/null <<UNIT
[Unit]
Description=Beacyn Platform — Enterprise Infrastructure Monitor
After=network.target mysql.service mysqld.service

[Service]
Type=simple
User=${BEACYN_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NPM_BIN} run start
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/beacyn/beacyn.log
StandardError=append:/var/log/beacyn/beacyn-error.log

EnvironmentFile=${ENV_FILE}

[Install]
WantedBy=multi-user.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME" --now && SERVICE_INSTALLED=true
  log_ok "systemd service '${SERVICE_NAME}' enabled and started."

# ─── Fallback — nohup ─────────────────────────────────────────────────────────
else
  log_warn "Neither launchd nor systemd detected. Starting Beacyn with nohup…"
  LOGDIR="$INSTALL_DIR/logs"
  SERVICE_MANAGER="nohup"
  SERVICE_LOG_PATH="$LOGDIR/beacyn.log"
  SERVICE_ERR_LOG_PATH="$LOGDIR/beacyn-error.log"
  mkdir -p "$LOGDIR"
  (
    cd "$INSTALL_DIR"
    # shellcheck source=/dev/null
    set -a; source "$ENV_FILE"; set +a
    nohup npm run start > "$SERVICE_LOG_PATH" 2> "$SERVICE_ERR_LOG_PATH" &
    echo $! > "$INSTALL_DIR/.beacyn.pid"
  )
  log_ok "Beacyn started in background (PID: $(cat "$INSTALL_DIR/.beacyn.pid" 2>/dev/null || echo 'unknown'))"
  SERVICE_INSTALLED=true
fi

# ─── Write EULA marker so start.ts skips its own prompt ───────────────────────
EULA_STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ') via install.sh"
printf '%s\nVersion: %s\n' "$EULA_STAMP" "$BEACYN_VERSION" > "$INSTALL_DIR/.eula-accepted"
chmod 644 "$INSTALL_DIR/.eula-accepted"

# ─── Install Beacyn management CLI ───────────────────────────────────────────
log_step "Installing Beacyn Management CLI"

BEACYNCTL_AUTO_PATH_VALUE="${BEACYNCTL_AUTO_PATH:-}"
if [[ "$NO_AUTO_PATH_FLAG" == "true" ]]; then
  BEACYNCTL_AUTO_PATH_VALUE="false"
  log_info "Auto PATH update disabled by --no-auto-path flag."
fi
if [[ -z "$BEACYNCTL_AUTO_PATH_VALUE" ]]; then
  if [[ -t 0 ]]; then
    if ask_yn "Add beacynctl to PATH automatically for your OS?" "y"; then
      BEACYNCTL_AUTO_PATH_VALUE="true"
    else
      BEACYNCTL_AUTO_PATH_VALUE="false"
    fi
  else
    BEACYNCTL_AUTO_PATH_VALUE="false"
  fi
fi

bash "$INSTALL_DIR/src/scripts/cli/install-beacynctl.sh" \
  --app-dir "$INSTALL_DIR" \
  --env-file "$ENV_FILE" \
  --service-manager "$SERVICE_MANAGER" \
  --service-name "$SERVICE_NAME" \
  --plist-label "$PLIST_LABEL" \
  --plist-file "$PLIST_FILE" \
  --log-file "$SERVICE_LOG_PATH" \
  --error-log-file "$SERVICE_ERR_LOG_PATH" \
  --frontend-url "$FRONTEND_URL" \
  --backend-url "$BACKEND_URL" \
  --frontend-port "$CFG_FRONTEND_PORT" \
  --backend-port "$CFG_BACKEND_PORT" \
  --npm-bin "$NPM_BIN" \
  --auto-path "$BEACYNCTL_AUTO_PATH_VALUE"

case ":$PATH:" in
  *":$INSTALL_DIR/bin:"*) BEACYN_CTL_CMD="beacynctl" ;;
  *) BEACYN_CTL_CMD="$INSTALL_DIR/bin/beacynctl" ;;
esac

log_ok "Beacyn management CLI installed: ${BEACYN_CTL_CMD}"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 11 — Final Summary
# ═══════════════════════════════════════════════════════════════════════════════
ln_blank
log_sep
ln_blank

box_top
box_empty
box_row "${GRN}✓${RST}  ${BOLD}${WHT}Beacyn Platform installed successfully!${RST}"
box_empty
box_div
box_empty
box_row "${GRY}Frontend       ${RST}${CYN}${FRONTEND_URL}${RST}"
box_row "${GRY}Backend API    ${RST}${CYN}${BACKEND_URL}${RST}"
box_empty
box_div
box_empty
box_row "${GRY}Default login  ${RST}${DIM}Username: ${WHT}Root-user${RST}  ${GRY}·${RST}  ${DIM}Password: ${WHT}Root@123${RST}"
box_row "${DIM}Change your password immediately after first login.${RST}"
box_empty
box_div
box_empty
if [[ "$SERVICE_INSTALLED" == "true" ]]; then
  if [[ "$OS_NAME" == "macos" ]]; then
    box_row "${DIM}Service starts automatically on login via launchd.${RST}"
    box_row "${GRY}Logs     ${RST}${DIM}${LAUNCHD_LOG_DIR:-$HOME/.beacyn/logs}/beacyn.log${RST}"
  elif has_cmd systemctl; then
    box_row "${DIM}Service starts automatically on boot via systemd.${RST}"
    box_row "${GRY}Status   ${RST}${DIM}sudo systemctl status beacyn${RST}"
    box_row "${GRY}Logs     ${RST}${DIM}sudo journalctl -u beacyn -f${RST}"
  else
    box_row "${DIM}Service running in background (nohup).${RST}"
    box_row "${GRY}Logs     ${RST}${DIM}${INSTALL_DIR}/logs/beacyn.log${RST}"
  fi
else
  box_row "${YEL}⚠  Service could not be registered automatically.${RST}"
  box_row "${DIM}Run manually: cd \$INSTALL_DIR && npm run start${RST}"
fi
box_empty
box_div
box_empty
box_row "${GRY}Status         ${RST}${DIM}${BEACYN_CTL_CMD} status${RST}"
box_row "${GRY}Start          ${RST}${DIM}${BEACYN_CTL_CMD} start${RST}"
box_row "${GRY}Restart        ${RST}${DIM}${BEACYN_CTL_CMD} restart${RST}"
box_row "${GRY}Stop           ${RST}${DIM}${BEACYN_CTL_CMD} stop${RST}"
box_row "${GRY}Logs           ${RST}${DIM}${BEACYN_CTL_CMD} logs -f${RST}"
box_empty
box_div
box_empty
box_row "${GRY}Documentation  ${RST}${CYN}https://beacyn.io/docs${RST}"
box_row "${GRY}Support        ${RST}${CYN}support@beacyn.io${RST}"
box_empty
box_btm
ln_blank
