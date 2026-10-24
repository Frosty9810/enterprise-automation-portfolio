import assert from 'node:assert/strict';
import { openTrustGate } from './trustgate-core.mjs';

// A reproducible fixture exercise, not an autonomous approval or attack benchmark.
const gateway = openTrustGate();
try {
  const expected = new Map([
    ['public-read','executed'], ['reviewed-task','executed'], ['public-note','executed'],
    ['blocked-private','blocked'], ['blocked-injection','blocked'], ['blocked-identity','blocked'],
  ]);
  const results = [];
  for (const scenario of gateway.catalog().scenarios) {
    const proposal = structuredClone(scenario.proposal);
    let receipt = gateway.prepare(proposal);
    const lookup = {tenant:receipt.tenant,receiptId:receipt.id};
    if (receipt.status === 'blocked') {
      assert.throws(()=>gateway.execute(lookup));
      assert.equal(expected.get(scenario.id),'blocked');
    } else {
      if (receipt.status === 'pending_review') {
        assert.throws(()=>gateway.execute(lookup));
        receipt = gateway.review({...lookup,reviewer:'acme-reviewer',decision:'approve',expectedHash:receipt.proposalHash,note:'Scripted review of this exact synthetic local fixture.'});
      }
      assert.equal(receipt.status,'ready');
      receipt = gateway.execute(lookup);
      const replay = gateway.execute(lookup);
      assert.equal(replay.replayed,true);
      assert.deepEqual(replay.effect,receipt.effect);
    }
    assert.equal(receipt.status,expected.get(scenario.id));
    results.push({scenario:scenario.id,tool:receipt.tool,status:receipt.status,reasons:receipt.reasons,proposalHash:receipt.proposalHash,receiptId:receipt.id});
  }
  assert.equal(results.length,expected.size);
  const state = gateway.state({tenant:'acme'}), audit = gateway.verifyAudit({tenant:'acme'});
  assert.equal(state.tasks.length,1); assert.equal(state.publicNotes.length,1); assert.equal(audit.valid,true);
  assert.deepEqual(gateway.state({tenant:'beta'}),{tasks:[],publicNotes:[]});
  console.log(JSON.stringify({measuredAt:new Date().toISOString(),passed:true,scenarios:results.length,results,state,audit,
    scope:'Six scripted synthetic scenarios in in-memory SQLite. Local reviewer selectors are not authenticated approvals. No external actions, model screening or general attack-success benchmark. File restart and concurrent execution are checked separately in the core tests.'},null,2));
} finally { gateway.close(); }
