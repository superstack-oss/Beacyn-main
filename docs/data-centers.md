# Data Centers

The **Data Centers** section (`#/datacenter`) is the physical and virtual facility registry for the Beacyn platform. It provides a structured inventory of your sites — from colocation facilities to private data centers — along with detailed capacity tracking, escalation contacts, disaster recovery (DR) planning, and a visual continuity map for designing failover topologies.

---

## Data Center List

### Browsing Sites

The Data Centers list view shows all registered sites as cards. Each card displays:

- Site name and DC code
- City and country
- Facility type badge (`Colocation`, `Shared`, or `Private`)
- DC role badge (`Primary`, `Disaster Recovery`, `Backup Site`, or `Edge DC`)
- Vendor / provider name
- Contact person
- Continuity map status

Use the search bar to filter sites by name, DC code, city, provider, or contact person.

### DC Types

| Type | Description |
|---|---|
| **Colocation** | Shared facility where you rent rack space |
| **Shared** | Shared infrastructure environment |
| **Private** | Dedicated private data center owned or leased exclusively |

### DC Roles

| Role | Meaning |
|---|---|
| **Primary** | Main production site |
| **Disaster Recovery** | Standby site for failover |
| **Backup Site** | Secondary site used for data backup |
| **Edge DC** | Edge or regional satellite site |

---

## Adding a Data Center

Click **Add Data Center** (admin/superuser only). The form captures:

### Basic Information

- **Site Name** — full name of the facility
- **DC Code** — short alphanumeric code (e.g., `MUM-DC1`)
- **Region** and **Region Group** — geographic grouping
- **City** and **Country**
- **Address** — full postal address
- **Type** — Colocation / Shared / Private
- **DC Role** — Primary / Disaster Recovery / Backup Site / Edge DC
- **Vendor / Provider** — the facility operator (e.g., NTT, Equinix)
- **Contact Person** — name of the facility operations contact
- **Contact Email** and **Contact Phone**

### Facility Specifications

- **Total Rack Capacity** and **Used Racks** — physical rack inventory
- **Power Capacity (kW)** and **Used Power (kW)**
- **PUE** (Power Usage Effectiveness)
- **Cooling Type** — free cooling, chilled water, CRAC, etc.
- **Tier Rating** — Tier I through Tier IV

### Escalation

- **Escalation Contact Name**, **Email**, and **Phone**
- **Escalation Policy** — free-text description of the escalation procedure

### Operational Guardrails

- **Operational Coverage** — `24x7`, `Business Hours`, or `On-Call`
- **Operational Work Hours** — coverage schedule
- **Visitor Access Required** — `Yes` / `No`
- **Visitor Details** — name, phone, official email, vendor, visit duration, and special instructions (shown only when visitor access is required)

### Inventory Snapshot

- Physical Servers, Virtualization Hosts, Storage Arrays, Network Devices, Racks Occupied

### Connectivity (Continuity)

Add one or more connectivity links to other sites. Each link has:

- **Target Site** — another registered data center
- **Connection Type** — MPLS, SD-WAN, Dark Fiber, Internet VPN, etc.
- **Bandwidth** — provisioned capacity (e.g., `10 Gbps`)
- **Latency (ms)** — round-trip latency
- **Redundant** — yes/no
- **Mode** — `Active-Active` or `Active-Passive`
- **Replication Type** — `Synchronous` or `Asynchronous`
- **Replication Tool** — the software or appliance handling replication
- **Failover** — `Automatic` or `Manual`
- **RTO** — Recovery Time Objective
- **RPO** — Recovery Point Objective
- **Line Variant** — the visual style used on the continuity map (see below)

---

## Data Center Detail View

Click any site card to open the detail page. It is organized into five quick-navigation sections:

### Overview

Shows all the basic and facility fields along with a **Stats Bar** with:

- Rack utilization percentage
- Total hosted assets count
- Primary connectivity target and its connection type

### Escalation

Displays the escalation contact and policy. This is the first reference point during an incident.

### Capacity

An inventory area chart plots your asset counts across:
- Physical Servers
- Virtualization Hosts
- Storage Arrays
- Network Devices
- Racks Occupied

Stats tiles show total hosted assets and the top inventory category.

### Continuity

Lists all configured connectivity links to other sites in a visual mini-map. Each link card shows:
- Connected site name and role
- Connection type, bandwidth, and latency
- Redundancy and failover mode
- RTO / RPO targets

An inline continuity preview renders the nodes and link lines for this site's direct DR relationships.

### Inventory

Detailed inventory counts across all asset categories plus power utilization (used kW vs. total kW).

---

## DC Continuity Map

The **DC Continuity Map** is a full-screen interactive canvas (`#/datacenter` → **DC Continuity Map** button) for designing the failover and replication topology across all registered sites.

### Nodes

Each registered data center appears as a draggable node on the canvas. Nodes are color-coded by DC role:

| Role | Color |
|---|---|
| **Primary** | Blue |
| **Disaster Recovery** | Amber |
| **Backup Site** | Emerald |
| **Edge DC** | Fuchsia |

Drag a node to reposition it on the canvas. Position is persisted to the server.

### Drawing Connections

To draw a connection between two sites:

1. Select the **Line Variant** you want to draw from the legend toolbar
2. Click and drag from the source node to the target node
3. Release over the target node to create the connection

If you release over empty canvas, no connection is created.

### Line Variants

| Variant | Visual | Meaning |
|---|---|---|
| **General Interconnect** | Green dotted | Standard network interconnect |
| **Replication** | Red dotted | Unidirectional data replication |
| **Bidirectional Replication** | Blue dotted | Active-Active replication |
| **Redundant Connection** | Gray dotted | Secondary or backup network path |

Each line variant routes along a different lane to prevent visual overlap when multiple links exist between the same pair of sites.

### Selecting and Deleting Connections

Click a connection line to select it. A tooltip shows the linked sites and line variant. Press **Delete** or use the remove button to delete a selected connection.

### Saving

Changes to node positions and connections are saved using the **Save Map** button. Unsaved changes are not persisted.

---

## API Reference

All endpoints require `Authorization: Bearer <token>`. Management operations (create, update, delete) require admin or superuser role.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/datacenters` | List all data centers |
| `GET` | `/api/datacenters/:id` | Get a single data center with full detail |
| `POST` | `/api/datacenters` | Create a new data center |
| `PUT` | `/api/datacenters/:id` | Update an existing data center |
| `DELETE` | `/api/datacenters/:id` | Delete a data center |
| `GET` | `/api/datacenters/continuity-map` | Get all nodes and connections for the map canvas |
| `PUT` | `/api/datacenters/continuity-map` | Save node positions and connections |
