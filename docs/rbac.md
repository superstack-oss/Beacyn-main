# Role-Based Access Control (RBAC)

## Role Summary

| Role | DB Value | Scope | Created By |
|---|---|---|---|
| Super Admin | `superuser` | Global | System default — not assignable |
| Admin | `admin` | Team | Superuser only |
| Editor | `editor` | Team | Admin or Superuser |
| Viewer | `viewer` | Team | Admin or Superuser |

> **Service Account** (`service-acct`) is reserved for future system-level automation (audit, scheduled jobs). Not yet in use.

---

## Super Admin (`superuser`)

The superuser account (`Root-user`) is a fixed system credential. **No user can self-register as a superuser. No admin can assign the superuser role.** It exists solely for initial system setup.

### Can do
- Create Admin accounts (by changing a user's role to `admin`)
- Manage system configuration (Settings page)
- View and manage all teams, members, and roles globally
- Demote Admins (change their role to `editor` or `viewer`)
- Approve or reject access requests from any team
- Suspend / reactivate / delete any non-built-in account

### Cannot do
- Add any device, asset, SNMP device, rack, or data center
- Modify or delete any device or asset

---

## Admin (`admin`)

### Can do
- Approve or reject access requests **from their own team + company only**
- Manage devices, assets, SNMP devices, data centers, and rack points
- Manage incidents
- Change the role of team members — **to `editor` or `viewer` only**
- Suspend / reactivate / delete users — **in their own team only**

### Cannot do
- Approve or change the role of another Admin or Superuser
- Assign the `admin` or `superuser` role
- See or action access requests from other teams

---

## Editor (`editor`)

Team member with operational write access.

### Can do
- Add, modify, and delete devices and assets
- Add and manage SNMP devices, data centers, and rack points
- Create and edit operational content

### Cannot do
- Approve or reject access requests
- Change any user's role
- Suspend or delete users

---

## Viewer (`viewer`)

Read-only access to all dashboards, monitoring data, and reports. No write operations permitted.

---

## Role Assignment Rules (enforced server-side)

| Actor | Can assign | Cannot assign |
|---|---|---|
| Superuser | `admin`, `editor`, `viewer` | `superuser` |
| Admin | `editor`, `viewer` | `admin`, `superuser` |
| Editor / Viewer | — (no role management) | — |

## Device / Asset Write Access

| Route category | Superuser | Admin | Editor | Viewer |
|---|---|---|---|---|
| `POST /api/assets` | ❌ | ✅ | ✅ | ❌ |
| `PUT /api/assets/:id` | ❌ | ✅ | ✅ | ❌ |
| `DELETE /api/assets/:id` | ❌ | ✅ | ✅ | ❌ |
| `POST /api/snmp/devices` | ❌ | ✅ | ✅ | ❌ |
| `PATCH /api/snmp/devices/:id` | ❌ | ✅ | ✅ | ❌ |
| `DELETE /api/snmp/devices/:id` | ❌ | ✅ | ✅ | ❌ |
| `POST /api/datacenters` | ❌ | ✅ | ✅ | ❌ |
| `PUT /api/datacenters/:id` | ❌ | ✅ | ✅ | ❌ |
| `DELETE /api/datacenters/:id` | ❌ | ✅ | ✅ | ❌ |
| `POST /api/rackpoint/racks` | ❌ | ✅ | ✅ | ❌ |
| `POST /api/rackpoint/racks/:id/devices` | ❌ | ✅ | ✅ | ❌ |

All read (`GET`) endpoints remain accessible to all authenticated users.

---

---

## Default System Accounts

These two accounts are seeded automatically by `ensureUsersTable()` on every server start. They cannot be modified, suspended, or deleted via the UI.

| # | Full Name | Username | Email | Password | Role | Employee ID |
|---|---|---|---|---|---|---|
| 1 | Super Admin | `Root-user` | `root@beacyn.com` | `Root@Beacyn#26` | `superuser` | `SU-001` |
| 2 | Beacyn Service | `Beacyn-SVC` | `svc@beacyn.com` | `Svc@Beacyn#26` | `superuser` | `SVC-001` |

**Super Admin** (`Root-user`) — Primary system credential for initial setup and global administration.

**Service Account** (`Beacyn-SVC`) — Dedicated account for system-level access to the Portal Audit Center and Settings pages. Use this for automated tooling or delegated ops access that needs global read + config scope without being tied to any team.

> These accounts have `team = System`, `company = Beacyn Labs.` and are excluded from all access-request listings.

---

## DB Schema Note

The `role` column ENUM was renamed from `staff` → `editor` in April 2026.  
A migration in `ensureUsersTable()` automatically converts any `staff` rows to `editor` on server start.
