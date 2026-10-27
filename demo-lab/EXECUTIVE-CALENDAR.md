# Executive calendar snapshot export

This bounded addition exports one already active, independently reviewed [EA-01 local task](EXECUTIVE.md) as a synthetic `.ics` file. It does not create a task, approve a proposal, contact a calendar provider or send an invitation. The selected task and current source access must still pass the existing desk rules at export time. Actor labels are unauthenticated demonstration selectors.

## Reproduce

Node.js 24 with the built-in SQLite module is required:

```powershell
node --test demo-lab/executive-calendar.test.mjs demo-lab/executive-core.test.mjs
node demo-lab/run-executive-calendar.mjs
```

The CLI creates a synthetic case, scripts its fictional independent review and local task, then reports the calendar artifact and verifies that export did not change SQLite's `total_changes()`. That setup is not human review or provider acceptance. The export endpoint itself writes no case, task, review, audit event or delivery record.

## Fresh authorization and scope

`calendarExport({tenant,actor,caseId,expectedRevision,expectedHash})` accepts exactly those fields. Inside one SQLite read transaction it checks the audit chain/materializations, actor source access, implementation/configuration freshness, exact current revision and review fingerprint, source/time readiness, independent approval and both stored/effective active task status. The actual task must still match the reviewed source commitment. Held, revoked, superseded, unrecorded and stale authority cannot produce a new artifact. Unknown fields, arbitrary calendar properties and caller-supplied clock/provider controls are rejected.

The result contains `kind`, `tenant`, `caseId`, `revision`, `reviewHash`, `taskGeneration`, `uid`, `sequence`, `filename`, `mediaType`, `content`, `audit`, `asOf` and `scope`. `audit` is the same current global count/head protocol metadata used by the desk. It does not disclose other cases. The calendar contains only the selected task label/window and tenant/case/source-version/review/generation metadata; it excludes raw source contents, source title, ACLs, reviewer identity and other task records.

`asOf` uses the trusted scenario clock, which defaults to the existing fixed synthetic instant. This is not live deadline monitoring. Existing task-start equality remains eligible; a started window or expired source is held under the desk's existing rules. The exporter rejects nonzero fractional seconds instead of silently rounding supplied task timestamps.

## Calendar representation

The serializer follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545#section-3.1): CRLF content lines, UTF-8 folding at no more than 75 octets and continuation spaces. TEXT escapes protect backslash, comma, semicolon and newlines ([§3.3.11](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.11)). Dates are UTC whole-second values. The task's recorded instant supplies deterministic DTSTAMP ([§3.8.7.2](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.7.2)); its start/end supply DTSTART and the exclusive DTEND. These format rules do not establish document truth or provider behavior.

The fixed calendar has one VEVENT, `STATUS:TENTATIVE` and `TRANSP:TRANSPARENT`. Those properties mark the exported event as tentative and nonblocking for standards-based busy-time searches ([§3.8.1.11](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.1.11), [§3.8.2.7](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.2.7)). There is no METHOD, attendee, organizer, alarm, recurrence, location, URL or custom caller property.

The UID is derived from the tenant and immutable case ID. SEQUENCE uses the bounded case revision, so it rises when a newly reviewed/re-recorded case is exported ([§3.8.7.4](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.7.4)). Repeated downloads of unchanged state have identical calendar bytes. This mapping is local snapshot identity, not an invitation protocol or a promise that a calendar application will merge imports correctly. The generated filename contains a bounded UID digest and revision, never a caller-supplied path.

## Freshness and download limits

The core update follows the desk's existing core/fixture freshness rule. The serializer also checks its own loaded/current bytes on each export. Its hash is deliberately separate from the global stored-review scope: a later serializer-only edit blocks new calendar exports until restart without marking every existing JSON task or review stale. Source identities and the unkeyed audit are local consistency checks, not signatures or protection against a coherent privileged rewrite.

The browser rechecks current receipt, access, revision, task generation and audit before handing a newly fetched artifact to its download callback. A revocation detected before that check stops the download. There is no atomic authorization transaction spanning the database and the user's filesystem or another application. Access can change after a check; an already downloaded file cannot be recalled. The app does not emit cancellation files, update imported events, synchronize changes, reserve actual availability or enforce a later importer’s behavior.

The full flagship remains partial: authenticated source connectors/reviewers, live calendar availability, timezone/DST inference, inbox ingestion, actual provider acceptance and recorded operational evidence remain open. Use synthetic/public fixtures only.