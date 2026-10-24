import {readFileSync,readdirSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {govern} from './governor-core.mjs';
const root=new URL('../',import.meta.url);
export function sourceSnapshot(){
 const entries=[];
 function walk(url,prefix=''){for(const e of readdirSync(url,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','.runtime','.git','.venv','__pycache__','reports','dist','.next'].includes(e.name))continue;const name=prefix+e.name;if(e.isDirectory())walk(new URL(e.name+'/',url),name+'/');else if(/\.(mjs|js|ts|tsx|html|css|py|json)$/.test(name)&&!['governance-report.json','build-review.json'].includes(e.name))entries.push([name,createHash('sha256').update(readFileSync(new URL(e.name,url))).digest('hex')]);}}
 walk(root);return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}
export function saveGovernance(report){const target=new URL('./governance-report.json',import.meta.url),temp=new URL('./.runtime/governance-report.tmp',import.meta.url);writeFileSync(temp,JSON.stringify(report,null,2)+'\n');renameSync(temp,target);}
export function assessGovernance(report,current){if(!report||!Array.isArray(report.results)||!report.governor)throw Error('Malformed governor evidence');const stale=report.after!==current;const checked=govern(report);return {...report,currentSnapshot:current,stale,effectiveDecision:stale?'incomplete-evidence':checked.decision,governor:stale?{...report.governor,reasons:['No completed review matches the current source snapshot.']}:checked};}
export function currentGovernance(){try{return assessGovernance(JSON.parse(readFileSync(new URL('./governance-report.json',import.meta.url),'utf8')),sourceSnapshot());}catch{return {effectiveDecision:'incomplete-evidence',stale:true,governor:{decision:'incomplete-evidence',reasons:['No readable governor report. Run npm run govern.']},results:[]};}}
