const BIGINT_ID_PATTERN = /^\d+$/;

export function parseBigIntParam(value: string): bigint | null {
    if (!BIGINT_ID_PATTERN.test(value)) {
        return null;
    }

    return BigInt(value);
}