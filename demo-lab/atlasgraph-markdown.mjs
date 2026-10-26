import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {atlasGraph,atlasGraphLimits,atlasGraphLoadedImplementationHash} from './atlasgraph-core.mjs';

const FORMAT='markdown-atx-v1';
const SCOPE='Bounded local Markdown ATX source ingestion. Exact raw source bytes and page spans are preserved; claims, references and approval remain separately supplied review annotations, not inferred truth. Explicit compilation replaces the tenant whole snapshot. No CommonMark engine, semantic extraction, authenticated reviewer, filesystem path, URL, model or provider integration is used.';
const FILES=['atlasgraph-core.mjs','atlasgraph-markdown.mjs','atlasgraph-markdown-example.json'];
const LIMITS=Object.freeze({inputBytes:30000,sources:12,pages:32,pageText:8000});
const copy=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const rawHash=value=>createHash('sha256').update(value,'utf8').digest('hex');
export class AtlasMarkdownError extends Error{constructor(message,code='invalid_input'){super(message);this.name='AtlasMarkdownError';this.code=code;this.status=['stale_implementation','preview_mismatch','snapshot_conflict'].includes(code)?409:400;}}
const fail=(message,code)=>{throw new AtlasMarkdownError(message,code);};
function safe(value,depth=0){if(depth>12)fail('Markdown request nesting exceeds 12 levels.');if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return;if(!value||typeof value!=='object'||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))fail('Only finite plain JSON is accepted.');if(Object.keys(value).length>256)fail('Markdown request collection exceeds 256 entries.');for(const[key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))fail('Prototype-related keys are forbidden.');safe(item,depth+1);}}
function shape(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Unexpected or missing Markdown request fields.');}
function text(value,label,max=200){if(typeof value!=='string'||!value.trim()||value.length>max||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail('Invalid '+label+'.');}
function id(value){text(value,'identifier',80);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))fail('Invalid identifier format.');}
function list(value,min,max,label){if(!Array.isArray(value)||value.length<min||value.length>max)fail('Invalid '+label+' count.');}
function identity(value,nullable=false){if(nullable&&value===null)return;if(typeof value!=='string'||! /^[a-f0-9]{64}$/u.test(value))fail('Expected a SHA-256 identity.');}
function disk(coreHash){return hash(FILES.map(name=>({name,sha256:name==='atlasgraph-core.mjs'&&coreHash?coreHash:createHash('sha256').update(readFileSync(new URL('./'+name,import.meta.url))).digest('hex')})));}
const LOADED=disk(atlasGraphLoadedImplementationHash),EXAMPLE=JSON.parse(readFileSync(new URL('./atlasgraph-markdown-example.json',import.meta.url),'utf8'));
function loadedCoreCurrent(){return createHash('sha256').update(readFileSync(new URL('./atlasgraph-core.mjs',import.meta.url))).digest('hex')===atlasGraphLoadedImplementationHash;}
function fresh(){if(disk()!==LOADED||!loadedCoreCurrent())fail('Markdown implementation or public example changed after load; restart before previewing or compiling.','stale_implementation');}

/** Column-zero ATX headings with explicit IDs and exact triple backtick/tilde fences only.
 * The page text is a contiguous untouched source slice, including its heading and EOLs.
 * No inline Markdown, links, relations or claim values are inferred.
 */
function sections(markdown){
 text(markdown,'raw Markdown',30000);if(/\r(?!\n)/u.test(markdown))fail('Raw Markdown must use LF or CRLF line endings.');
 const heads=[];let offset=0,lineNumber=1,fence=null;
 for(const match of markdown.matchAll(/[^\n]*(?:\n|$)/gu)){
  if(!match[0])continue;const raw=match[0],line=raw.replace(/\r?\n$/u,'');
  if(fence){if(new RegExp('^'+(fence==='`'?'`':'~')+'{3}[ \\t]*$','u').test(line))fence=null;}
  else{
   const open=/^(`{3}|~{3})([A-Za-z0-9_-]*)[ \t]*$/u.exec(line);
   if(open)fence=open[1][0];
   else if(/^\s*[`~]{3}/u.test(line))fail('Only column-zero exact triple fences with a simple optional language are supported.');
   else if(/^#{1,6} /u.test(line)){
    const heading=/^(#{1,6}) (.+) \{#([A-Za-z0-9][A-Za-z0-9._-]*)\}[ \t]*$/u.exec(line);
    if(!heading||heading[2].trim()!==heading[2]||/[{}]/u.test(heading[2]))fail('Every ATX heading needs a literal title and an explicit {#page-id} suffix.');
    text(heading[2],'heading title');id(heading[3]);heads.push({id:heading[3],title:heading[2],offset,lineNumber});
   }else if(/^\s*#/u.test(line)||/^\s*>\s*#/u.test(line)||/^\s*(?:=+|-+)[ \t]*$/u.test(line)||/^\s*<(?:[A-Za-z!/?])/u.test(line))fail('Unsupported or ambiguous Markdown heading, setext or HTML block layout.');
  }
  offset+=raw.length;lineNumber++;
 }
 if(fence)fail('A fenced block is not closed.');if(!heads.length)fail('Markdown must contain at least one explicit ATX page heading.');if(!/^(?:[ \t]*\r?\n)*[ \t]*$/u.test(markdown.slice(0,heads[0].offset)))fail('Only blank lines may precede the first page heading.');
 const seen=new Set();return heads.map((head,index)=>{if(seen.has(head.id))fail('Duplicate Markdown page ID.');seen.add(head.id);const start=index===0?0:head.offset,end=heads[index+1]?.offset??markdown.length,exact=markdown.slice(start,end);if(exact.length>atlasGraphLimits.text)fail('A Markdown page exceeds the existing 8000-character compiler limit.');return{id:head.id,title:head.title,text:exact,range:{pageId:head.id,startUtf16:start,endUtf16:end,startByte:Buffer.byteLength(markdown.slice(0,start),'utf8'),endByte:Buffer.byteLength(markdown.slice(0,end),'utf8')}};});
}
export function parseAtlasMarkdown(value){
 safe(value);shape(value,['tenant','sources']);if(Buffer.byteLength(JSON.stringify(value),'utf8')>LIMITS.inputBytes)fail('Markdown request exceeds 30000 UTF-8 bytes.');id(value.tenant);list(value.sources,1,LIMITS.sources,'source');const sources=[],sourceIds=new Set(),pageIds=new Set(),passports=[];
 for(const source of value.sources){shape(source,['id','version','title','approved','markdown','annotations']);id(source.id);id(source.version);text(source.title,'source title');if(typeof source.approved!=='boolean')fail('Source approval must be an explicit boolean.');if(sourceIds.has(source.id))fail('Duplicate Markdown source ID.');sourceIds.add(source.id);const parsed=sections(source.markdown);list(source.annotations,parsed.length,parsed.length,'page annotation');const annotations=new Map();for(const annotation of source.annotations){shape(annotation,['pageId','claims','references']);id(annotation.pageId);if(annotations.has(annotation.pageId))fail('Duplicate page annotation.');list(annotation.claims,0,12,'claim');list(annotation.references,0,6,'reference');annotations.set(annotation.pageId,annotation);}
  const pages=parsed.map(page=>{if(pageIds.has(page.id)||pageIds.size>=LIMITS.pages)fail('Page IDs must be unique and the whole snapshot cannot exceed 32 pages.');pageIds.add(page.id);const annotation=annotations.get(page.id);if(!annotation)fail('Every parsed page requires its own explicit annotation record.');annotations.delete(page.id);return{id:page.id,title:page.title,text:page.text,claims:copy(annotation.claims),references:copy(annotation.references)};});if(annotations.size)fail('An annotation names a page absent from its Markdown source.');const ranges=parsed.map(page=>page.range),sha256=rawHash(source.markdown);sources.push({id:source.id,version:source.version,title:source.title,approved:source.approved,pages,origin:{format:FORMAT,raw:source.markdown,sha256,ranges}});passports.push({sourceId:source.id,version:source.version,rawHash:sha256,rawBytes:Buffer.byteLength(source.markdown,'utf8'),rawUtf16:source.markdown.length,ranges:copy(ranges)});
 }
 return{compilePayload:{tenant:value.tenant,sources},passports};
}
function buildPreview(input,baseSnapshotHash){const parsed=parseAtlasMarkdown(input),db=new DatabaseSync(':memory:');let compiler;try{compiler=atlasGraph(db).compile(parsed.compilePayload);}finally{db.close();}const preview={schemaVersion:1,format:FORMAT,scope:SCOPE,tenant:input.tenant,implementationHash:LOADED,inputHash:hash(input),baseSnapshotHash,compilePayload:parsed.compilePayload,compiler,passports:parsed.passports};preview.previewHash=hash(preview);return preview;}
/** The caller owns the host database. Only explicit compile mutates graph rows. */
export function atlasMarkdown(db){
 const graph=atlasGraph(db);const current=tenant=>db.prepare('SELECT snapshot_hash FROM atlas_current WHERE tenant=?').get(tenant)?.snapshot_hash??null;
 return{
  catalog(){const implementationHash=disk();return{schemaVersion:1,format:FORMAT,scope:SCOPE,implementationHash,loadedImplementationHash:LOADED,stale:implementationHash!==LOADED||!loadedCoreCurrent(),limits:{...LIMITS},example:copy(EXAMPLE)};},
  preview(value){fresh();const input=parseAtlasMarkdown(value);const result=buildPreview(value,current(input.compilePayload.tenant));fresh();return result;},
  compile(value){safe(value);shape(value,['input','previewHash','implementationHash','baseSnapshotHash']);identity(value.previewHash);identity(value.implementationHash);identity(value.baseSnapshotHash,true);fresh();if(value.implementationHash!==LOADED)fail('The reviewed Markdown implementation identity differs from this loaded service.','stale_implementation');const preview=buildPreview(value.input,value.baseSnapshotHash);if(preview.previewHash!==value.previewHash)fail('Markdown preview no longer matches the exact reviewed input and base snapshot.','preview_mismatch');fresh();const compiler=graph.compile(preview.compilePayload,{expectedSnapshotHash:value.baseSnapshotHash});return{schemaVersion:1,tenant:preview.tenant,previewHash:preview.previewHash,implementationHash:LOADED,inputHash:preview.inputHash,baseSnapshotHash:value.baseSnapshotHash,compiler,passports:copy(preview.passports)};}
 };
}