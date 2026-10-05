import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maintenanceDispatch, openDecisionRegister, depthFixtures, evaluateIndustryDepth } from './industry-depth.mjs';

test('maintenance dispatch respects exact window boundaries and deterministic vendor ordering', () => {
  const input = structuredClone(depthFixtures.maintenance);
  input.vendors.push({ ...structuredClone(input.vendors[0]), id: 'a-approved-vendor' });
  const result = maintenanceDispatch(input);
  assert.equal(result.appointment.vendorId, 'a-approved-vendor');
  assert.equal(result.appointment.end, '2026-09-10T13:00:00.000Z');
  assert.equal(result.dispatchAllowed, false);
  input.vendors[1].approved = false;
  assert.equal(maintenanceDispatch(input).appointment.vendorId, 'demo-plumber');
  input.vendors[0].skills = ['electrical'];
  assert.equal(maintenanceDispatch(input).queue, 'scheduling_review');
});

test('maintenance rejects impossible calendar timestamps and duplicate vendor IDs', () => {
  const input = structuredClone(depthFixtures.maintenance);
  assert.throws(() => maintenanceDispatch({ ...input, asOf: '2026-02-30T10:00:00.000Z' }), /UTC/);
  assert.throws(() => maintenanceDispatch({ ...input, receivedAt: '2026-09-11T10:00:00.000Z' }), /future/);
  assert.throws(() => maintenanceDispatch({ ...input, durationMinutes: -1 }), /Duration/);
  input.vendors.push(structuredClone(input.vendors[0]));
  assert.throws(() => maintenanceDispatch(input), /Duplicate vendor/);
  assert.equal(maintenanceDispatch({ ...input, description: 'Smoke near socket' }).queue, 'human_emergency_operator');
});

test('durable register survives reopen and never overwrites a conflicting identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-register-'));
  const filename = join(directory, 'register.sqlite');
  const fixture = structuredClone(depthFixtures.register);
  let store = openDecisionRegister(filename);
  try {
    assert.equal(store.ingest(fixture).retained, 1);
    store.close();
    store = openDecisionRegister(filename);
    assert.equal(store.ingest(fixture).duplicates, 1);
    assert.equal(store.ingest({ ...fixture, items: [{ ...fixture.items[0], text: 'Changed commitment' }] }).conflicts, 1);
    assert.equal(store.entries()[0].text, fixture.items[0].text);
    assert.equal(store.events().length, 2);
    assert.equal(store.events()[1].event, 'identity_conflict_requires_review');
  } finally {
    store.close();
    // Only the exact temporary file and now-empty directory created by this test.
    rmSync(filename); rmdirSync(directory);
  }
});

test('source permissions fail closed and denied message contents never persist', () => {
  const store = openDecisionRegister();
  try {
    const fixture = structuredClone(depthFixtures.register);
    assert.equal(store.ingest({ ...fixture, principal: 'outsider', items: undefined }).queue, 'access_denied');
    assert.deepEqual(store.entries(), []);
    assert.deepEqual(store.events(), []);
    assert.throws(() => store.ingest({ ...fixture, allowedReaders: undefined }), /ACL/);
    assert.throws(() => store.ingest({ ...fixture, items: [...fixture.items, { id: 'invalid' }] }), /required/);
    assert.deepEqual(store.entries(), []);
  } finally { store.close(); }
});

test('decisions and commitments retain owner review and distinct source identities', () => {
  const store = openDecisionRegister();
  try {
    const fixture = structuredClone(depthFixtures.register);
    store.ingest({ ...fixture, items: [{ ...fixture.items[0], kind: 'decision', confirmed: true, confirmedBy: 'Different person' }] });
    assert.equal(store.entries()[0].status, 'needs_owner_review');
    store.ingest({ ...fixture, sourceId: 'another-meeting', items: [{ ...fixture.items[0], confirmed: true, confirmedBy: 'Demo owner' }] });
    assert.equal(store.entries().length, 2);
    assert.equal(store.entries().find(e => e.sourceId === 'another-meeting').status, 'confirmed');
  } finally { store.close(); }
});

test('showcase evaluation executes six checks for each deeper industry demo', () => {
  for (const id of ['PM-01', 'EA-01']) {
    const result = evaluateIndustryDepth(id);
    assert.equal(result.projectId, id);
    assert.equal(result.evaluation.passed, 6);
    assert.equal(result.evaluation.total, 6);
  }
});
