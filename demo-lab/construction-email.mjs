import { createHash } from 'node:crypto';

const maxBytes = 2800;
const fieldNames = [
  'From', 'To', 'Date', 'Message-ID', 'Subject', 'MIME-Version',
  'Content-Type', 'Content-Transfer-Encoding', 'X-CON01-Kind', 'X-CON01-Valid-Until',
];
const contextFields = ['commandId', 'tenant', 'actor', 'siteId', 'subcontractorId', 'receivedAt'];
const fixtureMailbox = /^[a-z0-9][a-z0-9._-]{0,89}@construction\.invalid$/u;
const fixtureMessageId = /^<([a-z0-9][a-z0-9._-]{0,89})@construction\.invalid>$/u;
const utcInstant = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;

function reject(reason) {
  throw new TypeError('Invalid CON-01 fixture email: ' + reason);
}

function readText(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > maxBytes) {
    reject('supply 1 through 2800 UTF-8 bytes.');
  }
  const raw = Buffer.from(bytes);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    reject('the source must be valid UTF-8.');
  }
  if (text.startsWith('\uFEFF')) reject('a UTF-8 byte-order mark is unsupported.');
  const separator = text.includes('\r') ? '\r\n' : '\n';
  const lines = text.split(separator);
  if (lines.some(line => /[\u0000-\u001f\u007f-\u009f]/u.test(line))) {
    reject('use consistent LF or CRLF with no other control characters.');
  }
  return { raw, lines };
}

function readHeaders(lines) {
  const split = lines.indexOf('');
  if (split !== fieldNames.length || !lines.slice(split + 1).some(line => line.trim())) {
    reject('supply ten headers, a blank separator, and a nonempty text body.');
  }
  const headers = new Map();
  for (const line of lines.slice(0, split)) {
    const parts = /^([A-Za-z0-9-]+): ([!-~](?:[ -~]*[!-~])?)$/u.exec(line);
    if (!parts || !fieldNames.includes(parts[1]) || headers.has(parts[1]) || parts[2].includes('=?')) {
      reject('unsupported, duplicated, folded, or encoded header.');
    }
    headers.set(parts[1], parts[2]);
  }
  return headers;
}

export function parseConstructionEmail(bytes) {
  const { raw, lines } = readText(bytes);
  const headers = readHeaders(lines);
  if (headers.get('MIME-Version') !== '1.0' ||
      headers.get('Content-Type') !== 'text/plain; charset=UTF-8' ||
      headers.get('Content-Transfer-Encoding') !== '8bit') {
    reject('only the declared single-part UTF-8 plain-text format is supported.');
  }
  if (!fixtureMailbox.test(headers.get('From')) || !fixtureMailbox.test(headers.get('To'))) {
    reject('fixture From and To must be single construction.invalid addresses.');
  }
  const messageId = fixtureMessageId.exec(headers.get('Message-ID'));
  if (!messageId) reject('Message-ID must be a bracketed construction.invalid identifier.');
  const declaredDate = headers.get('Date');
  const timestamp = Date.parse(declaredDate);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toUTCString() !== declaredDate) {
    reject('Date must be a real canonical GMT mail date.');
  }
  const reference = headers.get('Subject');
  if (reference.length > 120) reject('Subject must be at most 120 ASCII characters.');
  const kind = headers.get('X-CON01-Kind');
  if (!['insurance', 'license'].includes(kind)) reject('kind must be insurance or license.');
  const validUntil = headers.get('X-CON01-Valid-Until');
  const expiry = Date.parse(validUntil);
  if (!utcInstant.test(validUntil) || !Number.isFinite(expiry) || new Date(expiry).toISOString() !== validUntil) {
    reject('valid-until must be a real canonical UTC timestamp.');
  }
  return {
    kind,
    sourceId: 'eml-' + messageId[1],
    reference,
    validUntil,
    content: 'eml-v1:' + raw.toString('base64'),
    rawSha256: createHash('sha256').update(raw).digest('hex'),
  };
}

export function prepareConstructionEmail(bytes, context) {
  if (!context || ![Object.prototype, null].includes(Object.getPrototypeOf(context)) ||
      Reflect.ownKeys(context).length !== contextFields.length ||
      contextFields.some(field => typeof Object.getOwnPropertyDescriptor(context, field)?.value !== 'string')) {
    reject('supply only the six explicit fixture submission context fields.');
  }
  const { rawSha256, ...source } = parseConstructionEmail(bytes);
  return { input: { ...Object.fromEntries(contextFields.map(field => [field, context[field]])), channel: 'email', ...source }, rawSha256 };
}
