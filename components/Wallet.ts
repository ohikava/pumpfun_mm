import bs58 from 'bs58'
import {Keypair, 
        VersionedTransaction, 
        TransactionInstruction, 
        Connection, 
        LAMPORTS_PER_SOL, 
        PublicKey, 
        ComputeBudgetProgram,
        TransactionMessage} from "@solana/web3.js";
import {GLOBAL, 
        FEE_RECIPIENT, 
        SYSTEM_PROGRAM, 
        TOKEN_PROGRAM, 
        RENT, 
        EVENT_AUTHORITY, 
        PUMP_FUN_PROGRAM, 
        UNIT_BUDGET,
        UNIT_PRICE
    } from "./constants";

import {bufferFromUInt64} from "./utils"

import { Token } from './Token';
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as logger from "./logger";

export class Wallet {
    private keypair: Keypair;
    private connection:  Connection;
    private token: Token 
    private tokenAccountAddress: PublicKey | undefined;

    constructor(privateKey: string, token: Token, connection: Connection) {
        this.keypair = this.load_key_pair(privateKey);
        this.connection = connection;
        this.token = token; 
        this.tokenAccountAddress = undefined;
    }

    public async buy(solIn: number, slippageDecimal: number) {
        try {
            const coinData = await this.token.getTokenMeta()

            if (!coinData) {
                logger.error("Failed to retrieve coin data...");
                return;
            }

            let tokenAccountInstructions: TransactionInstruction[] = [];

            const [isTokenAccountExist, tokenAccount] = await this.token.checkIfTokenAccountExist(this.keypair)

            if (!isTokenAccountExist) {
                const ata = this.token.getCreateTokenAccountInstruction(this.keypair, tokenAccount);
                tokenAccountInstructions.push(...ata.instructions);
            }
            this.tokenAccountAddress = tokenAccount;

            const tokenOut = this.token.calculateTokenOut(solIn, coinData);
            const solInWithSlippage = solIn * (1 + slippageDecimal);
            const maxSolCost = Math.floor(solInWithSlippage * LAMPORTS_PER_SOL);

            const MINT = this.token.mint;
            const BONDING_CURVE = new PublicKey(coinData.bonding_curve);
            const ASSOCIATED_BONDING_CURVE = new PublicKey(coinData.associated_bonding_curve);
            const ASSOCIATED_USER = tokenAccount;
            const USER = this.keypair.publicKey;
            
            const keys = [
                { pubkey: GLOBAL, isSigner: false, isWritable: false },
                { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
                { pubkey: MINT, isSigner: false, isWritable: false },
                { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
                { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
                { pubkey: ASSOCIATED_USER, isSigner: false, isWritable: true },
                { pubkey: USER, isSigner: true, isWritable: true },
                { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: RENT, isSigner: false, isWritable: false },
                { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
                { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false }
              ];
            
            const data = Buffer.concat([bufferFromUInt64('16927863322537952870'), bufferFromUInt64(tokenOut), bufferFromUInt64(maxSolCost)]);



            const swapInstruction = new TransactionInstruction({
                "keys": keys,
                "programId": PUMP_FUN_PROGRAM,
                "data": data,
            });

            const budgetUsageInstructions = [
                ComputeBudgetProgram.setComputeUnitPrice({"microLamports": UNIT_PRICE}),
                ComputeBudgetProgram.setComputeUnitLimit({"units": UNIT_BUDGET})
            ]
            const instructions = [
                ...budgetUsageInstructions,
                ...tokenAccountInstructions,
                 swapInstruction,
            ];
            
            const compiledMessage = new TransactionMessage({
                "instructions": instructions,
                "payerKey": this.keypair.publicKey,
                "recentBlockhash": (await this.connection.getLatestBlockhash()).blockhash
            }).compileToV0Message();

            const transaction = new VersionedTransaction(compiledMessage);
            transaction.sign([this.keypair]);
            const txId = await this.connection.sendTransaction(transaction);

            logger.info(`${this.keypair.publicKey.toString().slice(0, 5)} BUY ${solIn} SOL. tx: ${txId}`);
            return true;

            } catch (e: unknown) {
                if (typeof e === "string") {
                   logger.error(e.toUpperCase())// works, `e` narrowed to string
                } else if (e instanceof Error) {
                    logger.error(e.message)// works, `e` narrowed to Error
                }
                return false;
            }
    }

    public async sell(tokenOut: number, slippageDecimal: number) {
        try {
            const coinData = await this.token.getTokenMeta()

            if (!coinData) {
                logger.error("Failed to retrieve coin data...");
                return;
            }

            let tokenAccountInstructions: TransactionInstruction[] = [];
            let tokenAccount: PublicKey;
            let isTokenAccountExist: Boolean;
            if (!this.tokenAccountAddress) {
                [isTokenAccountExist, tokenAccount] = await this.token.checkIfTokenAccountExist(this.keypair);
            } else {
                tokenAccount = this.tokenAccountAddress;
            }
            
            tokenOut *= 10**this.token.decimals;
            tokenOut = Math.floor(tokenOut);

            const minSolOutput = Math.floor(tokenOut * (1 - slippageDecimal) * coinData['virtual_sol_reserves'] / coinData['virtual_token_reserves'])

            const MINT = this.token.mint;
            const BONDING_CURVE = new PublicKey(coinData.bonding_curve);
            const ASSOCIATED_BONDING_CURVE = new PublicKey(coinData.associated_bonding_curve);
            const ASSOCIATED_USER = tokenAccount;
            const USER = this.keypair.publicKey;
            
            const keys = [
                { pubkey: GLOBAL, isSigner: false, isWritable: false },
                { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
                { pubkey: MINT, isSigner: false, isWritable: false },
                { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
                { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
                { pubkey: ASSOCIATED_USER, isSigner: false, isWritable: true },
                { pubkey: USER, isSigner: true, isWritable: true },
                { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
                { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false }
              ];
            
            const data = Buffer.concat([bufferFromUInt64('12502976635542562355'), bufferFromUInt64(tokenOut), bufferFromUInt64(minSolOutput)]);



            const swapInstruction = new TransactionInstruction({
                "keys": keys,
                "programId": PUMP_FUN_PROGRAM,
                "data": data,
            });

            const budgetUsageInstructions = [
                ComputeBudgetProgram.setComputeUnitPrice({"microLamports": UNIT_PRICE}),
                ComputeBudgetProgram.setComputeUnitLimit({"units": UNIT_BUDGET})
            ]
            const instructions = [
                ...budgetUsageInstructions,
                ...tokenAccountInstructions,
                 swapInstruction,
            ];
            
            const compiledMessage = new TransactionMessage({
                "instructions": instructions,
                "payerKey": this.keypair.publicKey,
                "recentBlockhash": (await this.connection.getLatestBlockhash()).blockhash
            }).compileToV0Message();

            const transaction = new VersionedTransaction(compiledMessage);
            transaction.sign([this.keypair]);
            const txId = await this.connection.sendTransaction(transaction);

            logger.info(`${this.keypair.publicKey.toString().slice(0, 5)} SELL ${tokenOut} tokens. tx: ${txId}`);
            return true;

            } catch (e: unknown) {
                if (typeof e === "string") {
                   logger.error(e.toUpperCase())// works, `e` narrowed to string
                } else if (e instanceof Error) {
                    logger.error(e.message)// works, `e` narrowed to Error
                }
                return false; 
            }
    }

    public generateKeyPair(): Keypair {
        return Keypair.generate();
    }

    public async getTokenAccountInfo() {
        var _: Boolean;
        if (!this.tokenAccountAddress) {
            [_, this.tokenAccountAddress] = await this.token.checkIfTokenAccountExist(this.keypair);
        }
        const accountInfo = await this.connection.getParsedAccountInfo(this.tokenAccountAddress);
        return accountInfo;
    }

    public async getTokenAmount() {
        const tokenAccountInfo = await this.getTokenAccountInfo();
        return tokenAccountInfo.value?.data.parsed.info.tokenAmount.amount / 10 ** this.token.decimals;
    }

    private load_key_pair(privateKey: string): Keypair {
        return Keypair.fromSecretKey(bs58.decode(privateKey));
    }

    public getPublicKey(): string {
        return this.keypair.publicKey.toString();
    }

    public async getSolBalance(): Promise<number> {
        const balance = await this.connection.getBalance(this.keypair.publicKey);
        return balance;
    }
}
