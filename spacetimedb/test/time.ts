export const micros = (minutes: number) => BigInt(Math.round(minutes * 60_000_000));
