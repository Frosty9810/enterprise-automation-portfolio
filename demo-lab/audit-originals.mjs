import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { projects } from './catalog.mjs';

const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));
const base=join(root,'demo-lab/node_modules/n8n-nodes-base');
const known=JSON.parse(readFileSync(join(base,'dist/known/nodes.json'),'utf8'));
const credentials=JSON.parse(readFileSync(join(base,'dist/known/credentials.json'),'utf8'));
const results=[];
for(const project of projects){
  const file=join(root,project.source,'build/n8n-workflow.json');
  if(!existsSync(file))continue;
  const workflow=JSON.parse(readFileSync(file,'utf8'));
  const nodes=workflow.nodes.map(node=>{
    const key=node.type.replace('n8n-nodes-base.','');
    const record=known[key];
    let supported=[];let loadError=null;
    if(record){
      try{
        const module=require(join(base,record.sourcePath));
        const instance=new module[record.className]();
        supported=instance.nodeVersions?Object.keys(instance.nodeVersions).map(Number):[instance.description.version].flat();
      }catch(error){loadError=error.message}
    }
    return {name:node.name,type:node.type,requestedVersion:node.typeVersion,supportedVersions:supported,
      registered:!!record,versionSupported:supported.includes(node.typeVersion),loadError,
      unknownCredentials:Object.keys(node.credentials??{}).filter(key=>!credentials[key])};
  });
  results.push({projectId:project.id,nodes,compatible:nodes.every(n=>n.registered&&n.versionSupported&&!n.unknownCredentials.length)});
}
const report={measuredAt:new Date().toISOString(),n8nVersion:'2.38.1',scope:'Installed original node classes and version/credential registry; not execution or remote API validation.',projects:results};
writeFileSync(new URL('../reports/original-node-compatibility.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
for(const project of results){console.log(`${project.compatible?'PASS':'REVIEW'} ${project.projectId}`);for(const node of project.nodes.filter(n=>!n.versionSupported||n.unknownCredentials.length))console.log(`  ${node.name}: version ${node.requestedVersion}, supported ${node.supportedVersions.join(',')}; unknown credentials ${node.unknownCredentials.join(',')}; ${node.loadError??''}`)}
