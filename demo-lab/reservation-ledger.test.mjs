import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { reservationDesk, reservationExercise } from './reservation-ledger.mjs';

const input = (requestId = 'one') => ({ tenant: 'team-a', resourceId: 'calendar-a', requestId, start: '2026-11-01T09:00:00Z', end: '2026-11-01T10:00:00Z', asOf: '2026-11-01T08:00:00Z', bufferMinutes: 0, reviewed: true, reviewerLabel: 'Synthetic reviewer' });
const cancel = (reservation, requestId = 'cancel') => ({ tenant: 'team-a', requestId, reservationId: reservation.id, expectedRevision: reservation.revision, reviewed: true, reviewerLabel: 'Synthetic reviewer' });
function memory(run) { const db = new DatabaseSync(':memory:'); try { return run(reservationDesk(db), db); } finally { db.close(); } }
function temporary() {
    const directory = mkdtempSync(join(tmpdir(), 'portfolio-reservations-')), path = join(directory, 'fixture.sqlite');
    return { path, cleanup() { for (const file of [path, path + '-wal', path + '-shm', path + '-journal']) if (existsSync(file)) unlinkSync(file); rmdirSync(directory); } };
}

test('half-open reservations reject overlaps and allow touching endpoints', () => memory(desk => {
    desk.reserve(input());
    assert.equal(desk.reserve({ ...input('overlap'), start: '2026-11-01T09:59:59Z', end: '2026-11-01T11:00:00Z' }).action, 'reservation_held');
    assert.equal(desk.reserve({ ...input('adjacent'), start: '2026-11-01T10:00:00Z', end: '2026-11-01T11:00:00Z' }).action, 'locally_reserved');
    assert.equal(desk.state('team-a', 'calendar-a').length, 2);
}));

test('per-reservation buffers protect both occupied boundaries', () => memory(desk => {
    desk.reserve({ ...input(), bufferMinutes: 10 });
    assert.equal(desk.reserve({ ...input('buffered'), start: '2026-11-01T10:19:59Z', end: '2026-11-01T11:00:00Z', bufferMinutes: 10 }).action, 'reservation_held');
    assert.equal(desk.reserve({ ...input('touch'), start: '2026-11-01T10:20:00Z', end: '2026-11-01T11:00:00Z', bufferMinutes: 10 }).action, 'locally_reserved');
}));

test('equivalent command retries retain one effect/audit and changed identity rejects', () => memory(desk => {
    const first = desk.reserve(input());
    const replay = desk.reserve({ ...input(), start: '2026-11-01T05:00:00-04:00' });
    assert.equal(replay.reservation.id, first.reservation.id);
    assert.equal(replay.replayed, true);
    assert.equal(replay.newLocalEffects, 0);
    assert.equal(desk.audit('team-a').length, 1);
    assert.throws(() => desk.reserve({ ...input(), reviewerLabel: 'Different label' }), /Conflicting/);
    assert.equal(desk.state('team-a', 'calendar-a').length, 1);
}));

test('tenant and resource scopes isolate conflicts, reads and cancellation', () => memory(desk => {
    const first = desk.reserve(input());
    assert.equal(desk.reserve({ ...input(), tenant: 'team-b' }).action, 'locally_reserved');
    assert.equal(desk.reserve({ ...input('other-resource'), resourceId: 'calendar-b' }).action, 'locally_reserved');
    assert.throws(() => desk.cancel({ ...cancel(first.reservation), tenant: 'team-b' }), /Unknown/);
    assert.equal(desk.state('team-b', 'calendar-b').length, 0);
    assert.equal(desk.audit('team-b').length, 1);
}));

test('cancellation is revision-bound, replay-safe and releases the window', () => memory(desk => {
    const first = desk.reserve(input());
    assert.throws(() => desk.cancel({ ...cancel(first.reservation), expectedRevision: 2 }), /revision/);
    const done = desk.cancel(cancel(first.reservation));
    assert.equal(done.reservation.revision, 2);
    assert.equal(done.reservation.status, 'cancelled');
    assert.equal(desk.cancel(cancel(first.reservation)).newLocalEffects, 0);
    assert.throws(() => desk.cancel(cancel(first.reservation, 'stale')), /revision/);
    assert.equal(desk.reserve(input('replacement')).action, 'locally_reserved');
    assert.equal(desk.audit('team-a').length, 3);
}));

test('held receipts are historical: new intent is required after a conflicting booking is cancelled', () => memory(desk => {
    const first = desk.reserve(input());
    assert.equal(desk.reserve(input('blocked')).action, 'reservation_held');
    desk.cancel(cancel(first.reservation));
    assert.equal(desk.reserve(input('blocked')).action, 'reservation_held');
    assert.equal(desk.reserve(input('new-intent')).action, 'locally_reserved');
}));

test('malformed/unreviewed commands write no command or reservation records', () => memory(desk => {
    for (const change of [{ reviewed: false }, { reviewed: 'true' }, { bufferMinutes: true }, { bufferMinutes: -1 }, { bufferMinutes: 121 }, { bufferMinutes: 0.5 }, { tenant: '' }, { start: '2026-02-30T09:00:00Z' }, { end: '2026-11-01T08:00:00Z' }, { unexpected: true }])
        assert.throws(() => desk.reserve({ ...input(), ...change }));
    assert.equal(desk.state('team-a', 'calendar-a').length, 0);
    assert.equal(desk.audit('team-a').length, 0);
    const past = desk.reserve({ ...input(), asOf: '2026-11-01T09:00:01Z' });
    assert.deepEqual(past.reasons, ['past_window']);
    assert.equal(past.newLocalEffects, 0);
}));

test('file-backed state, replay receipts and audit survive connection restart', () => {
    const temp = temporary(); let db = new DatabaseSync(temp.path);
    try {
        let desk = reservationDesk(db); const first = desk.reserve(input());
        db.close(); db = new DatabaseSync(temp.path); desk = reservationDesk(db);
        assert.deepEqual(desk.state('team-a', 'calendar-a'), [first.reservation]);
        assert.equal(desk.reserve(input()).newLocalEffects, 0);
        assert.equal(desk.audit('team-a').length, 1);
        desk.cancel(cancel(first.reservation));
        db.close(); db = new DatabaseSync(temp.path); desk = reservationDesk(db);
        assert.equal(desk.state('team-a', 'calendar-a')[0].status, 'cancelled');
        assert.equal(desk.audit('team-a').length, 2);
    } finally { db.close(); temp.cleanup(); }
});

test('an audit write failure rolls back the reservation and command receipt together', () => memory((desk, db) => {
    db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON local_reservation_audit BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    assert.throws(() => desk.reserve(input()), /Injected audit failure/);
    assert.equal(desk.state('team-a', 'calendar-a').length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM local_reservation_commands').get().count, 0);
    assert.equal(desk.audit('team-a').length, 0);
    db.exec('DROP TRIGGER audit_failure');
    assert.equal(desk.reserve(input()).newLocalEffects, 1);
}));

test('two competing processes cannot both reserve the same shared SQLite window', async () => {
    const temp = temporary(), initial = new DatabaseSync(temp.path); reservationDesk(initial); initial.close();
    const moduleUrl = new URL('./reservation-ledger.mjs', import.meta.url).href;
    const script = `import {DatabaseSync} from 'node:sqlite';import {reservationDesk} from ${JSON.stringify(moduleUrl)};const db=new DatabaseSync(process.argv[1]);const desk=reservationDesk(db);console.log('READY');await new Promise(r=>process.stdin.once('data',r));try{console.log(JSON.stringify(desk.reserve({...${JSON.stringify(input())},requestId:process.argv[2]})));}finally{db.close();}`;
    const workers = ['racer-a', 'racer-b'].map(key => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', script, temp.path, key], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '', stderr = '', ready, rejectReady;
        const started = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
        child.stdout.on('data', data => { stdout += data; if (stdout.includes('READY\n')) ready(); });
        child.stderr.on('data', data => { stderr += data; });
        const timer = setTimeout(() => child.kill(), 10000);
        const result = new Promise((resolve, reject) => {
            child.on('error', error => { rejectReady(error); reject(error); });
            child.on('close', code => { clearTimeout(timer); if (code !== 0) { const error = Error(stderr); rejectReady(error); reject(error); } else { try { resolve(JSON.parse(stdout.trim().split('\n').at(-1))); } catch (error) { reject(error); } } });
        });
        result.catch(() => {});
        return { child, started, result };
    });
    try {
        await Promise.all(workers.map(worker => worker.started));
        workers.forEach(worker => worker.child.stdin.end('go'));
        const results = await Promise.all(workers.map(worker => worker.result));
        assert.deepEqual(results.map(result => result.action).sort(), ['locally_reserved', 'reservation_held']);
        assert.equal(results.reduce((sum, result) => sum + result.newLocalEffects, 0), 1);
        const db = new DatabaseSync(temp.path);
        try { const desk = reservationDesk(db); assert.equal(desk.state('team-a', 'calendar-a').length, 1); assert.equal(desk.audit('team-a').length, 2); } finally { db.close(); }
    } finally { await Promise.allSettled(workers.map(worker => worker.result)); temp.cleanup(); }
});

test('the visible exercise records one conflict, a zero-effect replay and a released-window replacement', () => {
    const result = reservationExercise();
    assert.deepEqual(result.steps.map(step => step.newLocalEffects), [1, 0, 0, 1, 1]);
    assert.equal(result.activeReservations, 1);
    assert.equal(result.auditEvents, 4);
    assert.equal(result.externalActions, 0);
});
