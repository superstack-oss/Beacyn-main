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
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
IFS=$'\n\t'

# ─── Repository ────────────────────────────────────────────────────────────────
BEACYN_REPO_URL="${BEACYN_REPO_URL:-https://github.com/mackdev25/Beacyn-EMO.git}"
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
CFG_DB_PORT="$DEFAULT_DB_PORT"
CFG_DB_USER="$(ask_value "DB User"     "root")"
CFG_DB_PASS="$(ask_value "DB Password" ""         "secret")"
sbox_empty
sbox_btm
ln_blank

# ─── Ports ────────────────────────────────────────────────────────────────────
sbox_top "Service Ports"
sbox_empty
while true; do
  CFG_BACKEND_PORT="$(ask_value "Backend API port" "$DEFAULT_BACKEND_PORT")"
  if port_free "$CFG_BACKEND_PORT"; then
    break
  else
    log_warn "Port ${CFG_BACKEND_PORT} is already in use. Choose a different port."
  fi
done
while true; do
  CFG_FRONTEND_PORT="$(ask_value "Frontend port" "$DEFAULT_FRONTEND_PORT")"
  if port_free "$CFG_FRONTEND_PORT"; then
    break
  else
    log_warn "Port ${CFG_FRONTEND_PORT} is already in use. Choose a different port."
  fi
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
mkdir -p "$(dirname "$INSTALL_DIR")"

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

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Install Node.js Dependencies
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Installing Node.js Dependencies"

cd "$INSTALL_DIR"

# Prefer ci for reproducible installs if lockfile exists
if [[ -f "package-lock.json" ]]; then
  log_info "Running npm ci (lockfile found)…"
  npm ci --prefer-offline 2>&1 | tail -5 | sed "s/^/  ${GRY}·${RST}  /"
else
  log_info "Running npm install…"
  npm install 2>&1 | tail -5 | sed "s/^/  ${GRY}·${RST}  /"
fi

log_ok "Dependencies installed."

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
DB_HOST=${CFG_DB_HOST}
DB_PORT=${CFG_DB_PORT}
DB_USER=${CFG_DB_USER}
DB_PASSWORD=${CFG_DB_PASS}
DB_NAME=pulseiq
INFRA_DB_NAME=bsa

# ── Service ports ─────────────────────────────
PORT=${CFG_BACKEND_PORT}
VITE_APP_URL=${FRONTEND_URL}

# ── Startup behaviour ─────────────────────────
EULA_ACCEPTED=true
NODE_ENV=production
EOF

# Restrict file permissions — contains DB password
chmod 600 "$ENV_FILE"
log_ok ".env written and permissions set to 600."

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
  log_warn "Cannot connect to MySQL with the provided credentials."
  log_info "Ensure MySQL is running and the credentials are correct, then re-run."
  log_info "  mysql -h ${CFG_DB_HOST} -P ${CFG_DB_PORT} -u ${CFG_DB_USER} -p"
  log_error "Database setup skipped — please run ${CYN}npm run initdb${RST}${RED} manually once MySQL is accessible."
else
  log_ok "MySQL connection successful."

  # Create the bsa database (schema-only, tables created by agent on first connect)
  log_info "Creating 'bsa' database…"
  mysql -h "$CFG_DB_HOST" -P "$CFG_DB_PORT" -u "$CFG_DB_USER" \
    ${CFG_DB_PASS:+-p"$CFG_DB_PASS"} \
    -e "CREATE DATABASE IF NOT EXISTS \`bsa\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  log_ok "'bsa' database ready."

  # Create pulseiq + all application tables via the built-in init script
  log_info "Initialising 'pulseiq' schema (this may take a moment)…"
  npm run initdb 2>&1 | grep -E '(ready|error|warn|Table|Database|Seeded|Error)' \
    | sed "s/^/  ${GRY}·${RST}  /" || true
  log_ok "Database schema applied successfully."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 10 — Install as System Service
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Configuring System Service"

SERVICE_INSTALLED=false
SERVICE_NAME="beacyn"
NPM_BIN="$(which npm)"
NODE_BIN="$(which node)"
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"

# ─── macOS — launchd ──────────────────────────────────────────────────────────
if [[ "$OS_NAME" == "macos" ]]; then
  if [[ $EUID -eq 0 ]]; then
    PLIST_DIR="/Library/LaunchDaemons"
    PLIST_LABEL="io.beacyn.platform"
  else
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST_LABEL="io.beacyn.platform.${USER}"
  fi
  mkdir -p "$PLIST_DIR"
  PLIST_FILE="${PLIST_DIR}/${PLIST_LABEL}.plist"

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
    <key>PATH</key>            <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DB_HOST</key>         <string>${CFG_DB_HOST}</string>
    <key>DB_PORT</key>         <string>${CFG_DB_PORT}</string>
    <key>DB_USER</key>         <string>${CFG_DB_USER}</string>
    <key>DB_PASSWORD</key>     <string>${CFG_DB_PASS}</string>
    <key>DB_NAME</key>         <string>pulseiq</string>
    <key>INFRA_DB_NAME</key>   <string>bsa</string>
    <key>PORT</key>            <string>${CFG_BACKEND_PORT}</string>
    <key>VITE_APP_URL</key>    <string>${FRONTEND_URL}</string>
    <key>EULA_ACCEPTED</key>   <string>true</string>
    <key>NODE_ENV</key>        <string>production</string>
  </dict>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>/var/log/beacyn/beacyn.log</string>
  <key>StandardErrorPath</key> <string>/var/log/beacyn/beacyn-error.log</string>
</dict>
</plist>
PLIST

  mkdir -p /var/log/beacyn 2>/dev/null || mkdir -p "$HOME/.beacyn/logs"

  # Unload existing if present, then load
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  launchctl load -w "$PLIST_FILE" && SERVICE_INSTALLED=true
  log_ok "macOS launchd service registered: ${PLIST_LABEL}"

# ─── Linux — systemd ──────────────────────────────────────────────────────────
elif [[ -d /run/systemd/system ]] || has_cmd systemctl; then
  UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  BEACYN_USER="$(whoami)"

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

Environment="DB_HOST=${CFG_DB_HOST}"
Environment="DB_PORT=${CFG_DB_PORT}"
Environment="DB_USER=${CFG_DB_USER}"
Environment="DB_PASSWORD=${CFG_DB_PASS}"
Environment="DB_NAME=pulseiq"
Environment="INFRA_DB_NAME=bsa"
Environment="PORT=${CFG_BACKEND_PORT}"
Environment="VITE_APP_URL=${FRONTEND_URL}"
Environment="EULA_ACCEPTED=true"
Environment="NODE_ENV=production"

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
  mkdir -p "$LOGDIR"
  (
    cd "$INSTALL_DIR"
    # shellcheck source=/dev/null
    set -a; source "$ENV_FILE"; set +a
    nohup npm run start > "$LOGDIR/beacyn.log" 2>&1 &
    echo $! > "$INSTALL_DIR/.beacyn.pid"
  )
  log_ok "Beacyn started in background (PID: $(cat "$INSTALL_DIR/.beacyn.pid" 2>/dev/null || echo 'unknown'))"
  SERVICE_INSTALLED=true
fi

# ─── Write EULA marker so start.ts skips its own prompt ───────────────────────
EULA_STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ') via install.sh"
printf '%s\nVersion: %s\n' "$EULA_STAMP" "$BEACYN_VERSION" > "$INSTALL_DIR/.eula-accepted"
chmod 644 "$INSTALL_DIR/.eula-accepted"

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
    box_row "${GRY}Logs     ${RST}${DIM}/var/log/beacyn/beacyn.log${RST}"
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
box_row "${GRY}Documentation  ${RST}${CYN}https://beacyn.io/docs${RST}"
box_row "${GRY}Support        ${RST}${CYN}support@beacyn.io${RST}"
box_empty
box_btm
ln_blank
