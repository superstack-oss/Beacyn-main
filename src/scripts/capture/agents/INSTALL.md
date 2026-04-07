# PulseIQ Capture Agent Installer

Use the installer to deploy the prebuilt capture binary without exposing source or DB credentials.

## What this installer does

- Detects OS/distro/arch
- Selects the right binary (`MacOSCapture`, `RHELCapture`, `DebianCapture`, etc.)
- Installs binary to `/opt/pulseiq/agent/pulseiq-capture-agent`
- Writes API-based config to `/etc/pulseiq/agent.env`
- On Linux: creates and starts `systemd` service `pulseiq-capture-agent`

## Required env vars

- `PULSE_API_BASE_URL` (example: `https://apis.kompedia.in`)
- `PULSE_API_TOKEN` (agent ingest token)

## Optional env vars

- `PULSE_AGENT_ID` (default: host name)
- `PULSE_INTERVAL_MS` (default: `300000`)
- `PULSE_HTTP_TIMEOUT_MS` (default: `10000`)
- `PULSE_AGENT_VERSION` (default: `v2.0.0-go`)
- `PULSE_SERVICE_NAME` (default: `pulseiq-capture-agent`)
- `PULSE_RUN_USER` (default: `pulseiq-agent`)
- `PULSE_AGENT_DOWNLOAD_BASE_URL` (download URL base)
- `PULSE_AGENT_DOWNLOAD_URL` (direct binary URL)
- `PULSE_AGENT_SHA256` (optional checksum verification)
- `PULSE_AGENT_MANIFEST_URL` (release manifest URL)
- `PULSE_AGENT_MANIFEST_PATH` (local manifest.json path)

## Install (Linux/systemd)

```bash
sudo PULSE_API_BASE_URL="https://apis.kompedia.in" \
  PULSE_API_TOKEN="<token>" \
  /opt/pulseiq/agents/install-agent.sh
```

If running from this repository:

```bash
cd src/scripts/capture/agents
sudo PULSE_API_BASE_URL="https://apis.kompedia.in" \
  PULSE_API_TOKEN="<token>" \
  ./install-agent.sh
```

## Service commands

```bash
sudo systemctl status pulseiq-capture-agent
sudo systemctl restart pulseiq-capture-agent
sudo journalctl -u pulseiq-capture-agent -f
```

## Packaging releases (checksums + manifest)

From `src/scripts/capture/agents`:

```bash
./package-release.sh v2.0.0
```

This creates:

- `releases/v2.0.0/SHA256SUMS`
- `releases/v2.0.0/manifest.json`
- versioned binaries + installer script

If you have a public artifact base URL, include it:

```bash
PULSE_RELEASE_BASE_URL="https://downloads.example.com/pulseiq/agents" ./package-release.sh v2.0.0
```

Then install via manifest:

```bash
sudo PULSE_API_BASE_URL="https://apis.kompedia.in" \
  PULSE_API_TOKEN="<token>" \
  PULSE_AGENT_MANIFEST_URL="https://downloads.example.com/pulseiq/agents/v2.0.0/manifest.json" \
  ./install-agent.sh
```
