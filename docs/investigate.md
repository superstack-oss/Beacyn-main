# Investigate — Incident Management

The **Investigate** page is the central hub for managing infrastructure incidents in Beacyn. Tickets are auto-generated when monitored hosts breach configured utilization thresholds and remain active until manually resolved or closed.

---

## Understanding Incidents

### What Is an Incident Ticket?

An investigation ticket is created automatically by the PulseIQ monitoring engine when a metric on a monitored host exceeds its defined threshold. No manual action is required to open a ticket — the system raises it on your behalf.

Tickets are generated for the following metric types:

| Metric Type | Description |
|---|---|
| `cpu` | CPU utilization breached threshold |
| `memory` | Memory usage exceeded limit |
| `disk` | Disk utilization above threshold |
| `network` | Network interface saturation detected |
| `database_availability` | Database connection or availability check failed |
| `uptime` | Host uptime or ping check failed |

### Ticket Fields

Every ticket contains the following information:

| Field | Description |
|---|---|
| **Ticket ID** | Unique identifier for the incident (e.g., `TKT-20240501-0012`) |
| **Ticket Caller** | The user or system actor that first interacted with the ticket. Defaults to `PulseIQ Monitor` for auto-generated tickets or `System Administrator` if routed to ServiceNow |
| **Host** | Hostname of the affected infrastructure asset |
| **Metric** | The metric type that triggered the ticket (formatted as a human-readable label) |
| **Resource Key** | The specific resource on the host (e.g., disk partition `/dev/sda1`, CPU core, network interface) |
| **Severity** | Priority level: `P1`, `P2`, or `P3` |
| **Current Value** | The metric value at the time the ticket was created (as a percentage) |
| **Threshold Value** | The configured threshold that was breached |
| **Status** | `Open` or `Resolved` |
| **Ticket State** | Workflow state indicating investigation progress (see below) |
| **Description** | Auto-generated plain-language description of the breach event |
| **ServiceNow Incident** | Linked ServiceNow incident number, if applicable |

### Severity Levels

| Severity | SLA | Meaning |
|---|---|---|
| **P1** | 4 hours | Critical — immediate action required |
| **P2** | 8 hours | High — address within the business day |
| **P3** | 24 hours | Medium — schedule for resolution |

SLA breach time is calculated from the ticket's creation timestamp plus the SLA window for its severity. Breach time is displayed in the Activity Stream section of the ticket detail view.

### Ticket States

Ticket state reflects the current workflow stage of the investigation:

| State | Meaning |
|---|---|
| **In progress** | Actively being investigated |
| **ServiceNow** | Escalated and linked to a ServiceNow incident |
| **Canceled** | Acknowledged but dismissed (e.g., false positive or planned maintenance) |
| **Resolved** | Issue confirmed fixed and ticket closed successfully |
| **Closed Un-resolved** | Ticket closed without a confirmed fix (underlying issue may persist) |

The ticket state is independent of the binary `Open`/`Resolved` status. A ticket can be in state `ServiceNow` while still having an `Open` status until explicitly marked resolved.

### Browsing Tickets

The main Investigate view lists all tickets in a paginated table. You can:

- **Filter by status** — use the `Open`, `Resolved`, or `All` toggle buttons to narrow the list
- **Search** — use the search bar to filter by hostname, ticket ID, or metric type
- **Paginate** — navigate with First / Prev / Next / Last controls (10 tickets per page)

The table refreshes automatically every **60 seconds**.

---

## Incident Timeline

Each ticket detail view includes a **Timeline** panel that shows the key lifecycle timestamps for the incident.

### Timeline Events

| Event | Description |
|---|---|
| **Created** | When the monitoring engine first detected the threshold breach and raised the ticket |
| **Last Updated** | The most recent modification to the ticket (work note, state change, or resolve action) |
| **Resolved** | The timestamp when the ticket was marked as resolved (only shown if resolved) |

### Ticket Age

The **Ticket Age** shown in the Activity Stream header is the elapsed duration from ticket creation to resolution (or to the current time if still open). It is displayed in a human-readable format:

- `< 1 hour` → displayed as minutes (e.g., `42m`)
- `< 1 day` → displayed as hours and minutes (e.g., `3h 15m`)
- `≥ 1 day` → displayed as days, hours, and minutes (e.g., `1d 4h 22m`)

### SLA Breach Time

The SLA breach deadline is calculated as:

```
Breach Time = Created At + SLA Hours for Severity
```

| Severity | SLA Hours |
|---|---|
| P1 | 4 hours |
| P2 | 8 hours |
| P3 | 24 hours |

The breach time is shown in the Activity Stream header next to ticket age and SLA window, giving you an at-a-glance view of urgency.

### Threshold Breach Details

The **Threshold Breach** panel in the ticket detail displays:

- **Resource** — the specific resource key that was over threshold
- **Current** — the metric value recorded at breach time (shown as a percentage)
- **Threshold** — the limit that was configured for this resource
- **ServiceNow** — the linked incident number or creation status

---

## Resolving Incidents

### Opening a Ticket

Click any row in the ticket table to open the full detail view for that ticket. You can also use the **Settings (⚙)** dropdown on any row and select **Details**.

### Adding Work Notes

As you investigate an incident, document your findings in the **Work Notes** field in the **Ticket Workflow** panel:

1. Open the ticket detail view
2. Type your investigation update in the **Work Notes** textarea
3. Optionally change the **Ticket State** using the dropdown
4. Click **Update Ticket**

Each note is saved to the Activity Stream and attributed to your username. The notes field clears automatically after each submission so you can add sequential updates without manually clearing old content.

> Work notes support multi-line text. Each update is saved as a separate activity entry — previous notes are not overwritten.

### Changing Ticket State

Use the **Ticket State** dropdown in the Ticket Workflow panel to advance or update the workflow stage. Available states:

- `In progress`
- `ServiceNow`
- `Canceled`
- `Resolved`
- `Closed Un-resolved`

Saving a state change (via **Update Ticket**) without a note is valid — it will be recorded in the activity stream as a state update with no additional note text.

### Marking a Ticket Resolved

To formally close a ticket as resolved:

- In the ticket detail: click **Mark Resolved** at the bottom of the Ticket Workflow panel
- In the ticket list: open the row's **Settings (⚙)** dropdown and select **Resolved**

Resolving a ticket:
- Sets `status` to `Resolved`
- Records the `resolved_at` timestamp
- The ticket moves out of the default `Open` filter view

A resolved ticket cannot be marked resolved again — the **Mark Resolved** button is disabled once the status is `Resolved`.

### Deleting a Ticket

To permanently remove a ticket from the system:

1. Open the ticket or use the **Settings (⚙)** dropdown
2. Click **Delete Ticket** (detail view) or **Delete** (dropdown)
3. Confirm the deletion in the dialog prompt

> Deletion is permanent. The investigation record and all associated activity history will be removed. Use **Canceled** or **Closed Un-resolved** states instead if you want to preserve the audit trail.

### Opening the Server

If a ticket is associated with an infrastructure agent (i.e., not a pure uptime or database availability check), the **Open Server** button becomes active in the ticket detail header. Clicking it navigates directly to the Server view for that agent, allowing you to cross-reference live metrics alongside the incident.

---

## Incident History and Analysis

### Activity Stream

The **Activity Stream** is the full audit log of all investigation actions taken on a ticket. It is displayed at the bottom of the ticket detail view and includes:

| Field | Description |
|---|---|
| **Actor** | The username of the person who made the update, or `System Administrator` for system-generated entries |
| **Timestamp** | Date and time the activity was recorded |
| **Ticket State** | The state at the time of the activity (if changed) |
| **Note Text** | The work note content, or `State updated without an additional note.` if no note was provided |

Activities are ordered chronologically with the most recent entry shown last.

### Activity Types

Each activity entry has a `note_source` field that classifies its origin:

| Source | Meaning |
|---|---|
| `manual-note` | A work note added by a user |
| `status-change` | A ticket state transition |
| `system` | An automated action (e.g., ServiceNow escalation) |

### Using the History for Root Cause Analysis

The activity stream, combined with the threshold breach data and ticket timeline, gives you everything needed to reconstruct the incident:

1. **When did the breach occur?** — `Created At` timestamp
2. **What resource was affected?** — `Resource Key` and `Metric Type`
3. **How bad was it?** — `Current Value` vs. `Threshold Value`
4. **How long did it last?** — `Ticket Age` duration
5. **Was the SLA met?** — Compare `Resolved At` against `Breach Time`
6. **What actions were taken?** — Activity stream work notes and state changes
7. **Who was involved?** — Actor usernames on each activity entry

### Filtering Historical Tickets

Switch the status filter to **Resolved** or **All** in the main ticket list to review past incidents. Combine with the search bar to find tickets for a specific host or metric type.

---

## ServiceNow Integration

Beacyn can automatically create ServiceNow incidents for high-severity breaches and allows operators to escalate tickets manually to ServiceNow at any time.

### Automatic Escalation

When the monitoring engine raises a ticket, it may automatically attempt to create a corresponding ServiceNow incident based on severity or integration configuration. The result is tracked in two fields on the ticket:

| Field | Values |
|---|---|
| `service_now_incident` | The ServiceNow incident number (e.g., `INC0012345`) if successfully created, otherwise `null` |
| `service_now_status` | `Created` — incident created successfully; `Failed` — creation attempted but failed; `null` — not attempted |

If creation failed, the ticket detail **Threshold Breach** panel shows `Creation failed` next to the ServiceNow field.

### Opening a Linked ServiceNow Incident

When a ticket has a linked ServiceNow incident, the **Open SNOW Incident** button activates in two locations:

- **Ticket detail header** — click the `Open SNOW Incident` button
- **Ticket list dropdown** — select **Open Snow Incident** from the **Settings (⚙)** menu

Clicking the button calls `GET /api/investigate/:ticketId/servicenow-url`, which constructs and returns the full incident URL from your ServiceNow instance configuration. The incident opens in a new browser tab.

If no incident is linked, the button is disabled and an error message is shown if invoked.

### Ticket State: ServiceNow

Setting the ticket state to **ServiceNow** signals that the incident has been handed off to your ServiceNow ITSM workflow. This state is distinct from the `service_now_incident` field — it is a workflow marker that can be set manually even before automatic incident creation occurs, or if your ServiceNow integration is not configured for auto-creation.

Best practice: when escalating to ServiceNow manually, update the ticket state to `ServiceNow` and add a work note with the ServiceNow incident number and any relevant handoff context.

### API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/investigate` | List tickets with optional `status`, `q`, `page`, and `pageSize` query parameters |
| `GET` | `/api/investigate/:ticketId` | Get full ticket detail including activities array |
| `PATCH` | `/api/investigate/:ticketId/resolve` | Mark a ticket as resolved |
| `DELETE` | `/api/investigate/:ticketId` | Permanently delete a ticket and its activity history |
| `GET` | `/api/investigate/:ticketId/servicenow-url` | Returns the ServiceNow incident URL for a linked ticket |
| `PATCH` | `/api/investigate/:ticketId/work-notes` | Save a work note and/or update ticket state — body: `{ workNotes: string, ticketState: TicketState }` |

All endpoints require a valid `Authorization: Bearer <token>` header.
