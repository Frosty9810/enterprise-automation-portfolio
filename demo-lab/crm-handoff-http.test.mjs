import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLabServer, openStore } from './server.mjs';

const time = minute => '2026-11-16T10:' + String(minute).padStart(2, '0') + ':00.000Z';
const event = (eventId, leadId, stage, minute) => ({
  eventId, leadId, stage, occurredAt: time(minute),
  source: stage === 'inquiry' ? 'paid_search' : null,
  campaign: stage === 'inquiry' ? 'launch_demo' : null,
});

async function startStore(path) {
  const db = openStore(path);
  let server;
  try {
    server = createLabServer(db);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    db.close();
    throw error;
  }
  const port = server.address().port;
  return {
    call(operation, body, headers = {}, method = 'POST') {
      return new Promise((resolve, reject) => {
        const payload = method === 'POST' ? JSON.stringify(body) : '';
        const client = request({
          hostname: '127.0.0.1', port, method, path: '/api/crm-funnel/' + operation,
          signal: AbortSignal.timeout(5000),
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'X-Demo-Client': 'local-showcase',
            ...headers,
          },
        }, response => {
          let content = '';
          response.setEncoding('utf8');
          response.on('data', chunk => { content += chunk; });
          response.on('error', reject);
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode, body: JSON.parse(content) });
            } catch (error) {
              reject(error);
            }
          });
        });
        client.on('error', reject);
        client.end(payload);
      });
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      db.close();
    },
  };
}

test('CRM loopback API rejects unsafe authorities, origins and malformed request envelopes', async t => {
  const lab = await startStore(':memory:');
  t.after(() => lab.close());
  const inquiry = event('inquiry-a', 'lead-a', 'inquiry', 0);
  const input = { events: [inquiry] };

  for (const headers of [
    { Host: 'outside.invalid' },
    { Origin: 'https://outside.invalid' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'X-Demo-Client': '' },
  ]) {
    assert.equal((await lab.call('ingest', input, headers)).status, 403);
    assert.equal((await lab.call('report', { asOf: time(5) }, headers)).status, 403);
  }
  assert.equal((await lab.call('report', undefined, {}, 'GET')).status, 404);
  assert.equal((await lab.call('report', undefined, {}, 'PUT')).status, 405);
  for (const body of [null, [], { events: [inquiry], extra: true }, {}]) {
    assert.deepEqual(await lab.call('ingest', body), {
      status: 400, body: { error: 'Supply exactly: events' },
    });
  }
  assert.equal((await lab.call('report', { asOf: time(5), limit: 1 })).status, 400);
  assert.equal((await lab.call('report', { asOf: '2026-11-16T10:05:00Z' })).status, 400);
  assert.equal((await lab.call('ingest', { events: [inquiry, { ...inquiry, extra: true }] })).status, 400);
  assert.deepEqual(await lab.call('report', { asOf: time(5) }), { status: 200, body: [] });
});

test('CRM loopback API keeps event-time cutoffs and exactly replays a batch after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-http-'));
  const file = join(directory, 'lab.sqlite');
  const inquiry = event('inquiry-a', 'lead-a', 'inquiry', 0);
  const batch = [
    event('intake-a', 'lead-a', 'intake_started', 8),
    event('handoff-a', 'lead-a', 'handed_off', 6),
    inquiry,
    event('qualified-a', 'lead-a', 'qualified', 2),
  ];
  let lab;
  try {
    lab = await startStore(file);
    assert.deepEqual(await lab.call('ingest', { events: batch }), {
      status: 200, body: { inserted: 4, replayed: 0 },
    });
    const early = await lab.call('report', { asOf: time(7) });
    assert.equal(early.status, 200);
    assert.equal(early.body[0].handed_off, 1);
    assert.equal(early.body[0].intake_started, 0);
    assert.equal(early.body[0].handoff_to_intake_rate, 0);

    await lab.close();
    lab = undefined;
    lab = await startStore(file);
    assert.deepEqual(await lab.call('ingest', { events: batch }), {
      status: 200, body: { inserted: 0, replayed: 4 },
    });
    const collision = await lab.call('ingest', { events: [
      event('inquiry-b', 'lead-b', 'inquiry', 4),
      { ...inquiry, campaign: 'different' },
    ] });
    assert.equal(collision.status, 400);
    assert.match(collision.body.error, /different payload/);
    assert.deepEqual(await lab.call('report', { asOf: time(8) }), {
      status: 200,
      body: [{
        source: 'paid_search', campaign: 'launch_demo', inquiries: 1, qualified: 1,
        handed_off: 1, intake_started: 1, inquiry_to_qualified_rate: 1,
        qualified_to_handoff_rate: 1, handoff_to_intake_rate: 1,
        inquiry_to_intake_rate: 1, average_handoff_ms: 4 * 60_000,
      }],
    });
  } finally {
    if (lab) await lab.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
