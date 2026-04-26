# Beacyn Service Management (`beacynctl`)

This guide explains how to install and use `beacynctl` for day-to-day service operations.

## Quick Command Reference

| Command | Purpose | Common Example |
|---|---|---|
| `status` | Show service and endpoint status | `beacynctl status --json` |
| `health` | Fast health verdict with exit code | `beacynctl health` |
| `start` | Start Beacyn service | `beacynctl start` |
| `stop` | Stop Beacyn service | `beacynctl stop` |
| `restart` | Restart full service or component hint | `beacynctl restart --component backend` |
| `logs` | View logs with filters | `beacynctl logs --component security -f` |
| `config` | Manage CLI/app config keys | `beacynctl config set DB_HOST 127.0.0.1 --env` |
| `env` | Shortcut for env-scope config ops | `beacynctl env get DB_HOST` |
| `validate` | Validate runtime prerequisites | `beacynctl validate` |
| `doctor` | Full diagnostics report | `beacynctl doctor` |
| `backup` | Backup DB schema/data | `beacynctl backup --with-data --output ./backups` |
| `snapshot` | Export support bundle | `beacynctl snapshot --output ./snapshots` |
| `migrate` | Run DB init/migration flow | `beacynctl migrate` |
| `maintenance` | Manage maintenance flag | `beacynctl maintenance on` |
| `self-test` | Run validate + health checks | `beacynctl self-test` |
| `reset-password` | Reset user password | `beacynctl reset-password --user Root-user` |
| `audit` | Security and config audit checks | `beacynctl audit` |
| `cleanup` | Remove logs/cache/snapshots safely | `beacynctl cleanup --scope logs --yes` |
| `uninstall` | Remove service/app with safeguards | `beacynctl uninstall --yes --keep-data` |
| `expose` | Show public/private exposure options | `beacynctl expose` |
| `open` | Open frontend/backend URLs | `beacynctl open` |
| `shell` | Open app shell with env loaded | `beacynctl shell` |
| `version` | Show CLI/app versions | `beacynctl version` |
| `help` | Show command usage help | `beacynctl help` |

## What `beacynctl` Is

`beacynctl` is the Beacyn management CLI for basic operations:

- service status
- start, stop, restart
- logs and live log tail
- quick open of frontend/backend URLs

It is designed for the case where Beacyn runs in the background and the original install terminal is closed.

## How To Install `beacynctl`

## Fresh Install

If you use the current `install.sh`, `beacynctl` is installed automatically.

Run:

```bash
cd /Users/atanukumarpal/Documents/Devlopment/uptime
chmod +x install.sh
./install.sh
```

During install, the script creates:

- `<INSTALL_DIR>/bin/beacynctl`

Installer now supports OS-aware automatic PATH setup **with consent**.

- Interactive install: installer asks whether to auto-add `beacynctl` to PATH.
- Non-interactive/CI: set `BEACYNCTL_AUTO_PATH=true`.
- Explicit flag: `--no-auto-path` disables PATH update even if env var is set.

Example:

```bash
BEACYNCTL_AUTO_PATH=true ./install.sh
```

Explicit no-auto mode (CI-safe):

```bash
BEACYNCTL_AUTO_PATH=true ./install.sh --no-auto-path
```

Precedence:

- `--no-auto-path` overrides `BEACYNCTL_AUTO_PATH=true`.

If you choose not to auto-update PATH, use manual setup below.

Add it manually once:

### macOS (zsh)

```bash
echo 'export PATH="<INSTALL_DIR>/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Linux / Debian / RHEL / UNIX (bash)

```bash
echo 'export PATH="<INSTALL_DIR>/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Windows (PowerShell, current user)

```powershell
[Environment]::SetEnvironmentVariable(
	"Path",
	"$env:Path;<INSTALL_DIR>\\bin",
	"User"
)
```

Restart terminal after PATH updates.

Optional link locations (manual, if preferred):

- `/usr/local/bin/beacynctl`
- `~/.local/bin/beacynctl`

If any of these directories are in `PATH`, you can run `beacynctl` directly.

Implementation split:

- installer logic: `src/scripts/install-beacynctl.sh`
- CLI implementation: `src/scripts/beacynctl.sh`

## Existing Install (Already Running Beacyn)

Re-run the installer against your existing Beacyn directory so it generates `beacynctl` without changing install location.

Example:

```bash
cd /Users/atanukumarpal/Documents/Devlopment/uptime
BEACYN_INSTALL_DIR=/Users/atanukumarpal/beacyn ./install.sh
```

After completion, verify:

```bash
beacynctl help
```

If `beacynctl` is not found, run it directly:

```bash
/Users/atanukumarpal/beacyn/bin/beacynctl help
```

If you see:

```text
beacynctl config file not found: /Users/<user>/.beacynctl.env
```

you are likely running a stale wrapper or old symlink. Use the latest CLI directly:

```bash
/Users/atanukumarpal/beacyn/bin/beacynctl status
```

then fix PATH to point to `<INSTALL_DIR>/bin` as shown above.

## Background Service Behavior

Beacyn runs as a background service after installation:

- macOS: `launchd` (LaunchAgent / LaunchDaemon)
- Linux: `systemd`
- fallback: `nohup` background process

This means the app continues running even after terminal close (for launchd/systemd), and `beacynctl` can be used later for operations.

## Command Reference

Use:

```bash
beacynctl help
```

Available commands:

```bash
beacynctl status
beacynctl start
beacynctl stop
beacynctl restart
beacynctl logs
beacynctl logs -f
beacynctl open
```

## What `status` Shows

`beacynctl status` prints:

- service manager type (`launchd`, `systemd`, or `nohup`)
- service state and PID (when available)
- frontend/backend port listening status
- frontend/backend HTTP status code checks
- log and error log paths

## Basic Troubleshooting Workflow

1. Check service and endpoint health:

```bash
beacynctl status
```

2. If unhealthy, restart:

```bash
beacynctl restart
```

3. Inspect logs:

```bash
beacynctl logs
beacynctl logs -f
```

4. Verify in browser:

```bash
beacynctl open
```

## Direct Service Commands (Without `beacynctl`)

These are useful for low-level checks.

## macOS (`launchd`)

Stop:

```bash
launchctl bootout "gui/$(id -u)/io.beacyn.platform.$USER"
```

Start:

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.beacyn.platform.$USER.plist"
launchctl kickstart -k "gui/$(id -u)/io.beacyn.platform.$USER"
```

Status:

```bash
launchctl print "gui/$(id -u)/io.beacyn.platform.$USER"
```

## Linux (`systemd`)

```bash
sudo systemctl status beacyn
sudo systemctl start beacyn
sudo systemctl stop beacyn
sudo systemctl restart beacyn
sudo journalctl -u beacyn -f
```

## Verify Ports / HTTP

```bash
lsof -nP -iTCP:5145 -sTCP:LISTEN
lsof -nP -iTCP:7145 -sTCP:LISTEN

curl -s -o /dev/null -w "backend_http=%{http_code}\n" http://localhost:5145
curl -s -o /dev/null -w "frontend_http=%{http_code}\n" http://localhost:7145
```

## Full Command Specification

This section is the implementation-facing command spec for `beacynctl`.

## Global Syntax

```bash
beacynctl <command> [options]
```

## Core Commands

### `status`

```bash
beacynctl status [--json]
```

- `--json`: machine-readable output for automation/CI/monitoring.

Safe default:

- text output (human-friendly)

### `health`

```bash
beacynctl health
```

Checks:

- frontend and backend ports are listening
- frontend and backend return HTTP 200 when reachable

Exit codes:

- `0` healthy
- non-zero unhealthy

### `logs`

```bash
beacynctl logs [--component <backend|frontend|security|all>] [--tail N] [-f|--follow]
```

Safe defaults:

- component: `all`
- tail lines: `80`
- follow mode: disabled

### `start`

```bash
beacynctl start
```

Starts service via current service manager (`launchd`, `systemd`, or fallback `nohup`).

### `stop`

```bash
beacynctl stop
```

Stops service via current service manager.

### `restart`

```bash
beacynctl restart [--component <backend|frontend|security|all>]
```

Safe default:

- full service restart.
- component restart requests fall back to full restart when manager does not support isolation.

### `open`

```bash
beacynctl open
```

Opens frontend and backend URLs in browser (`open` on macOS, `xdg-open` on Linux).

## Config and Environment Commands

### `config`

```bash
beacynctl config list [--env|--cli|--all]
beacynctl config get KEY [--env|--cli]
beacynctl config set KEY VALUE [--env|--cli]
beacynctl config unset KEY [--env|--cli]
beacynctl config validate
```

Scopes:

- `--env`: application `.env`
- `--cli`: `beacynctl` metadata config (`.beacynctl.env`)
- `--all`: both scopes

Safe defaults:

- `list` defaults to `--all`
- `set` / `unset` default to `--env`
- sensitive values are masked in `list`

### `env` (alias wrapper)

```bash
beacynctl env list
beacynctl env get KEY
beacynctl env set KEY VALUE
beacynctl env unset KEY
```

Purpose:

- convenience alias for `config` with env scope.

## Operations and Maintenance Commands

### `backup`

```bash
beacynctl backup [--schema-only|--with-data] [--output DIR]
```

Safe defaults:

- schema only (`--schema-only`)
- output: `<APP_DIR>/backups`

### `snapshot`

```bash
beacynctl snapshot [--output DIR]
```

Creates support bundle with:

- `status --json`
- log tail
- sanitized env snapshot

Safe default output:

- `<APP_DIR>/snapshots`

### `migrate`

```bash
beacynctl migrate
```

Runs:

- `npm run initdb`

### `validate`

```bash
beacynctl validate
```

Checks:

- required files exist
- runtime binaries are available

### `expose`

```bash
beacynctl expose
```

Prints trusted exposure options (Cloudflare, NGINX, ngrok) and current endpoint URLs.

### `shell`

```bash
beacynctl shell
```

Drops into an interactive shell from app directory with env loaded.

### `reset-password`

```bash
beacynctl reset-password [--user USER] [--password VALUE]
```

Safe defaults:

- user: `Root-user`
- if password not provided, prompt interactively (hidden input)

### `maintenance`

```bash
beacynctl maintenance [on|off|status]
```

Safe default:

- `status`

### `self-test`

```bash
beacynctl self-test
```

Runs:

- validation + health checks

### `doctor`

```bash
beacynctl doctor
```

Produces a broader troubleshooting report:

- status
- validation
- disk usage
- runtime versions
- recent logs

### `version`

```bash
beacynctl version
```

Shows:

- CLI version
- app version
- service manager

### `audit`

```bash
beacynctl audit
```

Runs security and ops audit checks (including npm dependency audit when available).

### `cleanup`

```bash
beacynctl cleanup [--scope logs|cache|snapshots|all] [--yes] [--include-db]
```

Safe defaults:

- scope: `all`
- requires `--yes`
- DB cleanup requires explicit `--include-db`

### `uninstall`

```bash
beacynctl uninstall [--yes] [--keep-data] [--remove-db]
```

Safe defaults:

- refuses to run without `--yes`
- keeps DB unless `--remove-db`
- removes app directory unless `--keep-data`

## Help

```bash
beacynctl help
beacynctl --help
beacynctl -h
```

