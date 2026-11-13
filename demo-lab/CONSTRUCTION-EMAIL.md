# CON-01 local email export intake

A small plain-text email export can supply document kind, expiry and reference to the existing construction review queue. The adapter accepts synthetic fixtures with addresses at `construction.invalid`. The submitting operator chooses the tenant, site, subcontractor and receipt time outside the email. A declared `Date` does not establish when the evidence was received.

From the repository root with Node.js 24 or later:

```sh
node demo-lab/run-construction-email.mjs
node demo-lab/run-construction-email.mjs --submit
node --test demo-lab/construction-email.test.mjs
```

The default command previews the two bundled fixtures without opening a database. `--submit` runs the synthetic workflow in memory, replays both imports and demonstrates independent fixture reviews. It reports two saved documents, readiness before and after review, and four audit events.

`prepareConstructionEmail(bytes, context)` parses bounded UTF-8 and returns `{input, rawSha256}`. Preparation has no database effect. Pass `input` to the existing `submitDocument` operation to save an unverified document. The context accepts exactly `commandId`, `tenant`, `actor`, `siteId`, `subcontractorId` and `receivedAt`. The existing construction core checks registry membership, receipt time, replay and review rules.

Use at most 2,800 bytes with uniform LF or CRLF. The header block requires `From`, `To`, `Date`, `Message-ID`, `Subject`, `MIME-Version: 1.0`, `Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: 8bit`, `X-CON01-Kind` and `X-CON01-Valid-Until`. Header names are case-sensitive. Values must be printable ASCII without folding or encoded words. `Date` uses canonical GMT mail-date syntax. The subject is limited to 120 ASCII characters. A blank line separates headers from the nonempty UTF-8 body. Kind is `insurance` or `license`. `X-CON01-Valid-Until` is an exclusive canonical UTC timestamp. The subject becomes the reference and the message ID local part becomes the source identity with an `eml-` prefix.

The record stores `eml-v1:` followed by base64 of the original bytes. This fits the existing single-line content contract and preserves the headers, body and line endings for later inspection. `rawSha256` identifies the original bytes. The core receipt's `sourceContentHash` identifies the stored envelope. Base64 is a reversible encoding.

A successful import does not grant readiness. Use the existing compliance review with the saved document revision and content hash. Expiry, revocation and supersession continue to hold readiness under the existing rules.

This adapter implements a restricted synthetic format. Real mailbox access, issuer authentication, PDF and multipart attachment handling, signed provenance and provider acceptance remain open. Keep the existing construction desk and its change approval process within the synthetic scope described in the [construction runbook](CONSTRUCTION.md).
