import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { reliabilityDesk } from './reliability.mjs';
import { verifyReliabilityReceipt } from './ops-receipt-integrity.mjs';

const directory = mkdtempSync(join(tmpdir(), 'portfolio-ops-'));
const file = join(directory, 'integrity.sqlite');
const projectId = 'OPS-01';
let writer;

function submit(desk, eventId) {
  const receipt = desk.submit(projectId, {
    projectId, eventId, storageConsent: true,
    contact: { email: 'ops-fixture@example.test' },
  });
  desk.review(receipt.receiptId, 'Fixture operator');
  return receipt.receiptId;
}

function inspect(read) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return read(id => verifyReliabilityReceipt(db, id));
  } finally {
    db.close();
  }
}

try {
  writer = new DatabaseSync(file);
  let desk = reliabilityDesk(writer);
  const success = submit(desk, 'demo-success');
  desk.execute(success, 'success');

  const lost = submit(desk, 'demo-lost-ack');
  desk.execute(lost, 'timeout_after');

  const stopped = submit(desk, 'demo-retry-cap');
  desk.execute(stopped, 'timeout_before');
  desk.execute(stopped, 'timeout_before');
  writer.close();

  const before = inspect(verify => ({
    accepted: verify(success), uncertainAfterRestart: verify(lost), retryCap: verify(stopped),
  }));
  writer = new DatabaseSync(file);
  desk = reliabilityDesk(writer);
  desk.reconcile(lost);
  const recovered = inspect(verify => verify(lost));

  // Fault injection affects only this disposable synthetic database.
  writer.prepare('UPDATE reliability_effects SET payload = ? WHERE intent_id = ?').run('{}', success);
  const tampered = inspect(verify => verify(success));

  console.log(JSON.stringify({
    fixture: 'synthetic',
    scope: 'Read-only local receipt checks. No external provider or cryptographic attestation.',
    ...before, recovered, tampered,
  }, null, 2));

  if (!before.accepted.valid || !before.uncertainAfterRestart.valid || !before.retryCap.valid ||
      !recovered.valid || tampered.valid || tampered.effect.status !== 'payload_mismatch') {
    process.exitCode = 1;
  }
} finally {
  if (writer?.isOpen) writer.close();
  rmSync(directory, { recursive: true, force: true });
}
