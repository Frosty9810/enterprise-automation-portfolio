# F09 consent timeline

Open `http://127.0.0.1:5680/flagships#F09` in the local lab. The bundled timeline has an email marketing grant and a later revocation that was learned after it occurred. At the fixture cutoff the revocation is known, so the preview suppresses communication.

A shared timeline must identify the person on every event. A row carries `id`, `personId`, `type`, `channel`, `purpose`, `occurredAt` and `knownAt`. A grant adds `expiresAt`. The requested person, channel and purpose must match before an event can affect the decision. Rows with unknown fields are rejected in this mode. Event IDs are unique across the submitted batch. A reused ID with conflicting event data rejects the full input. The receipt identifies the mode as `subject_bound`.

| Change the input | Expected preview |
| --- | --- |
| Read after the revocation occurred but before it was known | The unexpired grant remains eligible at that historical cutoff |
| Read at the revocation's known time | Communication is suppressed |
| Supply another person's valid grant or revocation under a different event ID | It has no effect on this person's decision |
| Supply a grant and revocation at the same instant | The revocation takes precedence |
| Replay the same ID with equivalent timestamp offsets | It counts as one event |
| Combine subject-bound and legacy rows | The input is rejected |

Legacy rows without `personId` still work when the caller has already filtered the entire batch to the requested person. Legacy metadata outside the decision fields is ignored when comparing duplicate events. Legacy receipts use `legacy_pre_scoped`. Use subject-bound rows for multi-person fixtures.

```sh
node demo-lab/server.mjs
node --test demo-lab/flagship-decisions.test.mjs
```

This is a synthetic eligibility preview. It sends no email or SMS. Authenticated consent, delivery integrations and production retention enforcement remain open.

Use only synthetic evidence. The result exposes the requested person's selected events. The existing local receipt and reviewed export retain the submitted batch, including any other fixture subjects.
