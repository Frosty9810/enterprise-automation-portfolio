import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAgentRequest, MAX_AGENT_REQUEST_BYTES } from '../app/lib/agent-request.ts';

const request = (body, headers = {}) => new Request('https://example.test/api/run-agent', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
});
const fails = status => error => error.status === status;

test('agent API accepts a bounded task and rejects invalid shapes and types', async () => {
  assert.deepEqual(await readAgentRequest(request('{"agentId":" operations-016 ","task":" Review España "}')), { agentId: 'operations-016', task: 'Review España' });
  for (const body of ['null', '[]', '{}', 'invalid', '{"agentId":true,"task":42}', '{"agentId":"a","task":"short"}']) {
    await assert.rejects(readAgentRequest(request(body)), fails(400));
  }
  await assert.rejects(readAgentRequest(request('{}', { 'content-type': 'text/plain' })), fails(415));
  await assert.rejects(readAgentRequest(request(JSON.stringify({ agentId: 'a', task: 'x'.repeat(8_001) }))), fails(400));
});

test('agent API limits actual bytes with absent or misleading Content-Length and cancels the stream', async () => {
  await assert.rejects(readAgentRequest(request('{}', { 'content-length': String(MAX_AGENT_REQUEST_BYTES + 1) })), fails(413));
  await assert.rejects(readAgentRequest(request(JSON.stringify({ task: 'é'.repeat(MAX_AGENT_REQUEST_BYTES / 2) }))), fails(413));
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MAX_AGENT_REQUEST_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  const chunked = new Request('https://example.test/api/run-agent', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '2' }, body: stream, duplex: 'half' });
  await assert.rejects(readAgentRequest(chunked), fails(413));
  assert.equal(cancelled, true);
});

test('agent API preserves split UTF-8 sequences and rejects invalid encoding', async () => {
  const bytes = new TextEncoder().encode('{"agentId":"a","task":"Review España"}');
  let index = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(index, ++index));
  } });
  const split = new Request('https://example.test/api/run-agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' });
  assert.equal((await readAgentRequest(split)).task, 'Review España');
  await assert.rejects(readAgentRequest(request(new Uint8Array([0xff]))), fails(400));
});

test('agent API accepts the byte limit exactly and enforces identifier bounds', async () => {
  const body = JSON.stringify({ agentId: 'a'.repeat(100), task: 'x'.repeat(8000) });
  const exact = body + ' '.repeat(MAX_AGENT_REQUEST_BYTES - Buffer.byteLength(body));
  assert.equal((await readAgentRequest(request(exact, { 'content-type': 'Application/JSON; charset=utf-8' }))).task.length, 8000);
  await assert.rejects(readAgentRequest(request(exact + ' ')), fails(413));
  await assert.rejects(readAgentRequest(request(JSON.stringify({ agentId: 'a'.repeat(101), task: 'Review this task' }))), fails(400));
  await assert.rejects(readAgentRequest(request(JSON.stringify({ agentId: '   ', task: 'Review this task' }))), fails(400));
  await assert.rejects(readAgentRequest(request(JSON.stringify({ agentId: 'a', task: ' '.repeat(8) }))), fails(400));
});

test('agent API rejects missing and failed bodies without leaking producer errors', async () => {
  await assert.rejects(readAgentRequest(new Request('https://example.test/api/run-agent', {
    method: 'POST', headers: { 'content-type': 'application/json' },
  })), fails(400));
  const body = new ReadableStream({ start(controller) { controller.error(new Error('private producer details')); } });
  const broken = new Request('https://example.test/api/run-agent', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
  });
  await assert.rejects(readAgentRequest(broken), error => error.status === 400 && !error.message.includes('private'));
});

test('agent API retains the size rejection when the producer cancel hook throws', async () => {
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MAX_AGENT_REQUEST_BYTES + 1)); },
    cancel() { throw new Error('producer cancellation failed'); },
  });
  const oversized = new Request('https://example.test/api/run-agent', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
  });
  await assert.rejects(readAgentRequest(oversized), fails(413));
});
