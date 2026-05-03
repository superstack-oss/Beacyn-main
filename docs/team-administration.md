# Team Administration

The **Team Administration** section covers user account management, access request workflows, role-based permissions, password policies, and the user profile page. Administrative functions are available to users with the `admin` or `superuser` role.

---

## Roles and Permissions

Beacyn uses a four-tier role system:

| Role | Label | Capabilities |
|---|---|---|
| `superuser` | Super-user | Full access — all admin capabilities plus destructive actions (delete users, manage built-in accounts) |
| `admin` | Admin | Manage users, approve/reject requests, change roles, suspend accounts |
| `editor` / `staff` | Editor | Create and edit monitors, infrastructure, and data. Cannot manage users |
| `viewer` | Viewer | Read-only access across all pages |

> Built-in system accounts (`admin`, `Root-user`, `Beacyn-SVC`) are protected and cannot be deleted or role-changed by regular admins.

---

## Access Requests

When a new user submits a registration request from the login page, it lands in **Admin → Team → Access Requests** with a status of `pending`. No account is active until an administrator approves it.

### Request Statuses

| Status | Meaning |
|---|---|
| `pending` | Submitted, awaiting review |
| `approved` | Account is active and can log in |
| `suspended` | Account exists but access is temporarily disabled |
| `rejected` | Request was denied |

### Reviewing a Request

Navigate to **Admin → Team → Access Requests** and use the **Pending / Approved / Suspended / Rejected** filter tabs to browse requests.

Click a request row to open the **detail sheet** with the full submission, including:

- Full name, Employee ID, contact number, and email
- Role requested and team
- Company name, manager name, and manager email
- Submission timestamp and review details

### Approving a Request

Click **Approve** on the request row or from the detail sheet. The account status is set to `approved` and the user can now log in. The review is logged with the admin's username and timestamp.

### Rejecting a Request

Click **Reject** on the request row. A comments field is required before submission. The rejection reason is stored against the request and is visible to admins but not surfaced to the requesting user.

### Suspending and Reinstating Accounts

For approved users: click **Suspend** to temporarily disable the account. The user cannot log in while suspended. Click **Reinstate** (same button, toggles) to restore access. Suspension sets `account_status = 'suspended'`; reinstatement sets it back to `approved`.

### Changing a User's Role

Click the **Change Role** option from the row actions or the detail sheet. Select one of:
- `viewer`
- `editor`
- `admin`
- `superuser` (superuser-only)

Click **Save Role** to apply the change.

### Deleting a User

Superuser-only. Click **Delete** on the user row and confirm. Deletion permanently removes the account and all associated sessions. Built-in system accounts cannot be deleted.

---

## User Profile Page

Every user has access to their own profile page at **Admin → My Profile** (`#/admin/profile`). The profile page has three sections:

### Profile Overview

Displays the user's avatar (initials), display name, username, role, account status, and membership duration.

The **Portal Uptime** tile shows how long the Beacyn server has been running (formatted as `Xd HH:MM:SS`, live-updating every second).

### Work & Contact Information

Users can edit four fields:

| Field | Description |
|---|---|
| **Contact Number** | Personal or work phone number |
| **Team** | Team name within the organization |
| **Manager Name** | Direct manager's name |
| **Manager Email** | Direct manager's email |

Click **Edit Profile** to enable the form, make changes, and click **Save Changes** to persist. Changes are saved via `POST /api/auth/profile`.

### Password Management

The password panel is surfaced in three cases:

1. **Password update required** — the account's password has reached the 90-day rotation limit
2. **Password near expiry** — the password will expire within 7 days
3. **User-initiated** — the user clicks **Change Password** voluntarily

To change the password:
1. Enter the current password
2. Enter the new password (must meet complexity requirements — minimum length, uppercase, numbers, and special characters)
3. Confirm the new password
4. Click **Update Password**

Password age and expiry date are shown:

| Field | Source |
|---|---|
| **Password Age** | Days since `password_updated_at` (or account creation if never changed) |
| **Days Remaining** | `90 - password_age_days` |
| **Expires At** | `password_updated_at + 90 days` |

#### Password Policy

| Parameter | Value |
|---|---|
| Rotation period | 90 days |
| Expiry warning window | 7 days before expiry |
| `password_update_required` | Set to `true` when age ≥ 90 days |

### Team Members Panel

For users with `admin` or `superuser` role, the profile page also shows a **Team** panel listing all users in the same team. Actions available from this panel:

- **Approve** — approve a pending team member
- **Suspend / Reinstate** — toggle suspension for approved users
- **Change Role** — update a team member's role
- **Delete** — superuser-only, removes the account

### Feedback

Any user can submit feedback via the **Feedback** section at the bottom of the profile page. Select a category (`general`, `bug`, `feature`, etc.), rate the experience (1–5), and write a comment. Feedback is saved via `POST /api/auth/feedback`.

---

## API Reference

All endpoints require `Authorization: Bearer <token>`.

### Authentication

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | No | Authenticate and receive a session token |
| `POST` | `/api/auth/register` | No | Submit an access request |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/me` | Get the current user's profile |
| `POST` | `/api/auth/profile` | Update work/contact information |
| `POST` | `/api/auth/password` | Change the current user's password |
| `POST` | `/api/auth/feedback` | Submit feedback |

### Access Requests (Admin / Superuser)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/requests?status=<status>` | List requests by status (`pending`, `approved`, `suspended`, `rejected`) |
| `POST` | `/api/auth/requests/:id/approve` | Approve a request |
| `POST` | `/api/auth/requests/:id/reject` | Reject a request — body: `{ reason: string }` |

### User Management (Admin / Superuser)

| Method | Endpoint | Description |
|---|---|---|
| `PATCH` | `/api/auth/users/:id/role` | Change a user's role — body: `{ role: string }` |
| `PATCH` | `/api/auth/users/:id/status` | Suspend or reinstate a user — body: `{ status: 'approved' \| 'suspended' }` |
| `DELETE` | `/api/auth/users/:id` | Permanently delete a user (superuser only) |

### Standard Error Responses

| HTTP | Meaning |
|---|---|
| `400` | Missing or invalid request body |
| `401` | Missing or invalid token |
| `403` | Insufficient role or account suspended |
| `404` | User or request not found |
| `409` | Conflict — e.g., username already exists |
