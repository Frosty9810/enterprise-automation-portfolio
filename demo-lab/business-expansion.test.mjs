import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateExpansion,expansionProjects,reorder,crmHandoff,agentGate,recovery} from './business-expansion.mjs';
import {runDomain} from './server.mjs';
test('new business fixtures execute through actual domain entry points',async()=>{for(const p of expansionProjects){const e=evaluateExpansion(p.id);assert.equal(e.evaluation.passed,5);const result=await runDomain(p.id);assert.equal(JSON.parse(result.output).evaluation.total,5);}});
test('independent boundary cases preserve operational controls',()=>{
 assert.equal(reorder({sku:'X',onHand:0,reserved:0,target:12,packSize:12,stockAgeHours:24}).proposedUnits,12);
 assert.equal(crmHandoff({accountId:'A',owner:'B',email:'x@example.com',version:9,currentVersion:10,consent:true}).writeAllowed,false);
 assert.deepEqual(agentGate({ticketId:'X',tool:'send',estimatedCents:2,budgetCents:1,grounded:false}).reasons,['tool_not_allowed','budget_exceeded','grounding_review']);
 assert.equal(recovery({eventId:'X',attempt:2,status:503,retryAfterSeconds:0,confirmed:false,uncertain:false}).delaySeconds,4);
});

test('computed quantities and uncertain write flags reject malformed inputs',()=>{
 assert.throws(()=>reorder({sku:'X',onHand:0,reserved:0,target:Number.MAX_SAFE_INTEGER,packSize:2,stockAgeHours:0}),/safe integer/);
 assert.throws(()=>recovery({eventId:'X',attempt:1,status:500,retryAfterSeconds:0,confirmed:'true',uncertain:'true'}),/boolean/);
});
