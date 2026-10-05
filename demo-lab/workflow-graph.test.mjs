import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowGraph } from './showcase.mjs';

test('workflow diagrams preserve routing channels, branches and source positions', () => {
  const graph = workflowGraph({
    nodes: [
      {id:'a',name:'Decision',type:'n8n-nodes-base.if',position:[-200,140]},
      {id:'b',name:'Accept',type:'n8n-nodes-base.code',position:[100,40]},
      {id:'c',name:'Review',type:'n8n-nodes-base.code'},
    ],
    connections: {Decision:{main:[[{node:'Accept'}],[{node:'Review'}]],ai_tool:[[{node:'Review'}]]}},
  });
  assert.deepEqual(graph.nodes[0].position,[-200,140]);
  assert.ok(graph.nodes[2].position.every(Number.isFinite));
  assert.deepEqual(graph.edges,[
    {from:'Decision',to:'Accept',channel:'main',branch:0},
    {from:'Decision',to:'Review',channel:'main',branch:1},
    {from:'Decision',to:'Review',channel:'ai_tool',branch:0},
  ]);
});
