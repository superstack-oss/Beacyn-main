# Admin Portal — Settings, Inventory, and Audit

This document covers the three admin-only areas of the Beacyn portal: **Settings**, **Inventory**, and **Portal Audit**. All three sections are restricted to users with the `admin` or `superuser` role, with the exception of personal display preferences in Settings which are available to all authenticated users.

---

## Table of Contents

- [Settings](#settings)
  - [Display Timezone](#display-timezone)
  - [Appearance](#appearance)
  - [Notifications](#notifications)
  - [ServiceNow Integration](#servicenow-integration)
  - [SMTP / Email](#smtp--email)
  - [AI Integrations](#ai-integrations)
  - [Security](#security)
  - [Email Domain Restriction](#email-domain-restriction)
  - [Saving and Resetting Settings](#saving-and-resetting-settings)
- [Inventory](#inventory)
  - [Inventory Scopes](#inventory-scopes)
  - [Adding Assets (Uptime Scope)](#adding-assets-uptime-scope)
  - [Adding SNMP Devices](#adding-snmp-devices)
  - [Managing Existing Records](#managing-existing-records)
  - [Filtering and Search](#filtering-and-search)
  - [CSV Export and Bulk Import](#csv-export-and-bulk-import)
  - [Auto-Refresh](#auto-refresh)
- [Portal Audit](#portal-audit)
  - [Summary Cards](#summary-cards)
  - [Database Health Widget](#database-health-widget)
  - [Filtering Audit Events](#filtering-audit-events)
  - [Audit Log Table](#audit-log-table)
  - [Resolving and Deleting Entries](#resolving-and-deleting-entries)
  - [Audit Details View](#audit-details-view)

---

## Settings

**Source**: `src/pages/main/admin/SettingsPage.tsx`

The Settings page persists configuration to the backend via `PUT /api/settings`. On page load, current values are fetched from `GET /api/settings` and applied to the UI. Settings are scoped: display preferences (timezone, appearance) are available to all users; all other sections require `admin` or `superuser` role.

### Display Timezone

Controls the timezone used to display all dates and times across Beacyn, including the clock in the navigation bar and timestamps in all tables and charts.

| Option | Description |
|---|---|
| UTC | UTC +0 |
| US East | America/New_York — UTC −5/−4 |
| US West | America/Los_Angeles — UTC −8/−7 |
| Europe | Europe/London — UTC +0/+1 |
| Asia/Mumbai | Asia/Kolkata — UTC +5:30 |
| Asia/Tokyo | Asia/Tokyo — UTC +9 |
| Australia | Australia/Sydney — UTC +10/+11 |

The selected timezone is persisted locally so that the main layout clock updates immediately without waiting for a server round-trip.

**Default**: `Asia/Kolkata`

### Appearance

| Setting | Options | Default |
|---|---|---|
| Theme mode | `light` / `dark` | `light` |
| Language | `en` (English) | `en` |

Theme changes take effect immediately across the portal. The theme value is written to the DOM so that Tailwind dark-mode classes apply without a page reload.

### Notifications

> **Admin only**

Configure alert delivery to an email address when monitors go down or recover.

| Field | Description |
|---|---|
| Email alerts | Enable / disable email notifications |
| Downtime only | When enabled, only send alerts on downtime — suppress recovery emails |
| Alert email | Destination email address for all notifications |

### ServiceNow Integration

> **Admin only**

Connects Beacyn alert events to a ServiceNow instance for automatic incident creation.

| Field | Description |
|---|---|
| Instance URL | Your ServiceNow instance URL (e.g., `https://yourcompany.service-now.com`) |
| API user | ServiceNow username for API authentication |
| API token | Password or OAuth token (masked in the UI) |
| Assignment group | ServiceNow group that incidents are assigned to |

### SMTP / Email

> **Admin only**

Configure the outbound mail server used to send alert emails, password reset links, and access request notifications.

| Field | Default | Description |
|---|---|---|
| SMTP host | — | Mail server hostname |
| SMTP port | `587` | Server port |
| SMTP user | — | Authentication username |
| SMTP password | — | Authentication password (masked) |
| From address | — | Sender email address |
| TLS mode | `starttls` | `starttls`, `tls`, or `none` |

### AI Integrations

> **Admin only**

Enables AI-powered features in the portal, such as the Investigate page root-cause analysis.

| Field | Default | Description |
|---|---|---|
| AI enabled | `false` | Master toggle for all AI features |
| Provider | `openai` | `openai`, `google`, or `custom` |
| Model | `gpt-4.1-mini` | Model identifier sent in API requests |
| Base URL | — | Custom base URL for self-hosted or proxy endpoints |
| API key | — | Provider API key (masked in the UI) |

When `Provider` is set to `google`, Beacyn uses the Gemini API via `src/observability/ai/gemini.ts`.

### Security

> **Admin only**

| Field | Default | Description |
|---|---|---|
| Session timeout | `60` minutes | How long an idle session remains valid before expiry |
| MFA required | `false` | Require multi-factor authentication for all logins |

### Email Domain Restriction

> **Admin only**

Controls which email domains are permitted to register accounts through the Request Access form.

| Setting | Description |
|---|---|
| Allow all domains | When enabled, any email domain may request access |
| Allowed domains | When domain restriction is active, only addresses from these domains may register |

**Adding a domain**: Type the domain (e.g., `company.com`) and press **Enter** or click **Add**. Leading `@` characters are stripped automatically. Invalid or duplicate domains are rejected with an inline error.

**Removing a domain**: Click the × badge next to any domain in the list.

### Saving and Resetting Settings

**Save**: Click **Save Settings** to persist all changes via `PUT /api/settings`. A confirmation toast appears at the bottom-right of the screen for 2.5 seconds.

**Reset to defaults**: Click **Reset to Defaults** to open the confirmation prompt. Admins can choose whether to also reset admin-only settings (notifications, SMTP, integrations, security). Non-admin resets only affect display timezone, appearance, and language. Calls `POST /api/settings/reset`.

---

## Inventory

**Source**: `src/pages/main/InventoryPage.tsx`

The Inventory page lists all monitored assets and infrastructure devices registered in Beacyn. It is rendered in four scopes, each filtering the data to a specific asset type:

### Inventory Scopes

| Scope | What It Shows |
|---|---|
| `all` | Every asset across all types |
| `uptime` | Uptime monitors (Ping, HTTP(S), Docker, Port, Game, gRPC, WebSocket, API Endpoint) |
| `snmp` | SNMP-polled network/storage devices |
| `agent` | Hosts running the Beacyn monitoring agent |

The scope is set by the parent route and cannot be changed from within the page.

### Adding Assets (Uptime Scope)

Available when `scope === 'uptime'`. Fill in the **Add Asset** form and submit:

| Field | Description |
|---|---|
| Monitor type | `Ping`, `HTTP(S)`, `Docker`, `Port`, `Game`, `gRPC`, `WebSocket`, `API Endpoint` |
| Device category | Sub-type list filtered by monitor type (e.g., `Website` for HTTP(S), `Server`/`VM`/`Storage`… for Ping) |
| Name | Display name for the asset |
| Endpoint | Target URL or IP address |
| Port / Host | For Port-type monitors: hostname and port number |
| Environment | `Production`, `Staging`, or `Development` |

Assets are saved to the backend via the assets API and immediately appear in the list.

**Bulk import via CSV**: Download the template (Name, Monitor Type, Device Category, Endpoint, Environment), fill it in, and upload via the file picker. Each row is validated and submitted individually; rows with errors are skipped with a logged warning.

### Adding SNMP Devices

Available when `scope === 'snmp'`. SNMP v2c and v3 are supported:

| Field | Default | Description |
|---|---|---|
| Name | — | Display label for the device |
| Vendor | — | Hardware vendor (free text) |
| Host | — | IP address or hostname |
| Port | `161` | UDP port for SNMP queries |
| SNMP version | `2c` | `2c` or `3` |
| Device type | `storage` | `storage` or `san` |
| Community (v2c) | `public` | Community string |
| Username (v3) | — | SNMPv3 security username |
| Auth protocol (v3) | `SHA` | `SHA` or `MD5` |
| Auth key (v3) | — | Authentication passphrase |
| Privacy protocol (v3) | `AES` | `AES` or `DES` |
| Privacy key (v3) | — | Privacy passphrase |

After saving, you can immediately trigger an on-demand SNMP poll using the **Poll** action in the row menu.

### Managing Existing Records

Each row in the inventory table has an action menu with the following options depending on scope:

| Action | Availability | Description |
|---|---|---|
| Poll (SNMP) | SNMP scope | Trigger an immediate SNMP poll against the device |
| Suspend / Resume | Uptime scope | Pause or resume active monitoring for the asset |
| Delete | All scopes | Remove the asset and all its related data (requires confirmation) |

Deletion is permanent and removes all associated check history.

### Filtering and Search

| Control | Description |
|---|---|
| Search box | Filters by name, ID, agent name, hostname, type, endpoint, environment, status, or source |
| Source filter | `All`, `User Added`, or `Auto Detected` |

Results update in real time as you type. Pagination resets to page 1 whenever the search or source filter changes.

**Pagination**: 10 assets per page. Page controls appear at the bottom of the table.

### CSV Export and Bulk Import

**Export**: Click **Download CSV** to export the current filtered result set. The columns exported differ by scope:

- **Uptime / All**: Asset ID, Name, Type, Sub-Type, Target/Endpoint, Environment, Source, Status, Last Checked
- **Agent scope**: Asset ID, Hostname, Agent Name, Target/Endpoint, Type, Status, Last Checked

The file is named `pulseiq-inventory-<YYYY-MM-DD>.csv`.

**Bulk import**: Upload a CSV file with columns: `Name`, `Monitor Type`, `Device Category`, `Endpoint`, `Environment`. Download the template from the page for the correct format.

### Auto-Refresh

The inventory list auto-refreshes connectivity status in the background:

| Scope | Refresh interval |
|---|---|
| SNMP | Every 60 seconds |
| Agent | Every 30 seconds |
| Others | No background refresh (manual only) |

Use the **Refresh** button to force an immediate reload. The "Last refreshed" timestamp is shown next to the button.

**Agent online threshold**: An agent is considered `Online` if it sent a heartbeat within the last **2 minutes**. Beyond that window it is shown as `Offline` regardless of the status value stored in the database.

---

## Portal Audit

**Source**: `src/pages/main/admin/PortalAuditPage.tsx`, `src/pages/main/admin/AuditDetailsPage.tsx`

The Portal Audit Center provides a unified, filterable timeline of every significant event on the Beacyn portal: logins, logouts, configuration changes, security events, and portal health snapshots. The list auto-refreshes every **30 seconds**.

### Summary Cards

Five metric cards appear at the top of the page:

| Card | Description |
|---|---|
| Events (filtered) | Total events matching the current filter set |
| Failed Actions | Count of events with `outcome = failed` |
| Critical Security | Count of events with `severity = critical` |
| Distinct Actors | Number of unique usernames in the filtered result |
| Portal / App info | App version and portal uptime from the latest snapshot |

All counts come from the `summary` field in the API response (`GET /api/portal-audit`) and update each time the filter or page changes.

### Database Health Widget

Below the summary cards is a **Beacyn backend database** panel. It shows the latest runtime snapshot from the portal health system:

| Field | Description |
|---|---|
| Runtime status | `Online` / `Offline` — derived from whether a DB engine name is present in the snapshot |
| DB engine | Database engine name and version (e.g., `MySQL 8.0.40`) |
| DB signature | Schema fingerprint hash from the last snapshot |
| DB space | Current database disk usage in human-readable units (B / KB / MB / GB) |
| Space bar | Visual bar showing current space usage relative to the historical maximum |
| History chart | Miniature bar chart of the last 8 snapshots of `db_space_bytes` |

The chart bars are scaled relative to the maximum value across the visible history window. Bars are normalized to a minimum height of 18% so zero-value entries remain visible.

### Filtering Audit Events

Four filter controls appear in the **Filters** card:

| Filter | Values |
|---|---|
| Event type | `all`, `auth`, `service`, `config`, `security`, `portal`, `db`, `snapshot` |
| Severity | `all`, `info`, `warning`, `critical` |
| Outcome | `all`, `success`, `failed` |
| Actor username | Free-text partial match |
| Search (q) | Matches against action, target, and message fields |

All filters are combined server-side. Changing any filter resets the page to 1.

### Audit Log Table

The table shows 20 entries per page. Each row includes:

| Column | Description |
|---|---|
| Time | Event timestamp (`created_at`) |
| Event type | Category label (auth, service, config, etc.) |
| Action | Specific action string (e.g., `user.login`, `service.restart`) |
| Actor | Username and role of the user who triggered the event; `system` for automated events |
| Target | Target type and ID (e.g., `asset:42`, `user:admin`) |
| Severity | `info` / `warning` / `critical` badge |
| Outcome | `success` / `failed` badge |
| Resolved | Timestamp and resolver username if the entry has been resolved |
| Actions | **Details**, **Resolve**, **Delete** buttons |

Severity badge colours:

| Severity | Style |
|---|---|
| `critical` | Rose background |
| `warning` | Amber background |
| `info` | Emerald background |

### Resolving and Deleting Entries

**Resolve**: Marks the audit entry as reviewed. Calls `PATCH /api/portal-audit/:id/resolve`. The resolved-at timestamp and resolver username are written to the record and displayed in subsequent loads. Resolving does not delete the entry.

**Delete**: Permanently removes the entry. Calls `DELETE /api/portal-audit/:id`. Requires browser confirmation. This action cannot be undone.

Both actions trigger a full reload of the current page.

### Audit Details View

Clicking **Details** on any row opens the `AuditDetailsPage` for that entry. The details view fetches the full record from `GET /api/portal-audit/:id` and displays:

**Portal context panel** (extracted from `details_json`):

| Field | Description |
|---|---|
| Portal uptime | Human-readable uptime (days, months, years) |
| DB space | Disk usage at the time of the event |
| DB engine | Engine name (default: `MySQL`) |
| DB version | Engine version string |
| DB signature | Schema fingerprint at event time |

The portal context fields support multiple JSON path layouts from different snapshot versions. The view resolves the first non-null path found.

**Core event metadata**:

| Field | Description |
|---|---|
| Time | Event timestamp |
| Type | Event category |
| Action | Specific action string |
| Actor | Username (`system` if null) |
| Role | Actor's role at the time of the event |
| Target | `type:id` string, or `-` |
| Severity | Badge |
| Outcome | Badge |
| Resolved at / by | Timestamps and resolver if applicable |
| IP address | Origin IP of the request |
| User agent | Browser or client user agent string |

**Message**: The human-readable description of the event.

**Complete JSON Details**: The full `details_json` payload pretty-printed. This is the raw record as written by the backend at event time and may include additional context such as request payloads, before/after values for config changes, or full portal health snapshots.

Use the **← Back to Audit** button to return to the filtered audit list without losing your current filter state.
