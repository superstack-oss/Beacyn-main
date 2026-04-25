# PulseIQ Uptime Monitoring Documentation

Welcome to the PulseIQ Uptime Monitoring module. PulseIQ provides an enterprise-ready suite of specialized probes that continuously interrogate your infrastructure, services, and APIs to guarantee their availability, correctness, and performance. 

This document serves as the foundational guide for configuring and understanding each unique Monitor Type within your asset inventory.

## System Requirements
Before utilizing the monitoring probes, ensure your host running the PulseIQ Node daemon meets the following constraints:
*   **Operating System**: Linux preferred (for native ICMP Ping capabilities), but fully macOS/Windows compatible.
*   **Permissions**: Root or `admin` permissions might be required for raw TCP/ICMP packet creation depending on your target host firewall settings.
*   **Network Access**: Ensure outbound TCP/UDP policies allow connections to your target domains over required query ports.
*   **NPM Dependencies**: The daemon requires standard dependencies strictly baked into the latest build (`ws`, `gamedig`, `@grpc/grpc-js`). Run `npm install` gracefully before starting the tracking loop to ensure you have the libraries needed to power WebSocket, Protocol Game Engine, and RPC monitoring.

---

## Supported Monitor Types

PulseIQ intelligently categorizes target probing into 8 strictly-typed monitors.

### 1. HTTP(S) Monitor
**Role**: Simulates a standard web client navigating to a website. It actively tracks HTML/text presence, HTTP status codes, and TLS/SSL certificate health constraints.
*   **Device Category**: `Website`
*   **Input Standard**: Full URL (e.g., `https://pulseiq.dev`)
*   **Configuration**: Requires an active HTTP server. Anything returning HTTP response codes between `200-399` natively indicates an `Up` status. `400+` or DNS resolution timeouts instantly signal `Down`.
*   **Fallback**: Automatically falls back to attempting simple TCP socket checks on port 80/443 if the HTTP protocol strictly crashes.

### 2. API Endpoint Monitor
**Role**: Specialized for RESTful, GraphQL, and microservice APIs. Analyzes strict time-to-first-byte (TTFB) and JSON data latency overhead.
*   **Device Category**: `API Endpoint`
*   **Input Standard**: Restful URL (e.g., `https://api.internal/health`)
*   **Configuration**: Identical under-the-hood probe parameters to HTTP(S), but inherently separated logically inside the platform so your observability team can instantly distinguish backend database/network API metrics from front-end user-facing websites.

### 3. Docker Monitor
**Role**: Intimately polls the Docker Engine Daemon REST Protocol to verify the true operational state of your isolated containers rather than just TCP connectivity limits.
*   **Device Category**: `Docker container`
*   **Input Standard**: Daemon Socket Path **OR** TCP String coupled optionally with a container identifier.
*   **Configuration Details**: Docker requires deliberate, strict configurations depending on where the daemon physically exists:
    *   **Local Monitoring**: If PulseIQ runs on the same machine as your Docker target node, simply enter `/var/run/docker.sock`. PulseIQ will monitor the overall daemon health globally.
    *   **Specific Local Container**: Input the active container ID or Name (e.g. `e3d89fdea7cd` or `redis-cache`). The system matches the string explicitly against local `/var/run/docker.sock` to strictly assert the container's internal properties.
    *   **Remote Servers (Over TCP)**: Docker limits network exposure natively. First, expose Docker manually on your remote proxy server configurations (e.g., port 2375). Then, register your asset with the endpoint prefix: `tcp://10.0.0.8:2375`. PulseIQ routes the query exclusively over the external target's APIs natively. If you append `/container_name` to the TCP string (e.g. `tcp://10.0.0.8:2375/redis-cache`), it monitors that specific remote container seamlessly.

### 4. Ping (ICMP) Monitor
**Role**: The standard packet-based reachability validation for bare-metal infrastructure testing protocols.
*   **Device Category**: `Server, VM, Storage, Switch, Appliance, Device/IP`
*   **Input Standard**: Standard IPv4/IPv6 Address or registered Hostname (e.g., `192.168.1.1` or `db.internal`)
*   **Configuration**: Emits four explicit `ICMP Echo Requests`. If standard ICMP drops intentionally due to rigorous cloud security groupings (such as strict zero-trust security groups blocking native ICMP pings), PulseIQ's secondary fallback mechanisms capture the timeouts and aggressively attempt mapping against open TCP routes implicitly (Port 80/443) before officially firing negative disruption states.

### 5. Port (TCP) Monitor
**Role**: Validates persistent layer-4 connection stability specifically for databases, custom caches, enterprise protocols, or obscure network appliances bypassing layer-7 parsing.
*   **Device Category**: `Port`
*   **Input Standard**: Hostname/IP coupled with an explicit routing Port (e.g., Host: `redis.internal`, Port: `6379`)
*   **Configuration**: Opens raw socket streams using Native Javascript Streams logic. Requires nothing but an open, listening interface responding positively. Highly reliable mechanism precisely testing pure networking latency void of application server bloat.

### 6. Game Server Monitor
**Role**: Purpose-built and robust protocol packet engineering querying framework tailored directly to specific game server UDP/TCP engine constraints.
*   **Device Category Options**: `Minecraft`, `Source Engine` (Half-Life/CS:GO), `Valheim`, `Rust`, `Unreal`, `Other`
*   **Input Standard**: Standard IP/Hostname + Designated Query Port (e.g., Host: `mc.example.com`, Port `25565`)
*   **Configuration**: Powered securely by the `gamedig` implementation package. By specifically aligning your game instance with the selected Device Category during asset registration, the server probe natively generates the strict hexadecimal initialization sequences to capture realtime telemetry (Live Player lists, Active Maximum constraints, Server Names, Password configurations) directly into PulseIQ diagnostic metadata panels!

### 7. gRPC Service Monitor
**Role**: Specialized integration initializing robust HTTP/2 Multiplexed RPC sequences actively interrogating robust backend microservice channels flawlessly.
*   **Device Category**: `gRPC`
*   **Input Standard**: gRPC Network URI (e.g., `grpc://api.internal:50051`)
*   **Configuration**: Employs universal protobuf schemas directly (`grpc.health.v1.Health`). It securely negotiates multiplexed HTTP/2 and queries the microservice's raw `Check()` RPC handler interfaces. Crucially, the external service MUST explicitly return `{ status: "SERVING" }` for the PulseIQ tracker to register a successful pass condition, generating incredibly rigorous application logic tests natively.

### 8. WebSocket Monitor
**Role**: Emulates rigorous, perpetual active client sockets for robust tracking of real-time server connections (WebSocket Chats, Push Subscriptions, Orderbooks).
*   **Device Category**: `WebSocket`
*   **Input Standard**: Full WS resolution string (e.g., `ws://socket.domain.com` or `wss://socket.domain.com`)
*   **Configuration**: Intercepts `HTTP Upgrade` negotiation streams to gauge initial overhead. Effectively records exact millisecond variations in TLS connection thresholds prior to initiating formal socket closures, safely terminating the sequence prior to exhausting target server resources. Disconnections failing before socket formal confirmation invoke explicit Error tracking.

---

## Content Migration Strategies (For Public Site Generation)

When expanding this raw internal markdown into styled external product landing documentation logic:
*   **Screenshots Highlighted**: Directly embed clean, high-resolution snapshots showing the exact form logic on the Add App Modal overlay. Draw distinct focus explicitly on how configuring `Game Server` changes form mappings exclusively logic targeting ports while removing generalized elements.
*   **Bulk Addition Mapping Code Snippets**: Specifically detail the schema structure generated natively inside the `Download Template` CSV so DevOps configurations have access to the headers seamlessly. Ensure API/CSV integrations show valid examples spanning across all 8 configurations natively!
