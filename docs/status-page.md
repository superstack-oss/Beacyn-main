# Status Pages & Broadcast Notifications

The **Broadcast** section (`#/broadcast`) lets administrators create public-facing status pages that communicate service health to external users, and manage alert notifications that appear as announcement banners on those pages. No authentication is required to view a public status page.

---

## Status Pages

### What Is a Status Page?

A status page is a publicly shareable URL that displays the real-time health of a curated set of monitors. Each page is secured by a unique random token — the URL is unguessable and requires no login to view.

### Creating a Status Page

Navigate to **Broadcast → Status Pages** and click **New Status Page**. Fill in:

| Field | Description |
|---|---|
| **Page Name** | Internal identifier shown in the admin list |
| **Group Name** | Organizes monitors on the public page (defaults to `General`) |
| **Company Name** | Displayed in the public page header |
| **Status Page Address** | A short URL-safe slug (e.g., `acme-ops`). Must be unique across the portal |
| **Timezone** | The timezone used for timestamps on the public page (defaults to `UTC`) |
| **Monitors** | One or more monitors to include. Components can be: `servers`, `storage`, `vms`, `san`, `database`, `uptime` |
| **Show Response Charts** | Toggle to display response time trend charts on the public page |

Click **Save** to generate the page. The system creates a cryptographically random `public_token` and the page is immediately accessible at:

```
https://your-domain/status/<public_token>
```

### Editing and Deleting Pages

- **Edit**: Click the edit icon on any status page row. All fields except the public token are editable.
- **Delete**: Click the delete icon. Deletion is immediate and permanent — the public URL will return a 404.

> The `page_address` slug must be unique. If you attempt to create or edit a page with a slug already in use, the API returns a `409 Conflict` error.

---

## The Public Status Page

### Layout

The public status page is a standalone React view that requires no authentication. It auto-refreshes every **60 seconds**. The page includes:

#### Hero Section

Displays the company name, overall operational status label, and a health gauge. Status labels:

| Label | Condition |
|---|---|
| **All Systems Operational** | All monitors are up |
| **Minor Service Issues** | One or more monitors are degraded |
| **Partial Service Disruption** | One or more monitors are down |

#### Summary Cards

Three at-a-glance counters:

- **Online** — monitors returning a healthy status
- **Degraded** — monitors returning a non-healthy, non-down status
- **Down** — monitors in a failed state

#### Services Table

Lists each monitor included in the page:

| Column | Description |
|---|---|
| **Service name** | User-defined monitor label |
| **Status** | Color-coded badge: green (Up), amber (Degraded), red (Down) |
| **Uptime %** | Rolling availability percentage |
| **Avg Response** | Average response time in ms |
| **Response Chart** | 30-point sparkline (shown only if `showResponseCharts` is enabled) |
| **Last Checked** | Relative time since last probe |

#### Response Trend

A grouped area chart showing aggregated response times for all monitors over the past session of data points.

#### Announcement Banners

Any active notifications targeting this page (or global notifications) are shown as dismissible banners at the top of the page.

### Theme Toggle

A light/dark theme toggle button is available on the public page. Theme preference is applied locally via `document.documentElement.classList`.

---

## Broadcast Notifications

Broadcast notifications are announcement banners shown on public status pages. They are ideal for communicating planned maintenance windows, ongoing incidents, or general service advisories.

### Creating a Notification

Navigate to **Broadcast → Notifications** and click **New Notification**. Fields:

| Field | Description |
|---|---|
| **Title** | Short headline for the banner |
| **Message** | Full text of the announcement |
| **Severity** | Visual tone: `info`, `warning`, `critical` |
| **Global** | If enabled, the notification appears on all status pages |
| **Status Page** | Target a specific status page (if not global) |
| **Publish At** | Schedule a future publish time (optional). If blank, the notification is live immediately |
| **Remove At** | Schedule an automatic expiry time (optional). If blank, the notification remains active until manually deactivated |

### Activating and Deactivating Notifications

Use the **active** toggle on each notification row. The toggle calls `PUT /api/status-notifications/:id/active` with `{ is_active: true/false }`.

A notification is shown on the public page only when:
- `is_active = 1`
- `publish_at` is null or in the past
- `remove_at` is null or in the future

### Deleting Notifications

Click the delete icon on any notification row. Deletion is permanent.

---

## API Reference

All management endpoints require `Authorization: Bearer <token>` with an admin or superuser role.

### Status Pages

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status-pages` | List all status pages |
| `POST` | `/api/status-pages` | Create a new status page |
| `PUT` | `/api/status-pages/:id` | Update an existing status page |
| `DELETE` | `/api/status-pages/:id` | Delete a status page |
| `GET` | `/api/status-pages/public/:token` | Fetch the public status page data (no auth required) |

**POST / PUT request body**:

```json
{
  "name": "Production Status",
  "groupName": "General",
  "companyName": "Acme Corp",
  "pageAddress": "acme-prod",
  "timezone": "Asia/Kolkata",
  "showResponseCharts": true,
  "components": ["uptime", "database"]
}
```

**Public endpoint response** (`GET /api/status-pages/public/:token`):

```json
{
  "page": {
    "id": "...",
    "name": "Production Status",
    "groupName": "General",
    "timezone": "Asia/Kolkata",
    "companyName": "Acme Corp",
    "pageAddress": "acme-prod",
    "showResponseCharts": true,
    "createdAt": "..."
  },
  "services": [ ... ],
  "notifications": [ ... ],
  "generatedAt": "2026-05-02T07:00:00.000Z",
  "overall": {
    "label": "All Systems Operational",
    "avgUptime": 99.8,
    "total": 12
  }
}
```

### Status Notifications

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status-notifications` | List all notifications |
| `POST` | `/api/status-notifications` | Create a notification |
| `PUT` | `/api/status-notifications/:id/active` | Toggle `is_active` on a notification |
| `DELETE` | `/api/status-notifications/:id` | Delete a notification |

**POST request body**:

```json
{
  "title": "Scheduled Maintenance",
  "message": "Database maintenance window: 02:00–04:00 UTC",
  "severity": "warning",
  "is_global": false,
  "status_page_id": "sp_abc123",
  "publish_at": "2026-05-03T02:00:00.000Z",
  "remove_at": "2026-05-03T04:00:00.000Z"
}
```
