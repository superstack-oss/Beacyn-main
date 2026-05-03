# Changelog

This document tracks major product milestones, platform improvements, UI enhancements, and operational fixes delivered across the Uptime project.

---

## Release Summary

| Version | Release Date | Focus Area |
|---------|--------------|------------|
| 2.1.0 | 02 May 2026 | Infrastructure migration, Portal Audit, Status Pages, CLI, and full documentation suite |
| 2.0.5 | 29 April 2026 | Syslog and SNMP trap receiver hardening |
| 2.0.4 | 26 April 2026 | Docker and Podman containerized deployment configs |
| 2.0.3 | 22 April 2026 | Legacy agent endpoint deprecation and BSA schema foundation |
| 2.0.2 | 19 April 2026 | BeacynCTL CLI v1.0.0 |
| 2.0.1 | 16 April 2026 | AI-powered observability and enterprise dashboard polish |
| 2.0.0 | 15 April 2026 | Incident workflow, Data Center stability, and UX refinement |
| 1.8.0 | 14 April 2026 | Custom public status pages |
| 1.7.0 | 13 April 2026 | Dark mode and appearance settings |
| 1.6.0 | 12 April 2026 | ServiceNow integration |
| 1.5.0 | 10 April 2026 | Investigate / incident ticketing system |
| 1.4.0 | 09 April 2026 | PageSpeed and Lighthouse integration |
| 1.3.0 | 08 April 2026 | Notification system and SMTP settings |
| 1.2.0 | 07 April 2026 | Request Access and user invitation workflow |
| 1.1.1 | 05 April 2026 | RBAC display and permission fixes |
| 1.1.0 | 04 April 2026 | Team administration and role-based access control |
| 1.0.2 | 03 April 2026 | Port consistency and API URL stabilisation |
| 1.0.1 | 02 April 2026 | Post-launch UI and session hotfixes |
| 1.0.0 | 01 April 2026 | Initial platform foundation and core monitoring setup |
| 0.9.0 | 28 March 2026 | Syslog integration and SNMP trap receiver |
| 0.8.0 | 22 March 2026 | Data Centers and Rack Point Manager |
| 0.7.1 | 19 March 2026 | SNMP stability and v3 auth fixes |
| 0.7.0 | 17 March 2026 | SNMP device monitoring and trap receiver |
| 0.6.0 | 10 March 2026 | Infrastructure agent monitoring and server metrics |
| 0.5.1 | 05 March 2026 | Database connection pool stability |
| 0.5.0 | 01 March 2026 | MySQL schema, connection pool, and database layer |
| 0.4.1 | 25 February 2026 | Monitor check stability and HTTP redirect fix |
| 0.4.0 | 20 February 2026 | Uptime monitoring engine and asset management |
| 0.3.0 | 12 February 2026 | Overview dashboard and status components |
| 0.2.1 | 06 February 2026 | Authentication hotfixes |
| 0.2.0 | 01 February 2026 | Authentication system and login page |
| 0.1.0 | 20 January 2026 | Project scaffold and development environment |

---

## Version 2.1.0
**Release Date:** 02 May 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New

#### Portal Audit Center
- Added a unified Portal Audit Center under the Admin sidebar, providing a filterable, paginated timeline of all significant portal events: logins, logouts, configuration changes, security events, and portal health snapshots.
- Added `portal_audit_logs` table to the `pulseiq` schema with fields for event type, action, actor, target, severity, outcome, IP address, user agent, `details_json` payload, and resolution metadata.
- Added `GET /api/portal-audit` endpoint supporting server-side filtering by event type, severity, outcome, actor, and free-text search with paginated results and summary counts.
- Added `POST /api/portal-audit/system-event` for machine-to-machine audit ingestion, secured by auth token or `x-portal-monitor-key` header.
- Added `GET /api/portal-audit/:id` and `PATCH /api/portal-audit/:id/resolve` and `DELETE /api/portal-audit/:id` endpoints for record management.
- Added audit event logging to all mutating API endpoints: authentication, settings, investigation tickets, infrastructure deletes, asset CRUD, database monitors, and SNMP devices.
- Added portal security monitoring script (`npm run monitor:portal-security`) that posts frontend/backend health status and npm audit vulnerability events to the portal audit stream on a scheduled basis.
- Added Audit Details view showing the full raw `details_json` payload, portal health context (uptime, DB engine, DB space, DB signature), and all event metadata for any selected audit entry.

#### BSA Infrastructure Schema Migration
- Introduced a dedicated `bsa` database schema (controlled via `INFRA_DB_NAME`) for infrastructure server data, decoupling infra assets from the application `pulseiq` database.
- Added new `bsa` tables: `agents`, `metric_snapshots`, `disk_metrics`, `network_interfaces`, `health_events`, and `docker_container_stats`.
- Updated `/api/infra/servers` and `/api/infra/servers/:agentId` routes to query the BSA schema first and fall back to the legacy `agent_metrics` / `health_checks` tables, preserving backwards compatibility.
- Frontend infrastructure pages updated to handle both normalized BSA response shapes and legacy response shapes without breaking display.

#### Custom Public Status Pages
- Added `BroadcastPage` for creating and managing public-facing status pages backed by the new `status_pages` table.
- Public status pages are accessible via tokenized hash routes (`#broadcast/public/<token>`) and render outside the authenticated portal layout.
- Added `GET /api/status-pages/public/:token` endpoint that exposes only selected component health data — no portal authentication or internal data is exposed.

#### Agent Payload and Health API Improvements
- Unified Go monitoring agent now posts health reports to `POST /api/agents/health`; the `health_checks` table is populated API-first without requiring database credentials on the agent host.
- Backend normalizes multiple agent network payload shapes: Go agent `payload.network.<iface>` objects with an `addrs` array are handled alongside direct address arrays and strings, eliminating blank network interface rows.
- HPUX is explicitly excluded from health-check integration.

#### PageSpeed / Lighthouse Integration
- On-demand PageSpeed reports for uptime monitors now use a local Lighthouse instance via `chrome-launcher` in `src/scripts/monitorProbe.ts` as the primary execution path.
- Google PageSpeed Insights API is retained as a fallback when local Lighthouse is unavailable.
- Monitor detail view opens the Lighthouse report via local state in `WebMonitors.tsx`; the report UI lives in `PageSpeedDetails.tsx`.

#### Database Monitor Multi-Target Support
- DB agent now supports `DB_TARGETS_JSON` for specifying multiple database targets; each target becomes a persistent row in `/api/databases`.
- Without `DB_TARGETS_JSON`, the agent falls back to auto-discovery using environment-specific targets.
- UI rows are driven by the latest log row per `target_key` from `database_monitor_logs`.

#### BeacynCTL CLI Restructure
- Fully restructured `docs/beacyn-service-management.md` into three authoritative sections: **Account Setup for BeacynCTL**, **Using BeacynCTL**, and **Command Reference**.
- Account Setup section now covers: what the installer creates, the full `.beacynctl.env` config field reference, all `install-beacynctl.sh` flags, automatic PATH setup per OS/shell, manual PATH setup for macOS/Linux/Windows, background service manager behaviour per platform, and config error resolution.
- Command Reference now documents every command (`status`, `health`, `logs`, `start`, `stop`, `restart`, `open`, `config`, `env`, `backup`, `snapshot`, `migrate`, `validate`, `expose`, `shell`, `reset-password`, `maintenance`, `self-test`, `doctor`, `version`, `audit`, `cleanup`, `uninstall`, `help`) with full syntax, all flags, safe defaults, and exit codes.

### What's Changed

#### Legacy Agent Endpoint Deprecation (26 April 2026)
- Disabled three legacy PulseIQ ingest endpoints in `src/scripts/api/server.ts`: `POST /api/agents/heartbeat`, `POST /api/agents/metrics`, and `POST /api/agents/health` now return HTTP 410 Gone.
- Intent: stop writes into the legacy `pulseiq` agents and metrics tables during the BSA-first infrastructure monitoring migration.

#### Fixed Port Assignments
- Frontend dev server port locked to `7145` via `strictPort` in `vite.config.ts`.
- Backend API server port locked to `5145` in `src/scripts/server.ts`.
- API fallback URL and portal security monitor defaults updated to reflect `localhost:5145` and `localhost:7145`.

#### Installer Improvements
- macOS launchd `StandardOutPath` / `StandardErrorPath` now writes to `$HOME/.beacyn/logs` for non-root installs, fixing `EX_CONFIG` launch failures caused by attempting to write to `/var/log` without root permission.
- Installer now verifies that `src/scripts/start.ts` exists in the cloned repo before registering the service, preventing a class of service-registration-succeeds-but-runtime-fails failures.
- `NODE_ENV=production` start path now enforces that `npm run build` is run during installation to produce a `dist/` directory before `vite preview` is invoked.

### What's Fixed
- Auth session persistence: sessions are now backed by signed tokens so admin sessions survive backend restarts; previously, in-memory session storage caused all CRUD operations to return 401 after any restart.
- Data center edit flow: editing a data center using the `:edit` navigation suffix now correctly syncs `isEditing` state and normalizes back to the clean ID after save or cancel, eliminating stale-state bugs where edits appeared to save but were not reflected.

### Documentation
Added a comprehensive 14-file documentation suite covering all major platform areas:

| File | Coverage |
|---|---|
| `docs/portal-user-guide.md` | End-user guide: navigation, overview, monitors, and portal workflows |
| `docs/architecture.md` | System architecture: frontend, backend, databases, agents, and data flow |
| `docs/installation.md` | Full installation guide for macOS, Linux, and Docker |
| `docs/quickstart-api-reference.md` | REST API quick-start and endpoint reference |
| `docs/uptime-monitors.md` | Uptime monitor types, configuration, and check intervals |
| `docs/page-speed.md` | PageSpeed / Lighthouse integration and report interpretation |
| `docs/infrastructure-monitoring.md` | Infrastructure agent setup, BSA schema, and server metrics |
| `docs/database-monitoring.md` | Database agent configuration, multi-target setup, and metrics |
| `docs/investigate.md` | Investigate page: ticket lifecycle, work notes, and activity history |
| `docs/health-checks.md` | Health check configuration and alert thresholds |
| `docs/status-page.md` | Public status page creation and token-based sharing |
| `docs/data-centers.md` | Data center management: create, edit, and assign rack points |
| `docs/rack-management.md` | Rack Point Manager: hardware tracking per data center |
| `docs/team-administration.md` | User management, roles (superuser/admin/viewer), and access control |
| `docs/beacyn-service-management.md` | BeacynCTL CLI: setup, usage, and full command reference |
| `docs/admin-portal.md` | Admin portal: Settings, Inventory, and Portal Audit Center |

---

## Version 2.0.5
**Release Date:** 29 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added SNMP trap event correlation to the infrastructure health view, linking incoming trap PDUs to their source device entry in the SNMP device registry.
- Structured syslog event filtering API now supports querying by facility, severity level, and source host.

### What's Changed
- Improved SNMP trap receiver startup sequence to bind correctly on Linux hosts where the process does not run as root, using socket reuse options instead of requiring privileged port assignment.
- Updated syslog parser to handle RFC 3164 (BSD syslog) and RFC 5424 (IETF syslog) message formats simultaneously in the same ingest stream.

### What's Fixed
- Fixed SNMP trap receiver silently dropping packets when the source OID was not present in the known device registry — unknown OIDs are now stored with a `generic` device tag.
- Corrected a race condition in the syslog ingestion buffer that caused duplicate event rows under high message volume from verbose syslog senders.

---

## Version 2.0.4
**Release Date:** 26 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added Docker Compose deployment configuration in `deployment/docker/` with services for the Beacyn app, MySQL 8, and an NGINX reverse proxy.
- Added Podman support in `deployment/podman/` via a `Containerfile` and `podman-compose.yml` for rootless container deployments.
- Added NGINX reverse proxy configs in `deployment/docker/nginx/` and `deployment/podman/nginx/` routing external traffic to the frontend and backend.
- Added MySQL container init scripts in `deployment/docker/mysql-init/` and `deployment/podman/mysql-init/` that bootstrap the `pulseiq` and `bsa` schemas automatically on first container start.
- Added `deployment/docker/README.md` and `deployment/podman/README.md` with step-by-step container deployment instructions, environment variable reference, and port mapping tables.

### What's Changed
- Updated `docs/docker.md` and `docs/podman.md` with accurate container topology, port mappings, and volume configuration.
- `docker-entrypoint.sh` and `podman-entrypoint.sh` now wait for MySQL readiness before starting the Node.js process.

### What's Fixed
- Fixed NGINX configuration missing `proxy_set_header Host` and `X-Forwarded-Proto` entries, which caused the backend to construct incorrect redirect URLs.
- Fixed Docker build stage not copying `bin/` directory, leaving `beacynctl` absent from the container image.

---

## Version 2.0.3
**Release Date:** 22 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Introduced the dedicated `bsa` MySQL schema for infrastructure asset storage, controlled via the `INFRA_DB_NAME` environment variable, decoupling infra data from the `pulseiq` application database.
- Added `bsa` tables: `agents`, `metric_snapshots`, `disk_metrics`, `network_interfaces`, `health_events`, and `docker_container_stats`.
- Backend `/api/infra/servers` and `/api/infra/servers/:agentId` routes now query the BSA schema first and fall back to the legacy `pulseiq` tables, preserving full backwards compatibility with existing agent deployments.

### What's Changed
- Deprecated `POST /api/agents/heartbeat`, `POST /api/agents/metrics`, and `POST /api/agents/health` — all three now return **HTTP 410 Gone** to stop writes into the legacy `pulseiq` agent tables during the BSA-first migration.
- Infrastructure frontend pages updated to handle both normalized BSA response shapes and legacy response shapes without layout breakage.
- `db/bsa_schema.sql` updated with all new BSA tables and indices.

### What's Fixed
- Fixed infrastructure detail view showing blank network interface rows when the Go monitoring agent posted `payload.network.<iface>` objects with nested `addrs` arrays rather than flat address strings — backend now normalizes both shapes.

---

## Version 2.0.2
**Release Date:** 19 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Released **BeacynCTL v1.0.0** — a management CLI for Beacyn platform day-to-day operations.
- CLI binary placed at `<INSTALL_DIR>/bin/beacynctl`, implemented in `src/scripts/cli/beacynctl.sh`.
- Added `src/scripts/cli/install-beacynctl.sh` installer supporting `launchd` (macOS), `systemd` (Linux), and `nohup` (fallback) service managers.
- Runtime config generated at `src/scripts/cli/.beacynctl.env` with `chmod 600` permissions during install.
- Initial command set: `status`, `health`, `logs`, `start`, `stop`, `restart`, `open`, `backup`, `snapshot`, `config`, `env`, `validate`, `doctor`, `self-test`, `reset-password`, `maintenance`, `migrate`, `expose`, `shell`, `audit`, `cleanup`, `uninstall`, `version`, `help`.
- Automatic PATH setup for macOS zsh (`~/.zshrc`), Linux bash (`~/.bashrc`), and Windows PowerShell user PATH via `--auto-path` installer flag or `BEACYNCTL_AUTO_PATH=true` environment variable.
- `backup` command dumps both `pulseiq` and `bsa` databases with a `--schema-only` safe default.
- `snapshot` command creates a support bundle (status JSON, log tails, sanitised env file) as a `.tar.gz` archive.

### What's Changed
- macOS launchd `StandardOutPath` / `StandardErrorPath` corrected to `$HOME/.beacyn/logs` to avoid `EX_CONFIG` launch failures on non-root installs that cannot write to `/var/log`.
- Installer now validates that `src/scripts/start.ts` exists in the cloned repository before registering the service.
- `NODE_ENV=production` start path now enforces that `npm run build` has been run to produce a `dist/` directory before `vite preview` is invoked.

### What's Fixed
- Fixed `beacynctl` binary not being executable after copy from the source script directory.
- Fixed `--auto-path` writing duplicate export lines when the installer was re-run against an existing installation.

---

## Version 2.0.1
**Release Date:** 16 April 2026  
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Introduced a more professional, enterprise-ready Observability dashboard.
- Added a full-width AI Insight experience with improved visual hierarchy and better executive readability.
- Added structured observability sections for signal breakdown, source health, and issue prioritization.
- Added a formal changelog document to support ongoing release tracking.

### What's Changed
- Refined the Observability page to align with the visual style of the Overview and Investigate screens.
- Improved card design, spacing, section order, and top-level dashboard presentation.
- Reworked AI summary rendering so headers, sections, and bullet points display in a clean readable format instead of raw text blocks.

### What's Fixed
- Corrected formatting issues in AI-generated summary content.
- Improved consistency across UI components to better match the product design language.
- Cleaned up page presentation for better executive review and operations visibility.

---

## Version 2.0.0
**Release Date:** 15 April 2026  
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added a ServiceNow-style investigation workflow to the ticketing experience.
- Introduced ticket lifecycle states including In progress, ServiceNow, Canceled, Resolved, and Closed Un-resolved.
- Added persistent activity history and work-note tracking for investigation tickets.
- Added improved incident detail layout with workflow controls and activity stream visibility.

### What's Changed
- Redesigned the Investigate page into a more compact, professional ticket operations interface.
- Improved sidebar navigation behavior, default expansion states, text sizing, and section ordering.
- Enhanced the overall user experience for incident review and operational follow-up.

### What's Fixed
- Resolved Data Center update issues where edits were not reliably reflected in the UI and database.
- Fixed session/auth persistence problems that caused save actions to fail after backend restarts.
- Corrected resolved-ticket workflow behavior and improved data refresh reliability.

---

## Version 1.8.0
**Release Date:** 14 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added `BroadcastPage` for creating and managing public-facing status pages, backed by a new `status_pages` table in `pulseiq`.
- Each status page has a generated secure share token; public URLs use tokenized hash routes (`#broadcast/public/<token>`) and render outside the authenticated portal layout with no sidebar.
- Added `GET /api/status-pages/public/:token` endpoint that exposes only selected component health data — no portal authentication state or internal data is included in the response.
- Admins can select which monitors are represented on a public page and set a custom page title and description.
- Added `POST /api/status-pages`, `GET /api/status-pages`, `PATCH /api/status-pages/:id`, and `DELETE /api/status-pages/:id` endpoints for status page management.

### What's Changed
- Sidebar navigation updated with a Broadcast / Status Pages link under the Admin section.

### What's Fixed
- Fixed a hash-route conflict where navigating to a public status page URL while already logged in would briefly flash the authenticated portal layout before rendering the public page.

---

## Version 1.7.0
**Release Date:** 13 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Full **dark mode** support across all portal pages using Tailwind CSS `dark:` variants.
- Theme toggle added to the Settings page (`light` / `dark`).
- Theme selection is persisted to the backend settings API and restored on next login without requiring a page reload.

### What's Changed
- All card, table, badge, input, and sidebar components updated to include correct `dark:` class variants.
- Recharts chart grid lines, axis tick labels, and tooltip backgrounds updated for dark mode legibility.

### What's Fixed
- Fixed popover and dropdown menu backgrounds rendering as transparent in dark mode on Safari.
- Corrected chart tooltip text appearing black-on-dark-background when the portal was in dark mode.

---

## Version 1.6.0
**Release Date:** 12 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **ServiceNow integration** to the Settings page: instance URL, API username, API token, and assignment group configuration.
- Investigation tickets can be escalated to ServiceNow, automatically creating an incident in the configured instance.
- New ticket lifecycle state `ServiceNow` added to indicate active sync with an external ITSM system.
- Ticket detail view displays the ServiceNow incident number once synchronisation is confirmed.

### What's Changed
- ServiceNow settings section is restricted to `admin` and `superuser` roles; `viewer` accounts do not see the section.
- API token field masked in the Settings UI with a show/hide toggle.

### What's Fixed
- Fixed ServiceNow API call failing when the configured instance URL included a trailing slash.
- Corrected incident creation payload sending an undefined assignment group when the field was left blank.

---

## Version 1.5.0
**Release Date:** 10 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added the **Investigate** page for structured incident ticket management.
- Tickets can be created manually from the Investigate page or directly from an active monitor alert on the Overview.
- Full ticket lifecycle: `Open` → `In Progress` → `ServiceNow` / `Canceled` → `Resolved` / `Closed Unresolved`.
- Persistent work-note activity stream per ticket for team collaboration and audit trail.
- Ticket list supports filtering by state, severity, and free-text search across title and description.
- Added `GET /api/investigate`, `POST /api/investigate`, `PATCH /api/investigate/:id`, and `POST /api/investigate/:id/notes` endpoints.

### What's Changed
- Overview page alert list updated to include a direct **Open Ticket** action for any active alert.

### What's Fixed
- Fixed ticket creation form not clearing input fields after a successful save.
- Corrected pagination not resetting to page 1 when the ticket list filter changed.

---

## Version 1.4.0
**Release Date:** 09 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added on-demand **PageSpeed / Lighthouse** reports for HTTP(S) uptime monitors.
- Local Lighthouse execution via `chrome-launcher` in `src/scripts/monitorProbe.ts` is the primary execution path.
- Google PageSpeed Insights API retained as a fallback when local Lighthouse is not available.
- `PageSpeedDetails` page displays score categories (Performance, Accessibility, Best Practices, SEO), individual audit results, and a list of improvement opportunities.
- Report is triggered from the monitor detail sheet and opens inline without leaving the current page.

### What's Changed
- HTTP(S) monitor detail sheet updated with a **Run PageSpeed** action button.

### What's Fixed
- Fixed Lighthouse child process not terminating Chrome instances cleanly on report timeout, causing zombie Chrome processes to accumulate.
- Corrected PageSpeed score display showing `NaN` when the Lighthouse audit returned no numeric score for a category.

---

## Version 1.3.0
**Release Date:** 08 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **SMTP configuration** to Settings: host, port, username, password, from address, and TLS mode (`starttls` / `tls` / `none`).
- Email alert delivery on monitor downtime and recovery events.
- **Downtime-only mode**: when enabled, recovery emails are suppressed and only downtime notifications are sent.
- Alert email address field for configuring the notification destination.

### What's Changed
- Backend picks up SMTP settings from the database at runtime; no environment variable change or server restart is required after updating SMTP config.
- SMTP settings section is restricted to `admin` and `superuser` roles.

### What's Fixed
- Fixed alert emails being dispatched for monitors in `Paused` state.
- Corrected email subject line not including the monitor name when the display name contained special characters.

---

## Version 1.2.0
**Release Date:** 07 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **Request Access** form on the login page for users who do not yet have a portal account.
- Admin approval workflow: submitted access requests appear in a pending list under the Admin section.
- `POST /api/access-requests` and `PATCH /api/access-requests/:id/approve` endpoints added.
- On approval, the user account is created and — if SMTP is configured — a welcome email with login credentials is sent.
- Optional **email domain restriction** in Settings: admins can limit new registrations to specific domains (e.g., `company.com`), with add/remove controls and inline domain format validation.

### What's Changed
- Login page updated with a `Request Access` secondary action link below the sign-in form.

### What's Fixed
- Fixed the approval flow creating duplicate user accounts when the admin double-clicked the Approve button.

---

## Version 1.1.1
**Release Date:** 05 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Fixed
- Fixed role badge not updating immediately in the user list after an admin edited a user's role — the list now re-fetches after each successful role change.
- Corrected `viewer`-role users seeing admin-only sidebar items (Data Centers, Team, Audit) that should have been hidden by role gate.
- Fixed user delete confirmation dialog not dismissing after a successful deletion, leaving a stale empty row in the table.
- Corrected `superuser` role label displaying as `undefined` in the role badge component due to a missing case in the label map.

---

## Version 1.1.0
**Release Date:** 04 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **Team Administration** page under the Admin sidebar section for managing portal users.
- Full user CRUD: `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`.
- Role-based access control with three tiers: `superuser`, `admin`, and `viewer`.
- Role badges displayed on user list rows and in the authenticated user header.
- Only `superuser` accounts can promote other users to `admin` or `superuser`.

### What's Changed
- Sidebar navigation items for Data Centers, Settings, Team, and Audit are now gated behind `admin` / `superuser` role checks; `viewer` accounts see a read-only portal.
- API routes for settings and user management validate the caller's role from the active session before responding.

### What's Fixed
- Fixed newly created user accounts defaulting to no role, which caused 403 errors on every page load for those accounts.

---

## Version 1.0.2
**Release Date:** 03 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Changed
- Locked the frontend dev server to port `7145` via `strictPort: true` in `vite.config.ts`, preventing silent fallback to port 7146 or higher when the intended port was already occupied.
- Locked the backend API server to port `5145` in `src/scripts/server.ts`.
- Updated all `localhost` URL references in `src/lib/api.ts` to use the canonical `5145` / `7145` ports.
- Portal security monitor script defaults updated to `http://localhost:5145` and `http://localhost:7145`.

### What's Fixed
- Fixed API requests silently succeeding against a stale backend instance on a different port when the intended port was occupied by another process.

---

## Version 1.0.1
**Release Date:** 02 April 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Fixed
- Fixed sidebar active route highlight not updating when navigating between top-level pages — the active state now derives from the current route string on every render.
- Corrected timestamp display inconsistency when the server's system timezone differed from the browser's local timezone; all displayed timestamps now use the stored `display_timezone` setting.
- Fixed a brief empty-state flash on the Overview page before the first data fetch completed — a loading skeleton is now shown instead.
- Corrected logout not clearing the local auth token from `localStorage`, which allowed stale sessions to appear valid across browser restarts.

---

## Version 1.0.0
**Release Date:** 01 April 2026  
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Established the initial Uptime platform foundation using React, TypeScript, Vite, Express, and MySQL.
- Added core monitoring pages and operational modules for Overview, Infrastructure, Inventory, Database, Agents, and Settings.
- Added backend monitoring APIs, database initialization scripts, and capture/agent utilities for infrastructure visibility.
- Introduced the baseline UI framework and component library for consistent application design.

### What's Changed
- Built the first navigation structure and application shell for day-to-day operational workflows.
- Set up periodic health and monitoring collection patterns across platform services.
- Defined the base architecture used for later enterprise dashboards and incident workflows.

### What's Fixed
- Initial release focused on foundation delivery and core platform readiness.

---

## Notes
- This file should be updated for every notable feature release, UI refresh, workflow enhancement, or bug fix.
- Future entries should continue using the same format: Version, Release Date, What's New, What's Changed, What's Fixed, and Contributors.

---

## Version 0.9.0
**Release Date:** 28 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added a **Syslog receiver** listening on UDP port `5514`, storing incoming syslog events to the database for later querying.
- Syslog parser supports RFC 3164 (BSD syslog) and RFC 5424 (IETF syslog) simultaneously; facility and severity codes are parsed and stored with every event.
- Added an **SNMP trap receiver** on UDP port `9162` that captures trap PDUs from network devices and correlates them to registered SNMP device entries.
- Added `docs/syslog-integration.md` covering UDP receiver configuration, firewall requirements, and the syslog event query API.

### What's Changed
- Backend startup sequence now initialises the syslog and SNMP trap UDP listeners alongside the HTTP API server.

### What's Fixed
- Fixed syslog receiver discarding events when the sender omitted the hostname field from the message header.

---

## Version 0.8.0
**Release Date:** 22 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **Data Centers** page with full CRUD: create, view, edit, and delete data center records (name, location, description, contact information).
- Added **Rack Point Manager** within each data center for tracking physical hardware slot assignments.
- `DataCenterForm` component with client-side validation for required fields.
- Added `bsa_schema.sql` containing the `data_centers` and `rack_points` tables.
- Backend endpoints: `GET/POST /api/datacenters`, `GET/PATCH/DELETE /api/datacenters/:id`, and nested rack point sub-routes.

### What's Changed
- Main navigation sidebar updated with a Data Centers section, visible to `admin` and `superuser` roles.

### What's Fixed
- Fixed the data center creation form allowing empty names to be submitted when the user cleared the pre-filled placeholder text.

---

## Version 0.7.1
**Release Date:** 19 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Fixed
- Fixed SNMPv3 authentication failing on devices using SHA-256 or SHA-512 auth protocols — the SNMP library engine ID discovery step is now completed before credential negotiation.
- Corrected SNMP device status not updating between scheduled polls when the previous poll result was inadvertently cached in memory.
- Added community string input masking in the SNMP device form so credentials are not visible in the browser's form autofill memory.
- Fixed SNMP poll response timeout not resetting correctly between retry attempts, causing each subsequent attempt to fail faster than the configured timeout.

---

## Version 0.7.0
**Release Date:** 17 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **SNMP device monitoring** supporting SNMP v2c (community string) and v3 (SHA/MD5 authentication, AES/DES privacy encryption).
- SNMP device form added to the Inventory page under the `snmp` scope with all v2c and v3 credential fields.
- `snmp_devices` table stores device configuration; poll results stored in `snmp_poll_results`.
- On-demand poll endpoint: `POST /api/snmp/devices/:id/poll`, returning interface counters, storage utilisation, and device uptime OID values.
- Storage and SAN device type categories defined for inventory classification.
- UI auto-refreshes SNMP device connectivity status every 60 seconds.

### What's Changed
- Inventory page refactored to support multiple display scopes: `all`, `uptime`, `snmp`, and `agent` — each filtering to the relevant asset type.

### What's Fixed
- Fixed the device list not reflecting newly added SNMP devices without a manual page refresh.

---

## Version 0.6.0
**Release Date:** 10 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added **infrastructure monitoring** with an agent-based architecture for server observability.
- Agent heartbeat endpoint `POST /api/agents/heartbeat` for registering host presence.
- Metrics ingestion endpoint `POST /api/agents/metrics` accepting CPU, memory, disk, and network interface data.
- `agent_metrics` and `health_checks` tables added to the `pulseiq` schema.
- Infrastructure page displaying server cards with live CPU, memory, and disk utilisation.
- Agent last-seen staleness detection: hosts not seen within 2 minutes are shown as `Offline`.
- UI auto-refreshes agent connectivity status every 30 seconds.

### What's Changed
- Sidebar updated with an Infrastructure section linking to the server metrics page.

### What's Fixed
- Fixed health check status not populating when the agent posted metrics payloads without a preceding heartbeat registration.

---

## Version 0.5.1
**Release Date:** 05 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Fixed
- Fixed MySQL connection pool exhaustion under concurrent uptime monitor check bursts — pool size increased and idle connection timeout reduced.
- Added connection acquire retry with exponential backoff; API requests no longer fail immediately when all pool connections are briefly in use.
- Corrected `NULL` uptime percentage values returned when a monitor had no successful checks within the lookback window — queries now return `0` instead of `NULL` in that case.
- Fixed the database initialisation script failing silently when run against an already-initialised schema; DDL statements now use `CREATE TABLE IF NOT EXISTS` guards throughout.

---

## Version 0.5.0
**Release Date:** 01 March 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added MySQL 8 integration via the `mysql2/promise` connection pool in `src/lib/db.ts`.
- Defined `db/pulseiq_schema.sql` with the initial application tables: `users`, `sessions`, `assets`, `asset_logs`, `settings`, and `access_requests`.
- Added `src/scripts/initDb.ts` migration and seed script runnable via `npm run initdb`.
- Backend performs a database connectivity check on startup and logs a clear error message if the connection fails, rather than crashing silently.

### What's Changed
- All API endpoints that previously returned static in-memory mock data now read from and write to MySQL.
- Environment variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` documented in `.env.example`.

### What's Fixed
- Fixed seed script inserting duplicate seed rows on repeated runs by using `INSERT IGNORE` guards.

---

## Version 0.4.1
**Release Date:** 25 February 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Fixed
- Fixed HTTP check recording a `down` result for monitors that return 3xx redirects — the check now follows redirect chains up to 5 hops and evaluates the final status code.
- Corrected Ping timeout handling on unresponsive hosts where the check process would hang indefinitely instead of failing after the configured timeout interval.
- Fixed asset status column not transitioning to `Up` after the first successful check following a sustained `Down` period.
- Corrected uptime percentage calculation producing values above 100% when check log timestamps contained minor clock skew between the monitoring server and the database host.

---

## Version 0.4.0
**Release Date:** 20 February 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added the **uptime monitoring engine** running Ping and HTTP(S) check types on a 60-second periodic loop against all active assets.
- `assets` and `asset_logs` tables for storing monitor definitions and per-check history.
- `ServicesTable` component displaying monitor name, status badge, uptime percentage, and time of last check.
- `UptimeChartCard` with a Recharts sparkline of recent check results (up / down / degraded).
- `ResponseTrend` component showing average response time over the trailing 24-hour window.
- Inventory page with an asset add form covering monitor type, device category, name, target endpoint, and environment.
- CSV bulk import (with downloadable template) and CSV export of the full inventory.
- Asset suspend / resume: monitors can be set to `Paused` state to stop checks without deleting the record.
- Docker monitor type added for tracking container health alongside network endpoints.

### What's Changed
- Sidebar navigation updated with an Uptime Monitors link.

### What's Fixed
- Initial release of the monitoring engine — no prior bugs to address.

---

## Version 0.3.0
**Release Date:** 12 February 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added the **Overview dashboard** as the default landing page after login.
- Summary metric cards: total monitors, monitors up / down / paused, and active incident count.
- `StatusGauge` component with an arc-style gauge showing overall platform health as a percentage.
- `StatusBadge` component for consistent `Up` / `Down` / `Degraded` / `Paused` display across the portal.
- `AnnouncementBanner` component for operator-published notices pinned to the top of the portal.
- `ClockCard` showing current time in the configured display timezone.
- `HeroSection` presenting the portal title, app version, and platform uptime summary.
- `ServiceDetailsSheet` slide-out panel for per-monitor detail without leaving the Overview page.

### What's Changed
- Successful login now redirects to the Overview page instead of a blank placeholder.

### What's Fixed
- Fixed the Overview loading spinner not dismissing when the initial API fetch returned an empty result set.

---

## Version 0.2.1
**Release Date:** 06 February 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's Fixed
- Fixed session token not being cleared from `localStorage` on explicit logout, allowing stale authentication to persist across browser restarts.
- Corrected an infinite redirect loop that occurred when a user navigated directly to a protected route with an expired session token.
- Fixed `AuthFooter` link text overflowing its container on narrow mobile viewports.
- Corrected `POST /api/auth/logout` returning HTTP 500 when called without an active session — it now returns 200 unconditionally.

---

## Version 0.2.0
**Release Date:** 01 February 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added a complete **authentication system**: login, session management, and logout.
- `LoginForm` component with email and password fields, input validation, and inline error display.
- `AnimatedGlobe` visual on the login page for brand identity.
- `AuthHeader` and `AuthFooter` components forming the unauthenticated layout shell.
- Backend auth endpoints: `POST /api/auth/login` (returns Bearer token) and `POST /api/auth/logout`.
- `sessions` table in MySQL storing Bearer tokens with a 24-hour TTL; expired sessions are purged on login.
- All portal API routes protected by `Authorization: Bearer <token>` header validation middleware.
- `RequestAccessForm` and `ResetPasswordForm` components added (UI scaffolding only; backend integration in a later release).

### What's Changed
- All portal routes now redirect unauthenticated users to the login page.

### What's Fixed
- Initial implementation — no prior authentication to compare against.

---

## Version 0.1.0
**Release Date:** 20 January 2026
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Initialised the **Beacyn** (Uptime) project repository.
- React 19 + TypeScript + Vite 8 frontend scaffold with `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.server.json`.
- Tailwind CSS v4 integrated via the `@tailwindcss/vite` plugin; `components.json` configured for shadcn-style component generation.
- Base UI component library: `button`, `card`, `badge`, `input`, `label`, `select`, `table`, `tabs`, `sheet`, `dropdown-menu`, `skeleton`.
- Express 5 backend skeleton in `src/scripts/api/server.ts` with a root health endpoint returning `{ status: "ok" }`.
- Base utility modules: `src/lib/utils.ts`, `src/lib/api.ts`, `src/lib/auth.ts`.
- `MainLayout` with a responsive collapsible sidebar and top navigation header.
- ESLint configuration (`eslint.config.js`) with TypeScript and React plugin rules.
- `package.json` scripts: `dev`, `build`, `preview`, `server`, `start`, `initdb`, `lint`.

### What's Changed
- First commit — no prior state to compare against.

### What's Fixed
- First commit — no prior bugs to address.
