# Public deterministic agent API

`POST /api/run-agent` accepts `application/json` (optionally with charset parameters). The body must be an object containing a nonblank string `agentId` of at most 100 characters and a string `task` with at least eight non-whitespace-edge characters and at most 8,000 total characters. The registry rejects unknown agent identifiers. Strings are trimmed before generating the packet.

The reader caps the entire request at 16,384 UTF-8 bytes before JSON parsing, including chunked requests with absent or misleading Content-Length. It cancels oversized streams. These are application limits; hosting-level connection timeouts and rate limits remain separate controls.

| Status | Meaning |
|---|---|
| 200 | A deterministic reference packet was generated |
| 400 | Invalid JSON/UTF-8, shape, fields, missing body or unknown agent |
| 413 | Declared or actual body exceeds the byte cap |
| 415 | Content-Type is not application/json |

Run `npm test` for malformed shapes, split UTF-8, byte and field boundaries, misleading lengths and failing stream cancellation. CI runs these tests, lint, TypeScript and the build. The endpoint makes no model, provider or operational writes; successful generation grants no approval or execution authority.
