import { readFile } from "fs/promises";

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

export async function readJson(filepath: string) {
    const data = await readFile(filepath, "utf-8");
    return JSON.parse(data);
}

export function shuffle(array: any) {
    let currentIndex = array.length;
  
    // While there remain elements to shuffle...
    while (currentIndex != 0) {
  
      // Pick a remaining element...
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
  
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
  }

export function formatError(err: any): string {
    if (typeof err === "string") {
        return err.toUpperCase();
    } else if (err instanceof Error) {
        return err.message;
    }
    return ""
}