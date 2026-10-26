import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,writeFileSync,renameSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {openAtlasGraph,atlasGraph} from './atlasgraph-core.mjs';
import {openDockside,dockside} from './dockside-core.mjs';
const factories=[{name:'AtlasGraph',open:openAtlasGraph,init:atlasGraph,domain:'atlas_source_versions'},{name:'DocksideSLM',open:openDockside,init:dockside,domain:'dockside_events'}];
function temporary(t){const root=realpathSync(tmpdir()),dir=mkdtempSync(join(root,'portfolio-sqlite-startup-'));t.after(()=>{const target=realpathSync(dir);assert.ok(resolve(target).startsWith(resolve(root)+sep)&&basename(target).startsWith('portfolio-sqlite-startup-'),'recursive cleanup stays inside its verified named temporary test directory');rmSync(target,{recursive:true,force:true});});return dir;}
function capture(work,inject){const native=DatabaseSync.prototype.exec;let db,error;DatabaseSync.prototype.exec=function(sql){db??=this;if(inject)return inject.call(this,native,sql);return native.call(this,sql);};try{work();}catch(caught){error=caught;}finally{DatabaseSync.prototype.exec=native;}return{db,error};}
function closeIfOpen(db){if(db?.isOpen)db.close();}
function seeded(path){const db=new DatabaseSync(path);try{db.exec('CREATE TABLE startup_sentinel(value INTEGER NOT NULL); INSERT INTO startup_sentinel VALUES(42);');}finally{db.close();}}
for(const factory of factories){
 test(factory.name+' malformed-file startup closes its actual native connection without changing or repairing the file',t=>{
  const dir=temporary(t),path=join(dir,'malformed.sqlite'),moved=join(dir,'malformed-after-failure.sqlite'),original=Buffer.from('Public synthetic malformed SQLite startup fixture.\n');writeFileSync(path,original);const observed=capture(()=>factory.open(path));
  try{assert.ok(observed.error instanceof Error);assert.equal(observed.error.code,'ERR_SQLITE_ERROR');assert.ok(observed.db instanceof DatabaseSync,'captured native connection, not a mock close counter');assert.equal(observed.db.isOpen,false,'factory must release its owned connection before throwing');assert.deepEqual(readFileSync(path),original);renameSync(path,moved);assert.deepEqual(readFileSync(moved),original,'rename occurs before any manual handle cleanup');}finally{closeIfOpen(observed.db);}
 });
 for(const stage of ['early-pragma','domain-sql'])test(factory.name+' releases a real connection after '+stage+' failure and preserves the original native error',t=>{
  const dir=temporary(t),path=join(dir,'valid.sqlite'),moved=join(dir,'reopened.sqlite');seeded(path);let nativeError,triggered=false;const observed=capture(()=>factory.open(path),function(native,sql){if(!triggered&&(stage==='early-pragma'?sql.includes('PRAGMA'):sql.includes(factory.domain))){triggered=true;try{return native.call(this,'PRAGMA busy_timeout = (');}catch(error){nativeError=error;throw error;}}return native.call(this,sql);});
  try{assert.equal(triggered,true);assert.ok(nativeError instanceof Error);assert.strictEqual(observed.error,nativeError,'startup must preserve the exact native thrown object');assert.ok(observed.db instanceof DatabaseSync);assert.equal(observed.db.isOpen,false);renameSync(path,moved);const reopened=new DatabaseSync(moved);try{assert.equal(reopened.prepare('SELECT value FROM startup_sentinel').get().value,42,'actual native reopen/read succeeds before manual test cleanup');}finally{reopened.close();}}finally{closeIfOpen(observed.db);}
 });
 test(factory.name+' does not replace the startup cause if owned native close itself reports a secondary error',()=>{
  const nativeClose=DatabaseSync.prototype.close;let nativeError,closed=false;DatabaseSync.prototype.close=function(){nativeClose.call(this);closed=true;throw Error('Synthetic secondary cleanup error after native close');};let observed;
  try{observed=capture(()=>factory.open(':memory:'),function(native){try{return native.call(this,'PRAGMA busy_timeout = (');}catch(error){nativeError=error;throw error;}});assert.equal(closed,true);assert.strictEqual(observed.error,nativeError);assert.equal(observed.db.isOpen,false);}finally{DatabaseSync.prototype.close=nativeClose;closeIfOpen(observed?.db);}
 });
 test(factory.name+' leaves a caller-owned connection open when direct domain initialization fails',()=>{
  const db=new DatabaseSync(':memory:');try{const observed=capture(()=>factory.init(db),function(native,sql){if(sql.includes(factory.domain))return native.call(this,'PRAGMA busy_timeout = (');return native.call(this,sql);});assert.ok(observed.error instanceof Error);assert.strictEqual(observed.db,db);assert.equal(db.isOpen,true);assert.equal(db.prepare('SELECT 7 value').get().value,7);}finally{db.close();}
 });
 test(factory.name+' successful owned initialization, native reads, close and file reopen keep their normal lifecycle',t=>{
  const dir=temporary(t),path=join(dir,'success.sqlite');let api,observed=capture(()=>{api=factory.open(path);});try{assert.equal(observed.error,undefined);assert.equal(observed.db.isOpen,true);assert.equal(observed.db.prepare('PRAGMA busy_timeout').get().timeout,5000);assert.deepEqual(api.history({tenant:'acme'}).receipts,[]);api.close();assert.equal(observed.db.isOpen,false);const reopened=factory.open(path);try{assert.deepEqual(reopened.history({tenant:'acme'}).receipts,[]);}finally{reopened.close();}}finally{closeIfOpen(observed.db);}
 });
}