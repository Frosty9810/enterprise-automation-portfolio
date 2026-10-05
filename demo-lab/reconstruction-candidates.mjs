// Checked-in candidates only. User-supplied code is never executed.
export function baseline({ onHand, target, packSize }) { return Math.max(0, Math.round((target - onHand) / packSize) * packSize); }
export function reconstructed(x) { for (const key of ['onHand', 'reserved', 'target', 'packSize'])
    if (!Number.isSafeInteger(x[key]) || x[key] < 0 || x[key] > 1000000)
        throw Error('Invalid inventory integer'); if (x.packSize === 0 || x.reserved > x.onHand)
    throw Error('Invalid reservation or pack'); const shortage = Math.max(0, x.target - x.onHand + x.reserved); return Math.floor((shortage + x.packSize - 1) / x.packSize) * x.packSize; }
