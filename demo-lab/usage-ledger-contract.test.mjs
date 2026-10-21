import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageLedger } from './flagship-decisions.mjs';
import { flagshipFixtures } from './flagship-fixtures.mjs';
const fixture = () => structuredClone(flagshipFixtures.F10);

test('posted chronology, not arrival order, determines usage credits and evidence', () => {
    const input = fixture(), expected = usageLedger(input);
    input.events.reverse();
    const reordered = usageLedger(input);
    assert.deepEqual(reordered, expected);
});

test('equivalent explicit-offset instants and property order have one event identity', () => {
    const input = fixture(), expected = usageLedger(input);
    input.events.push({ postedAt: '2026-09-15T08:01:00-04:00', occurredAt: '2026-09-15T08:00:00-04:00', units: 100, id: 'usage-1' });
    assert.deepEqual(usageLedger(input), expected);
    input.events = input.events.map(e => ({ ...e, occurredAt: '2026-09-15T08:00:00-04:00' }));
    assert.deepEqual(usageLedger(input), expected);
});

test('decision identity binds close instant and event times even when amounts agree', () => {
    const input = fixture(), expected = usageLedger(input);
    input.closedAt = '2026-10-02T01:00:00.000Z';
    assert.equal(usageLedger(input).amountCents, expected.amountCents);
    assert.notEqual(usageLedger(input).ledgerHash, expected.ledgerHash);
    const moved = fixture();
    moved.events[0].postedAt = '2026-09-15T13:00:00.000Z';
    assert.notEqual(usageLedger(moved).ledgerHash, expected.ledgerHash);
    assert.equal(expected.ledgerHashVersion, 'usage-ledger-v2');
});

test('same-time multiple originals and credits are deterministic under every arrival permutation', () => {
    const input = fixture(), timestamp = '2026-09-15T12:00:00.000Z';
    input.events = [
        { id: 'original', units: 10, occurredAt: timestamp, postedAt: timestamp },
        { id: 'credit-b', units: -4, adjusts: 'original', occurredAt: timestamp, postedAt: timestamp },
        { id: 'credit-a', units: -6, adjusts: 'original', occurredAt: timestamp, postedAt: timestamp },
    ];
    const expected = usageLedger(input);
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
        const events = order.map(index => input.events[index]);
        assert.deepEqual(usageLedger({ ...input, events }), expected);
    }
    assert.equal(expected.amountCents, 0);
    input.events.push({ id: 'extra', units: -1, adjusts: 'original', occurredAt: timestamp, postedAt: timestamp });
    assert.throws(() => usageLedger(input), /exceeds/);
});

test('conflicting repeats and malformed adjustment relationships fail before output', () => {
    for (const change of [{ units: 99 }, { postedAt: '2026-09-16T12:00:00Z' }]) {
        const input = fixture();
        input.events.push({ ...input.events[0], ...change });
        assert.throws(() => usageLedger(input), /Conflicting/);
    }
    for (const adjusts of ['', 'missing', 'late-credit', null]) {
        const input = fixture(); input.events[1].adjusts = adjusts;
        assert.throws(() => usageLedger(input));
    }
    const positive = fixture(); positive.events[0].adjusts = 'other';
    assert.throws(() => usageLedger(positive), /[Aa]djust/);
    const unknown = fixture(); unknown.events[0].tenant = 'other';
    assert.throws(() => usageLedger(unknown), /[Uu]nsupported/);
});

test('close-time inclusion, empty ledgers, integer range and nonmutation remain explicit', () => {
    const input = fixture(); input.events[0].postedAt = input.closedAt;
    const before = structuredClone(input), result = usageLedger(input);
    assert.equal(result.amountCents, 2500);
    assert.equal(result.nextInvoiceAdjustmentCents, -250);
    assert.deepEqual(input, before);
    assert.equal(usageLedger({ ...input, events: [] }).amountCents, 0);
    const overflow = fixture(); overflow.priceCents = 1e9;
    overflow.events = Array.from({ length: 100 }, (_, i) => ({ ...input.events[0], id: 'large-' + i, units: 1e6 }));
    assert.throws(() => usageLedger(overflow), /range/);
});
