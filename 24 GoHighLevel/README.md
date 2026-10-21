# GoHighLevel build evidence

Status: populated with request previews and manual setup blueprints; no live location or native snapshot verified.

Every [project package](../showcase/README.md) defines a relationship role, proposed pipeline stages and minimal contact fields in ghl-build.json. The file is a documented build specification, not a HighLevel import format. Use the [setup and acceptance runbook](../integrations/ghl-n8n/README.md) to create the objects in a dedicated test location.

The shared adapter prepares a contact upsert using the operator's trusted location and a validated email. It excludes tags, DND changes, phone and free text. It neither enrolls contacts into campaigns nor sends messages. Financial, recruiting and operational records remain in their original systems.

Capture one successful synthetic contact write, a replay without duplicate creation, a rejected cross-location input and a 429/timeout recovery trace before claiming a deployed GHL integration. Recordings, run IDs and native snapshots remain pending.

---
Part of the [Enterprise Automation Portfolio](../README.md).

## Offline demonstration update

The [local lab](../demo-lab/README.md) now includes a persistent contact API simulator with actual HTTP calls from n8n, replay checks and injected failures. This provides offline demonstration coverage across all projects; it does not claim to run the hosted GHL product or export native snapshots.
