import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { planContact } from '../integrations/ghl-n8n/contract.mjs';

const config = { projectId: 'RE-01', locationId: 'DEMO_LOCATION' };
const event = () => ({ projectId: 'RE-01', eventId: 'demo-1', storageConsent: true,
  contact: { email: ' Demo@Example.com ', firstName: 'Demo' } });

test('normalizes identity, minimizes data and never authorizes communication', () => {
  const input = event();
  input.contact.tags = ['erase-old-tags']; input.contact.dnd = false;
  input.contact.notes = 'Private customer details'; input.contact.phone = '+12345678901';
  const original = structuredClone(input);
  const result = planContact(input, config);
  assert.deepEqual(result.request.body, { locationId: 'DEMO_LOCATION', email: 'demo@example.com',
    firstName: 'Demo', source: 'portfolio:RE-01' });
  assert.equal(result.communicationAllowed, false);
  assert.deepEqual(input, original);
  assert.deepEqual(result, planContact(input, config));
});

for (const [label, patch, reason] of [
  ['missing consent', { storageConsent: undefined }, 'storage_consent_required'],
  ['string consent', { storageConsent: 'true' }, 'storage_consent_required'],
  ['revoked consent', { storageConsent: false }, 'storage_consent_required'],
  ['wrong tenant', { locationId: 'OTHER' }, 'tenant_mismatch'],
  ['wrong project', { projectId: 'ACC-01' }, 'project_mismatch'],
  ['sensitive record', { sensitive: true }, 'sensitive_record'],
  ['missing contact', { contact: null }, 'invalid_contact'],
  ['bad email', { contact: { email: 'broken' } }, 'invalid_email'],
  ['oversize email', { contact: { email: `${'a'.repeat(255)}@example.com` } }, 'invalid_email'],
  ['wrong name type', { contact: { email: 'a@example.com', firstName: {} } }, 'invalid_name'],
  ['oversize name', { contact: { email: 'a@example.com', firstName: 'a'.repeat(101) } }, 'invalid_name'],
  ['invalid event key', { eventId: 'a:b' }, 'invalid_event_id'],
  ['oversize event key', { eventId: 'a'.repeat(129) }, 'invalid_event_id'],
]) {
  test(`rejects ${label} without a request`, () => {
    assert.deepEqual(planContact({ ...event(), ...patch }, config), { status: 'rejected', reason });
  });
}

test('rejects malformed root and configuration', () => {
  for (const input of [null, false, 'text', [], 1]) assert.equal(planContact(input, config).status, 'rejected');
  for (const input of [null, {}, { locationId: '../bad' }]) assert.equal(planContact(event(), input).status, 'rejected');
});

test('event keys distinguish locations, projects and events', () => {
  const first = planContact(event(), config).eventKey;
  assert.notEqual(first, planContact({ ...event(), eventId: 'demo-2' }, config).eventKey);
  assert.notEqual(first, planContact(event(), { ...config, locationId: 'OTHER' }).eventKey);
  assert.notEqual(first, planContact({ ...event(), projectId: 'ACC-01' }, { ...config, projectId: 'ACC-01' }).eventKey);
});

const catalog = JSON.parse(readFileSync(new URL('../showcase/catalog.json', import.meta.url)));
for (const project of catalog) {
  test(`${project.id}: actual n8n Code nodes execute and enforce the shared contract`, () => {
    const flow = JSON.parse(readFileSync(new URL(`../showcase/${project.id}/n8n-workflow.json`, import.meta.url)));
    assert.equal(flow.active, false);
    assert.equal(flow.nodes.length, 3);
    assert.equal(flow.nodes.some(n => n.type.includes('httpRequest') || n.credentials), false);
    const execute = (code, items = []) => vm.runInNewContext(`(function(){${code}\n})()`, {
      $input: { all: () => items },
    }, { timeout: 1000 });
    const items = execute(flow.nodes[1].parameters.jsCode);
    const results = execute(flow.nodes[2].parameters.jsCode, items);
    assert.equal(results[0].json.status, 'ready');
    assert.equal(results[0].json.projectId, project.id);
    assert.deepEqual(JSON.parse(JSON.stringify(results[0].json)), planContact(items[0].json.event, items[0].json.config));
    items[0].json.event.locationId = 'ATTACKER';
    const rejected = execute(flow.nodes[2].parameters.jsCode, items)[0].json;
    assert.equal(rejected.reason, 'tenant_mismatch');
    assert.equal(rejected.request, undefined);
    const blueprint = JSON.parse(readFileSync(new URL(`../showcase/${project.id}/ghl-build.json`, import.meta.url)));
    assert.equal(blueprint.projectId, project.id);
    assert.equal(blueprint.messagingEnabled, false);
    assert.ok(blueprint.stages.length >= 3);
  });
}
