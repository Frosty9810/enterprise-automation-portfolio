// Newly repository-authored demonstration. No client module or third-party binary.
export function packOrder({ onHand, reserved, target, packSize }) {
    for (const n of [onHand, reserved, target, packSize])
        if (!Number.isSafeInteger(n) || n < 0 || n > 1000000)
            throw Error('Invalid inventory integer');
    if (!packSize || reserved > onHand)
        throw Error('Invalid reservation or pack');
    return Math.ceil(Math.max(0, target - (onHand - reserved)) / packSize) * packSize;
}
