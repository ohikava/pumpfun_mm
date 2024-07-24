import { readFile } from "fs/promises";

export function bufferFromUInt64(value: number | string) {
    let buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return buffer;
}

export function getRandomDecimalInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

export function round(num: number, decimals: number): number {
    var decimals = 10 ** decimals;
    return Math.round((num + Number.EPSILON) * decimals) / decimals;
}

export async function readJson(filepath: string) {
    const data = await readFile(filepath, "utf-8");
    return JSON.parse(data);
}
