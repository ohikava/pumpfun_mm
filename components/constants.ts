import { PublicKey } from "@solana/web3.js";
export const GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
export const FEE_RECIPIENT = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
export const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOC_TOKEN_ACC_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
export const EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
export const PUMP_FUN_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const SOL = "So11111111111111111111111111111111111111112";
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const PUMP_FUN_ADDRESS = "https://api.pumpdata.fun";
export const BASE_FEE = 5000
export const NUM_SIGNATURES = 1;
export const UNITS_BUDGET_SELL = 32062;
export const UNITS_BUDGET_BUY = 36254;
export const MICROLAMPORTS_PER_LAMPORT = 1_000_000
export const CONFIG_PATH = "config.json";
export const BUY = "BUY";
export const SELL = "SELL";
export enum RANKS {
    LOW = "LOW",
    MID = "MID",
    HIGH = "HIGH"
};
export const RANKS_IN_ORDER = [RANKS.LOW, RANKS.MID, RANKS.HIGH];
export const SENDING_ERRORS = [
    "Blockhash not found",
    "Node is behind by"
]