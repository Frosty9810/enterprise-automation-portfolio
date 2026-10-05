import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const policyFile = fileURLToPath(new URL('../15 E-Commerce/ECOM-01 Multi-Market Product Content Governance/build/localization_engine.py', import.meta.url));
const python = fileURLToPath(new URL(process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url));
export const policyHash = () => hash(readFileSync(policyFile));
export const hash = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const identity = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`${label} required`);
  return value.trim();
};

/** The original Python policy is authoritative; this adapter never calls a provider. */
export function evaluateProduct(input) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(input);
    if (Buffer.byteLength(payload) > 32768) return reject(new Error('Product input exceeds 32 KiB'));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].includes(key.toUpperCase())));
    const child = spawn(python, [policyFile, '--stdin'], { env: {...env, PYTHONIOENCODING:'utf-8'}, windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let out = '', err = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Product policy timed out')); }, 10000);
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.stdout.on('data', chunk => { out += chunk; if(out.length > 65536) { child.kill(); finish(new Error('Policy output exceeds limit')); } });
    child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
    child.on('close', code => {
      if (code !== 0) return finish(new Error(err.trim() || 'Product policy failed'));
      try { finish(null, JSON.parse(out)); } catch { finish(new Error('Invalid policy output')); }
    });
    child.stdin.end(payload);
  });
}

/** Local synthetic authority. Actor labels are not authenticated identities. */
export function productDesk(db) {
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS product_sources(product_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, source_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_receipts(id TEXT PRIMARY KEY, product_id TEXT NOT NULL, revision INTEGER NOT NULL, source_hash TEXT NOT NULL, policy_hash TEXT NOT NULL, input TEXT NOT NULL, decision TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_reviews(receipt_id TEXT PRIMARY KEY REFERENCES product_receipts(id), reviewer TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_audit(sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, receipt_id TEXT NOT NULL REFERENCES product_receipts(id), detail TEXT NOT NULL, previous TEXT NOT NULL, event_hash TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS product_receipt_subject ON product_receipts(product_id, revision);`);
  const get = id => {
    const row = db.prepare('SELECT * FROM product_receipts WHERE id=?').get(identity(id,'Receipt'));
    if (!row) throw new Error('Unknown receipt');
    return row;
  };
  const append = (kind, receiptId, detail) => {
    const previous = db.prepare('SELECT event_hash FROM product_audit ORDER BY sequence DESC LIMIT 1').get()?.event_hash ?? 'GENESIS';
    const value = {kind,receiptId,detail,previous};
    db.prepare('INSERT INTO product_audit(kind,receipt_id,detail,previous,event_hash) VALUES(?,?,?,?,?)').run(kind,receiptId,canonical(detail),previous,hash(canonical(value)));
  };
  const transact = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch(error) { db.exec('ROLLBACK'); throw error; }
  };
  const current = (row, currentPolicy) => {
    const source = db.prepare('SELECT revision,source_hash FROM product_sources WHERE product_id=?').get(row.product_id);
    if (source.revision !== row.revision || source.source_hash !== row.source_hash) throw new Error('Source changed; evaluate and review the current revision');
    if (row.policy_hash !== currentPolicy) throw new Error('Policy changed; reevaluate before review or export');
  };
  const view = row => ({receiptId:row.id,sourceRevision:row.revision,sourceHash:row.source_hash,policyHash:row.policy_hash,decision:JSON.parse(row.decision),input:JSON.parse(row.input),review:db.prepare('SELECT reviewer FROM product_reviews WHERE receipt_id=?').get(row.id) ?? null,externalActions:0});
  return {
    save(input, decision, policy) {
      const {source,candidate} = input;
      if (!source || !candidate || !['blocked','human_review','auto_publish'].includes(decision?.decision?.action)) throw new Error('Valid policy decision required');
      if (!/^[0-9a-f]{64}$/.test(policy)) throw new Error('Policy hash required');
      const sourceHash = hash(canonical(source));
      const receiptId = hash(canonical({input,policy}));
      return transact(() => {
        const existing = db.prepare('SELECT * FROM product_sources WHERE product_id=?').get(source.product_id);
        if (existing && source.revision < existing.revision) throw new Error('Stale source revision');
        if (existing && source.revision === existing.revision && sourceHash !== existing.source_hash) throw new Error('Source identity conflict; increment the revision for a changed source');
        const replay = db.prepare('SELECT * FROM product_receipts WHERE id=?').get(receiptId);
        if (replay) return {...view(replay),replayed:true};
        db.prepare('INSERT INTO product_sources VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET revision=excluded.revision,source_hash=excluded.source_hash').run(source.product_id,source.revision,sourceHash);
        db.prepare('INSERT INTO product_receipts VALUES(?,?,?,?,?,?,?)').run(receiptId,source.product_id,source.revision,sourceHash,policy,canonical(input),canonical(decision));
        append('evaluated',receiptId,{action:decision.decision.action,policyHash:policy,sourceHash});
        return {...view(get(receiptId)),replayed:false};
      });
    },
    review(id, reviewer, expectedPolicy) {
      reviewer = identity(reviewer,'Reviewer label');
      return transact(() => {
        const row = get(id); current(row,expectedPolicy);
        if (JSON.parse(row.decision).decision.action === 'blocked') throw new Error('Blocked content cannot be approved; correct and reevaluate');
        const old = db.prepare('SELECT reviewer FROM product_reviews WHERE receipt_id=?').get(id);
        if (old && old.reviewer !== reviewer) throw new Error('Receipt already reviewed; original reviewer is retained');
        if (!old) { db.prepare('INSERT INTO product_reviews VALUES(?,?)').run(id,reviewer); append('reviewed',id,{reviewer}); }
        return {...view(row),replayed:!!old};
      });
    },
    export(id, expectedPolicy) {
      const row = get(id); current(row,expectedPolicy);
      const result = view(row);
      if (!result.review) throw new Error('Explicit review required before export');
      if (result.decision.decision.action === 'blocked') throw new Error('Blocked content cannot be exported');
      return {...result,format:'reviewed-product-handoff/v1',status:'reviewed_local_draft',scope:'Synthetic local draft. No storefront, CRM or provider write was performed.'};
    },
    audit() {
      return db.prepare('SELECT sequence,kind,receipt_id AS receiptId,detail,previous,event_hash AS eventHash FROM product_audit ORDER BY sequence').all().map(row=>({...row,detail:JSON.parse(row.detail)}));
    },
  };
}

export const productExample = {
  source:{product_id:'demo-frame-001',revision:7,sku:'FRAME-A4-OAK',locale:'en-US',title:'Solid oak A4 frame',description:'A 21 x 29 cm frame with a 24 month warranty.',material:'FSC-certified oak',dimensions_cm:'21 x 29',warranty_months:24},
  candidate:{locale:'es-ES',title:'Marco A4 de roble macizo',description:'Marco de 21 x 29 cm con una garantía de 24 meses.',material:'FSC-certified oak',dimensions_cm:'21 x 29',warranty_months:24},
};
