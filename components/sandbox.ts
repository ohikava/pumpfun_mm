import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { round } from "./utils";
import { TokenMeta } from "./interfaces";
import {BUY, SELL} from "./constants";
import * as fs from 'fs';
import * as logger from "./logger";



const SOL_AMOUNT = 100;
const TOKEN_AMOUNT = 1_000_000_000;
const DECIMALS = 6;

export class Sandbox {
    private solPool: number;
    private tokenPool: number;
    private balances: {[key: string]: number};
    private solBalances: {[key: string]: number};
    private decimals: number;
    public isRunning: boolean;
    private totalSupply: number;

    public constructor() {
        this.solPool = SOL_AMOUNT * LAMPORTS_PER_SOL;
        this.tokenPool = TOKEN_AMOUNT;
        this.balances = {};
        this.solBalances = {};
        this.decimals = DECIMALS;
        this.isRunning = true;
        this.totalSupply = TOKEN_AMOUNT;
    }


    public setSolBalance(address: string, amount: number) {
        this.solBalances[address] = amount;
    }

    public getSolBalance(address: string) {
        if (!(address in this.solBalances)) {
            this.solBalances[address] = 0;
        }
        return this.solBalances[address];
    }

    public getTokenMeta(): TokenMeta{
        return {
            "virtual_sol_reserves": this.solPool,
            "virtual_token_reserves": this.tokenPool,
            "total_supply": this.totalSupply * DECIMALS
        }
    }
    public getBalance(address: string) {
        if (!(address in this.balances)) {
            return 0;
        }
        return this.balances[address];
    }
    private addToTXFile(msg: string) {
        fs.appendFile("sandbox.jsonl", msg + "\n", (err) => {
            if (err) {
                console.error('ошибка при записи в файл:', err);
            } else {
            }
        });
    }
    public buy(address: string, amount: number, rank: string): boolean {
        try {
            const price = this.tokenPool / this.solPool;
            const amountInLamports = LAMPORTS_PER_SOL * amount;
            const tokenAmount = round(price * amountInLamports, this.decimals);
            this.tokenPool -= tokenAmount;
            this.solPool += amountInLamports;

            if (address in this.balances) {
                this.balances[address] += tokenAmount;
            } else {
                this.balances[address] = tokenAmount;
            }
            const initialBalance = this.getSolBalance(address);
            this.setSolBalance(address, initialBalance - amountInLamports)

            const tsMsg = {
                "type": BUY,
                "wallet": address,
                "amount": amountInLamports,
                "tokenAmount": tokenAmount,
                "tokenPool": this.tokenPool,
                "solPool": this.solPool,
                "solBalance": this.solBalances[address],
                "tokenBalance": this.balances[address],
                "rank": rank 
            }
            this.addToTXFile(JSON.stringify(tsMsg));
            logger.info(`${address.slice(0, 5)} BUY ${amount} SOL RANK ${rank}`);
            return true;
        } catch {
            return false;
        }
    }

    public sell(address: string, tokenAmount: number, rank: string): boolean {
        try {
            const price = this.tokenPool / this.solPool;

            const solAmount = round(tokenAmount / price, 0);
            this.tokenPool += tokenAmount;
            this.solPool -= solAmount;

            const initialBalance = this.getSolBalance(address);
            this.setSolBalance(address, initialBalance + solAmount)

            this.balances[address] -= tokenAmount;

            const tsMsg = {
                "type": SELL,
                "wallet": address,
                "amount": solAmount,
                "tokenAmount": tokenAmount,
                "tokenPool": this.tokenPool,
                "solPool": this.solPool,
                "solBalance": this.solBalances[address],
                "tokenBalance": this.balances[address],
                "rank": rank
            }
            this.addToTXFile(JSON.stringify(tsMsg));
            logger.info(`${address.slice(0, 5)} SELL ${solAmount/10**9} SOL RANK ${rank}`);

            return true;
        } catch {
            return false;
        }
    }

    public getHolders() {
        return this.balances;
    }

    public getDecimals() {
        return this.decimals;
    }

    public setIsRunning(newIsRunning: boolean) {
        this.isRunning = newIsRunning;
    }
}
// console.log("hello world")