# Rack Management — RackPoint

**RackPoint** is Beacyn's visual rack layout editor. It gives your team a physical inventory view of every device installed across all data center racks — from servers and storage arrays to patch panels, UPS units, and PDUs. Each device can be tracked with serial numbers, IP addresses, vendor details, and live reachability status.

---

## Overview

RackPoint is accessed via **Data Centers → RackPoint** (`#/datacenter/rackpoint`). The page is scoped to a single data center at a time. Select a data center from the left panel to load its racks.

### Data Center Summary Panel

The left-side panel lists all data centers with a summary for each:

| Field | Description |
|---|---|
| **Rack Count** | Number of racks registered under this site |
| **Server Count** | Devices of type `server` |
| **Storage Count** | Devices of type `storage` |
| **Network Count** | Devices of type `network` |
| **Other Count** | Devices of all other types |
| **Reachable Count** | Devices with `availabilityStatus = reachable` |
| **Total Devices** | Sum of all devices across all racks |

Click a data center to load its rack diagrams on the right.

---

## Rack Diagrams

Each rack is rendered as a vertical diagram with numbered U slots running top to bottom. The diagram shows:

- **Rack name** and **location** in the header
- **Rack type** badge (`42U`, `45U`, or `48U`)
- **Utilization bar** — used U slots as a percentage of total capacity, color-coded:
  - Green-to-blue: ≤ 60% utilized
  - Teal-to-blue: 61–85% utilized
  - Rose-to-orange: > 85% utilized
- **Used U and device count** below the bar
- **Reachable device count**
- **U slot numbers** on both sides of the rack

### Device Blocks

Each device occupies one or more consecutive U slots. Blocks are color-coded by device type:

| Type | Color |
|---|---|
| **Server** | Blue |
| **Storage** | Violet |
| **Network** | Teal |
| **Firewall** | Amber |
| **Load Balancer** | Emerald |
| **Patch Panel** | Gray |
| **KVM** | Pink |
| **UPS** | Rose |
| **PDU** | Yellow |
| **Blank** | Dark zinc (non-interactive filler) |

Each block displays two status indicators in the top-right corner:

- **Availability dot** (emerald = reachable, rose = unreachable, zinc = unknown)
- **Lifecycle dot** (green = active, yellow = standby, amber = maintenance, red = offline)

Block content scales with U size:
- **1U**: device name only
- **2U**: device name + vendor and model
- **3U+**: device name, vendor/model, serial number, and IP address

---

## Managing Racks

Admin and superuser roles can create, edit, and delete racks.

### Creating a Rack

Click the **Add Rack** button in the selected data center summary, or use the **+ Add** button on any existing rack header.

Fill in:

| Field | Description |
|---|---|
| **Rack Name** | Identifier label (e.g., `MUM-R02A`) |
| **Rack Type** | `42U`, `45U`, or `48U` |
| **Location** | Physical position within the facility (e.g., `Row D · Position 2`) |
| **Power Draw** | Estimated power consumption (e.g., `3.8 kW`) |

The rack is created under the currently selected data center and immediately appears in the diagram view.

### Editing a Rack

Open the rack's **⋮** menu and select **Edit rack**. All fields are editable. Save changes with **Save Changes**.

### Deleting a Rack

Open the rack's **⋮** menu and select **Delete rack**. Deleting a rack also deletes all devices installed in it. This action is permanent.

---

## Managing Devices

### Adding a Device

Click the **Add** button in any rack's header, or click an empty slot directly in the rack diagram to pre-fill the U start position.

Fill in:

| Field | Description |
|---|---|
| **Rack** | The target rack (pre-filled when clicking a slot) |
| **U Start** | The top U slot the device occupies |
| **U Size** | How many U slots the device spans |
| **Device Name** | Identifying label (e.g., `APP-SRV-09`) |
| **Serial Number** | Hardware serial number |
| **Hostname** | FQDN or short hostname (e.g., `app-srv-09.mum`) |
| **IP Address** | Management or primary IP |
| **Type** | Server / Storage / Network / Firewall / Load Balancer / Patch / KVM / UPS / PDU |
| **Lifecycle Status** | Active / Standby / Maintenance / Offline |
| **Vendor** | Hardware vendor (e.g., `Dell`) |
| **Model** | Hardware model (e.g., `PowerEdge R760`) |
| **Role** | Functional role (e.g., `Application Server`) |
| **Specs / Notes** | Free-text hardware specs or operational notes |

### Editing a Device

Click any device block in the rack diagram to open the **Device Panel** on the right. Use the **⋮** menu inside the panel and select **Edit device**. All fields can be updated.

### Deleting a Device

Open the Device Panel via the **⋮** menu inside the panel and select **Delete device**. Deletion is permanent.

### Device Panel

Clicking any non-blank device block opens a right-side **Device Panel** showing:

- Device name and rack/site context
- Availability status badge (Reachable / Unreachable / Unknown) with last check latency and timestamp
- Lifecycle status badge
- Device type, vendor, model, serial number
- Hostname and IP address
- Role and specs/notes
- Last availability check details

The Device Panel closes with the **×** button or by pressing `Escape`.

---

## Moving Devices (Drag and Drop)

Devices can be repositioned within or across racks by dragging:

1. Hover over a device block — a **drag** hint appears
2. Click and drag the block to an empty slot in the same or a different rack
3. Drop it to place the device in the new slot

> Blank (filler) panels cannot be dragged.

---

## Search

A search bar at the top of the rack view filters device blocks in real-time. Matching devices are highlighted with a bright ring. The search matches against:

- Device name
- Hostname
- IP address
- Vendor
- Model
- Serial number

---

## CSV Import

Devices can be bulk-imported from a CSV file using **Import Devices** (`POST /api/rackpoint/import`).

### CSV Format

The import CSV must have the following column headers (case-insensitive):

| Column | Required | Description |
|---|---|---|
| `rack_id` | Yes | Target rack ID |
| `name` | Yes | Device name |
| `type` | Yes | Device type (see type list above) |
| `u_start` | Yes | Starting U position (1-based) |
| `u_size` | Yes | Number of U slots |
| `vendor` | No | Hardware vendor |
| `model` | No | Hardware model |
| `serial_number` | No | Serial number |
| `hostname` | No | Hostname |
| `ip` | No | IP address |
| `status` | No | Lifecycle status (default: `active`) |
| `role` | No | Functional role |
| `specs` | No | Specs / notes |

Use the **Export CSV** button on the RackPoint page to download existing devices as a template.

---

## Availability Checking

RackPoint periodically checks the reachability of each device that has a hostname or IP address. The check result is stored as:

| Status | Meaning |
|---|---|
| `reachable` | Host responded within the timeout window |
| `unreachable` | Host did not respond or connection was refused |
| `unknown` | No availability check has been performed yet |

Availability checks are run as part of the monitoring loop and update `availabilityStatus`, `availabilityMessage`, `lastAvailabilityLatencyMs`, and `lastAvailabilityCheckedAt` on each device record.

---

## API Reference

All endpoints require `Authorization: Bearer <token>`. Write operations require admin or superuser role.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rackpoint/data-centers` | List all data centers with rack/device summary counts |
| `GET` | `/api/rackpoint/racks` | List all racks (optionally filtered by `dcId` query param) |
| `POST` | `/api/rackpoint/racks` | Create a new rack |
| `PUT` | `/api/rackpoint/racks/:rackId` | Update a rack |
| `DELETE` | `/api/rackpoint/racks/:rackId` | Delete a rack and all its devices |
| `POST` | `/api/rackpoint/racks/:rackId/devices` | Add a device to a rack |
| `PUT` | `/api/rackpoint/devices/:deviceId` | Update a device |
| `DELETE` | `/api/rackpoint/devices/:deviceId` | Delete a device |
| `POST` | `/api/rackpoint/import` | Bulk-import devices from CSV |
