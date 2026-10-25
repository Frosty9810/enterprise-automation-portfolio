import {readFileSync,readdirSync,existsSync,lstatSync} from 'node:fs';
import {industryDeskDefinitions,industryDeskRoute} from './industry-desk-routes.mjs';
const manifestDirectory=new URL('./industry-desks/',import.meta.url);
const denied=new Set(['constructor','prototype','__proto__','close','catalog']);
const bounded=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max;
export function loadIndustryDesks(directory=manifestDirectory){
  const result=[],seen=new Set();
  for(const name of readdirSync(directory).filter(name=>name.endsWith('.json')).sort()){
    if(!Object.values(industryDeskDefinitions).some(definition=>name===definition.slug+'.json'))throw Error('Unknown industry manifest filename.');
    const url=new URL(name,directory),info=lstatSync(url);if(!info.isFile()||info.isSymbolicLink()||info.size>16000)throw Error('Invalid industry manifest file.');
    const value=JSON.parse(readFileSync(url,'utf8'));
    if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='operations,projectId,scope,summary')throw Error('Invalid industry manifest fields.');
    if(typeof value.projectId!=='string'||!Object.hasOwn(industryDeskDefinitions,value.projectId)||seen.has(value.projectId))throw Error('Unknown or duplicate industry identity.');
    const definition=industryDeskDefinitions[value.projectId];
    if(name!==definition.slug+'.json'||!bounded(value.summary,500)||!bounded(value.scope,2000))throw Error('Invalid industry manifest scope or filename.');
    if(!value.operations||Array.isArray(value.operations)||Object.getPrototypeOf(value.operations)!==Object.prototype||!Object.keys(value.operations).length||Object.keys(value.operations).length>25)throw Error('Invalid industry operation registry.');
    for(const [operation,method] of Object.entries(value.operations))if(!/^[a-z][a-z0-9-]{0,49}$/.test(operation)||typeof method!=='string'||!/^[a-z][A-Za-z0-9]{0,49}$/.test(method)||denied.has(operation)||denied.has(method))throw Error('Unsafe industry operation.');
    seen.add(value.projectId);result.push({...value,...definition,operations:new Map(Object.entries(value.operations))});
  }
  return result;
}
export function decorateIndustryInventory(records,manifests=loadIndustryDesks()){
  for(const manifest of manifests)if(!records.some(row=>row.collection==='automation'&&row.id===manifest.projectId))throw Error('Industry manifest has no existing catalog entry.');
  return records.map(row=>{const manifest=manifests.find(item=>row.collection==='automation'&&row.id===item.projectId);return manifest?{...row,summary:manifest.summary,scope:manifest.scope,status:'partial-local',href:industryDeskRoute(row.collection,row.id)}:{...row};});
}
export function createIndustryDeskHost(db){
  const manifests=new Map(loadIndustryDesks().map(value=>[value.slug,value])),pending=new Map();
  for(const manifest of manifests.values())for(const suffix of ['-core.mjs','.html','.css','-ui.mjs'])if(!existsSync(new URL('./'+manifest.slug+suffix,import.meta.url)))throw Error('Registered industry desk is missing an executable file.');
  async function desk(slug){
    const manifest=manifests.get(slug);if(!manifest)return null;
    if(!pending.has(slug))pending.set(slug,(async()=>{const module=await import(new URL('./'+slug+'-core.mjs',import.meta.url));const factory=module[manifest.factory];if(typeof factory!=='function')throw Error('Industry factory is not implemented.');const value=factory(db);if(!value||typeof value!=='object'||!Object.hasOwn(value,'catalog')||typeof value.catalog!=='function')throw Error('Industry catalog is not implemented.');for(const method of manifest.operations.values())if(!Object.hasOwn(value,method)||typeof value[method]!=='function')throw Error('Industry operation is not implemented.');return value;})().catch(error=>{pending.delete(slug);throw error;}));
    return pending.get(slug);
  }
  return {
    has:slug=>manifests.has(slug),
    hasOperation:(slug,operation)=>manifests.get(slug)?.operations.has(operation)??false,
    async catalog(slug){const value=await desk(slug);return value?value.catalog():null;},
    async invoke(slug,operation,body){const manifest=manifests.get(slug),method=manifest?.operations.get(operation);if(!method)throw Error('Unknown industry operation.');return (await desk(slug))[method](body);},
    asset(path){
      if(path==='/industry-desk-routes.mjs')return {url:new URL('./industry-desk-routes.mjs',import.meta.url),type:'text/javascript; charset=utf-8',page:false};
      for(const {slug} of manifests.values()){
        if(path==='/industry/'+slug)return {url:new URL('./'+slug+'.html',import.meta.url),type:'text/html; charset=utf-8',page:true};
        if(path==='/'+slug+'.css'||path==='/'+slug+'-ui.mjs')return {url:new URL('./'+path.slice(1),import.meta.url),type:path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',page:false};
      }
      return null;
    },
  };
}
