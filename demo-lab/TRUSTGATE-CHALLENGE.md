# TrustGate synthetic adversarial acceptance challenge

This fixed local diagnostic exercises the actual [TrustGate gateway](TRUSTGATE.md) against separately AI-authored benign and adversarial command sequences. The [corpus](trustgate-challenge-corpus.json) and [data guide](TRUSTGATE-CHALLENGE-DATA.md) describe expected outcomes authored before the new runner output. The labels are synthetic judgments, not human-reviewed security truth, an external benchmark or evidence of general prompt-injection resistance.

## Run and inspect

With Node.js 24 and the installed demo-lab dependencies, run:

```powershell
node demo-lab/run-trustgate-challenge.mjs
node --test demo-lab/trustgate-challenge.test.mjs demo-lab/trustgate-challenge-ui.test.mjs demo-lab/trustgate-challenge-http.test.mjs
node demo-lab/server.mjs
```

Open `/tool-challenge?project=TrustGate` from the TrustGate workbench. Loading the page reads the catalog only; running the suite is explicit. Each case uses a fresh in-memory SQLite database and the original gateway API. The runner measures actual preparation, review, execution and selected closed configuration/tamper probes. It records real errors, receipt states, SQL effect counts and audit verification. The normal workbench database is not modified. Nothing is sent or published.

A rejected call is not automatically a successful case: the observed error/state and final effects must agree with the case's authored expectations. Benign sequences verify that permitted work can still succeed after the required review. Replays must preserve one local effect. Intent groups retain their own denominators; fixture agreement does not measure attack prevalence or production risk. Every disagreement remains inspectable in the UI and exported report.

## Evidence and limits

The runner accepts exactly one suite ID. HTTP callers cannot supply arbitrary proposals, sources, SQL, paths, labels, providers or credentials. Case instructions are fixed repository data, interpreted through a closed operation allowlist rather than executable text. Mutation effects are only the original gateway's local SQL operations. Tamper probes target a disposable case database with fixed test actions; they are not database administration tools exposed to the caller.

Current/loaded implementation, corpus and policy identities are checked before and after the run. The report retains genuine random receipt/effect/audit identifiers and local timestamps. Its content hash identifies that particular report; two runs can have different report hashes while the source and case expectations remain unchanged. The UI checks the authored challenge against the current catalog, checks observed comparisons and denominators, and rechecks source identity before export. Pending, failed or stale identity reads invalidate export authority. A previously downloaded report cannot be recalled.

Actor, tenant, reviewer, trust, classification and instruction flags are declared synthetic registry inputs. Passing policy cases does not show that the system can discover malicious prose or authenticate a person. Tests of marked injection are tests of declared metadata enforcement, not language-model detection. Unkeyed local hashes are not signatures or protection against a privileged operator who rewrites all trusted storage coherently.

The full [research blueprint](../47%20Automation%20Blueprints/2026%20Research-to-Production/03-trustgate.md) remains partial: authenticated agent/tool integration, end-to-end runtime provenance, signed remote receipts, LM/saliency screeners, externally authored human-reviewed adversarial datasets, real tool/provider acceptance and production security evidence remain open. No private/client source, paid provider or model is accessed by this diagnostic.

## Observed local run

The frozen corpus `7d41632ac076b0fd9bea990fc64bbdaa892136a354d09e844d5f7ced959e521d` contains 20 cases and 58 operations. An explicit run observed:

| Measure | Observed |
|---|---:|
| Cases matching all authored operation and final-state expectations | 20 / 20 |
| Benign cases matching expectations | 4 / 4 |
| Adversarial cases matching expectations | 16 / 16 |
| Operations matching expected status, error and replay flag | 58 / 58 |
| Returned blocked preparations | 6 |
| Gateway error responses | 22 |
| Actual local internal task rows | 3 |
| Actual local public-outbox rows | 1 |
| Actual audit events across isolated cases | 30 |
| Cases with an invalid audit | 1, the intentional corruption case |

The invalid audit is expected evidence of detection, not a passing integrity result: the forged receipt stays visible, verification fails and subsequent execution is rejected. The aggregate case passes because that exact response and absence of effects match its authored expectations. All other case audits are valid. A count of 20/20 on these fixed metadata-policy cases must not be presented as a general attack success rate, detector score or production security guarantee. Future disagreements must remain visible rather than changing the labels to preserve this score.
