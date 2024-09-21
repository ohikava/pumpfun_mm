import * as fs from "fs";
import { BlockTag, PublicClient } from "viem";
import { ETHPRICE } from "./constants";

export function bufferFromUInt64(value: number | string) {
    let buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return buffer;
}

export function getRandomDecimalInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

export function getRandomIntInRange(min: number, max: number) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export function round(num: number, decimals: number): number {
    var decimals = 10 ** decimals;
    return Math.round((num + Number.EPSILON) * decimals) / decimals;
}

export function readJson(filepath: string) {
    const data = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(data);
}


export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function formatError(err: any): string {
    if (typeof err === "string") {
        return err.toUpperCase();
    } else if (err instanceof Error) {
        return err.message;
    }
    return ""
}

const blockCache: { [key: string]: number } = {}; // Cache for block timestamps
export async function getUTCDateTimeByBlockHash(blockHash: string, client: PublicClient) {
    if (blockCache[blockHash]) {
        return new Date(blockCache[blockHash] * 1000).toUTCString(); // Convert cached timestamp to UTC
    }
    const block = await client.getBlock({ blockHash: blockHash as `0x${string}` });
    const timestamp = Number(block.timestamp)
    blockCache[blockHash] = timestamp; // Cache the timestamp
    return new Date(timestamp * 1000).toUTCString(); // Convert to UTC
}


export function sortWalletsByTokenBalance(wallets: any [], asc: boolean = false) {
    if (asc) {
        return wallets.toSorted((a, b) => a.tokenBalance < b.tokenBalance ? -1 : a.tokenBalance > b.tokenBalance ? 1 : 0)
    }
    return wallets.toSorted((a, b) => a.tokenBalance < b.tokenBalance ? 1 : a.tokenBalance > b.tokenBalance ? -1 : 0)
}

export function sortWalletsByBalance(wallets: any [], asc: boolean = false) {
    if (asc) {
        return wallets.toSorted((a, b) => a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0)
    }
    return wallets.toSorted((a, b) => a.balance < b.balance ? 1 : a.balance > b.balance ? -1 : 0)
}

export function convertUSDC2ETH(usdc_amount: number) {
    return round(usdc_amount / ETHPRICE, 3)
}