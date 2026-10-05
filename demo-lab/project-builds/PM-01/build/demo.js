import assert from 'node:assert/strict';
import { maintenance } from '../../../extra-scenarios.mjs';
const cases = [
 ['Emergency', {description:'Gas leak near boiler',accessApproved:false}, 'human_emergency_operator'],
 ['Access missing', {description:'Broken cupboard',accessApproved:false}, 'access_confirmation'],
 ['Access approved', {description:'Broken cupboard',accessApproved:true}, 'vendor_review']
].map(([name,input,queue]) => { const output=maintenance(input); assert.equal(output.queue,queue); assert.equal(output.dispatchAllowed,false); return {name,passed:true,output}; });
assert.throws(()=>maintenance({description:''}),/Description required/);
cases.push({name:'Empty description rejected',passed:true});
console.log(JSON.stringify({projectId:'PM-01',evaluation:{passed:cases.length,total:cases.length,cases}},null,2));
