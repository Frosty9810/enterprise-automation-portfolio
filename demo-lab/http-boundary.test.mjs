import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createLabServer, openStore } from './server.mjs';

function request(port, { path = '/health', headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers, method }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

test('local HTTP boundary blocks rebinding hosts, foreign origins and cross-site reads', async t => {
  const db = openStore(':memory:');
  const server = createLabServer(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const port = server.address().port;
  assert.equal(await request(port), 200);
  assert.equal(await request(port, { headers: { Origin: `http://127.0.0.1:${port}` } }), 200);
  for (const Host of ['attacker.test', `attacker.test:${port}`, `127.0.0.1.attacker.test:${port}`, '127.0.0.1:1']) {
    assert.equal(await request(port, { path: '/api/contacts', headers: { Host } }), 403);
    assert.equal(await request(port, { method: 'POST', path: '/api/salesforce/start', headers: { Host, 'X-Demo-Client': 'local-showcase' } }), 403);
  }
  assert.equal(await request(port, { headers: { Origin: 'https://attacker.test' } }), 403);
  assert.equal(await request(port, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
  assert.equal(await request(port, { path: 'http://attacker.test/health' }), 400);
  assert.equal(await request(port, { path: '//attacker.test/health' }), 400);
  assert.equal(await request(port, { path: '/\\attacker.test/health' }), 400);
  assert.equal(await request(port, { headers: { Origin: 'null' } }), 403);
  assert.equal(await request(port), 200);
});

test('rejected authorities and origins cannot execute workflows or write run history', async t => {
  const db = openStore(':memory:');
  let executions = 0;
  const server = createLabServer(db, async id => { executions++; return { status: 'passed', projectId: id }; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const port = server.address().port;
  const base = { method: 'POST', path: '/api/run/RE-01' };
  for (const headers of [
    { Host: `attacker.test:${port}` },
    { Origin: 'https://attacker.test' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    assert.equal(await request(port, { ...base, headers: { 'X-Demo-Client': 'local-showcase', ...headers } }), 403);
  }
  assert.equal(executions, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 0);
  assert.equal(await request(port, { ...base, headers: { 'X-Demo-Client': 'local-showcase', Origin: `http://127.0.0.1:${port}` } }), 200);
  assert.equal(executions, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
});

test('same-authority navigation and loopback clients still read the lab', async t => {
  const db = openStore(':memory:');
  const server = createLabServer(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const port = server.address().port;
  for (const path of ['/health', '/api/projects', '/api/contacts']) {
    assert.equal(await request(port, { path, headers: { 'Sec-Fetch-Site': 'same-origin' } }), 200);
  }
});
