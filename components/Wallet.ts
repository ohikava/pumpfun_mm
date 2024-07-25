import bs58 from 'bs58'
import {Keypair, 
        VersionedTransaction, 
        TransactionInstruction, 
        Transaction, 
        SystemProgram,
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
        UNITS_BUDGET_BUY,
        UNITS_BUDGET_SELL
    } from "./constants";

import {bufferFromUInt64} from "./utils"

import { Token } from './Token';
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as logger from "./logger";
import {Config} from "./interfaces";

export class Wallet {
    private keypair: Keypair;
    private connection:  Connection;
    private token: Token;
    private tokenAccountAddress: PublicKey | undefined;
    public balance: number;
    private config: Config;
    public tokenBalance: number;


    constructor(privateKey: string, token: Token, connection: Connection, config: Config) {
        this.keypair = this.load_key_pair(privateKey);
        this.connection = connection;
        this.token = token; 
        this.tokenAccountAddress = undefined;
        this.tokenBalance = 0;

        this.config = config;
        this.balance = 0;
        this.getSolBalance()
        this.getTokenBalance()
    }

    public async getBuyTx(solIn: number, slippageDecimal: number): Promise<any[]>{
        const coinData = await this.token.getTokenMeta()

        if (!coinData) {
            logger.error("Failed to retrieve coin data...");
            return [];
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
        
        if (isNaN(tokenOut)) {
                logger.debug(`token out is nan, key: ${this.getPublicKey()}`)
        }
        if (isNaN(maxSolCost)) {
                logger.debug(`max sol cost is nan, key: ${this.getPublicKey()}`)
        }

        const data = Buffer.concat([bufferFromUInt64('16927863322537952870'), bufferFromUInt64(tokenOut), bufferFromUInt64(maxSolCost)]);

                

        const swapInstruction = new TransactionInstruction({
            "keys": keys,
            "programId": PUMP_FUN_PROGRAM,
            "data": data,
        });
        const budgetUsageInstructions = [
                ComputeBudgetProgram.setComputeUnitPrice({"microLamports": this.config['unitPrice']}),
                ComputeBudgetProgram.setComputeUnitLimit({"units": Math.max(this.config['unitBudget'], UNITS_BUDGET_BUY)})
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
        return[transaction, tokenOut]
    }

    public async buy(solIn: number, slippageDecimal: number) {
        try {
            const [tx, newTokenBalance] = await this.getBuyTx(solIn, slippageDecimal);
            if (tx) {
                const txId = await this.connection.sendTransaction(tx);

                logger.info(`${this.keypair.publicKey.toString().slice(0, 5)} BUY ${solIn} SOL. tx: ${txId}`);
                return true;
            }

            } catch (e: unknown) {
                if (typeof e === "string") {
                    logger.error(`${this.getPublicKey()} ${solIn} sol`)
                    logger.error(e.toUpperCase())// works, `e` narrowed to string
                } else if (e instanceof Error) {
                    logger.error(`${this.getPublicKey()} ${solIn} sol`)
                    logger.error(e.message)// works, `e` narrowed to Error
                }
                return false;
            }
    }
    public async getSellTx(tokenOut: number, slippageDecimal: number): Promise<any[]> {
        const coinData = await this.token.getTokenMeta()

        if (!coinData) {
            logger.error("Failed to retrieve coin data...");
            return [];
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
        
        if (isNaN(tokenOut)) {
            logger.debug(`token out is nan, key: ${this.getPublicKey()}`)
        }
        if (isNaN(minSolOutput)) {
            logger.debug(`min sol output is nan, key: ${this.getPublicKey()}`)
        }

        const data = Buffer.concat([bufferFromUInt64('12502976635542562355'), bufferFromUInt64(tokenOut), bufferFromUInt64(minSolOutput)]);

          

        const swapInstruction = new TransactionInstruction({
            "keys": keys,
            "programId": PUMP_FUN_PROGRAM,
            "data": data,
        });

        const budgetUsageInstructions = [
            ComputeBudgetProgram.setComputeUnitPrice({"microLamports": this.config['unitPrice']}),
            ComputeBudgetProgram.setComputeUnitLimit({"units": Math.max(this.config['unitBudget'], UNITS_BUDGET_SELL)})
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
        return [transaction, minSolOutput];
    }
    public async sell(tokenOut: number, slippageDecimal: number) {
        try {
            const [tx, minSolOutput] = await this.getSellTx(tokenOut, slippageDecimal);
            if (tx) {
                const txId = await this.connection.sendTransaction(tx);
                logger.info(`${this.keypair.publicKey.toString().slice(0, 5)} SELL ${tokenOut} tokens. tx: ${txId}`);
                return true;
            }

            } catch (e: unknown) {
                if (typeof e === "string") {
                    logger.error(`${this.getPublicKey()} ${tokenOut} tokens`)
                    logger.error(e.toUpperCase())// works, `e` narrowed to string
                } else if (e instanceof Error) {
                    logger.error(`${this.getPublicKey()} ${tokenOut} tokens`)
                    logger.error(e.message)// works, `e` narrowed to Error
                }
                return false; 
            }
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
        this.balance = balance;
        return balance;
    }
    public async getTokenBalance(): Promise<number> {
        const balance = await this.getTokenAmount()
        if (isNaN(balance)) {
            this.tokenBalance = 0;
            return 0;
        }
        this.tokenBalance = balance;
        return balance;
    }

    public async withdrawSOL(to: PublicKey) {
        try {
            await this.getSolBalance();
            
            const instructions = [
                SystemProgram.transfer({
                fromPubkey: this.keypair.publicKey,
                toPubkey: to,
                lamports: 0.01 * LAMPORTS_PER_SOL,
                }),
            ];

            const messageV0 = new TransactionMessage({
                payerKey: this.keypair.publicKey,
                recentBlockhash: (await this.connection.getLatestBlockhash()).blockhash,
                instructions,
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);
    
            // sign your transaction with the required `Signers`
            transaction.sign([this.keypair]);

            const txId = await this.connection.sendTransaction(transaction);
            logger.info(`tx: ${txId}`);
            return true 

        } catch (e: unknown) {
            if (typeof e === "string") {
                logger.error(`${this.getPublicKey()} ${(this.balance - 0.000015 * LAMPORTS_PER_SOL - 125000) / LAMPORTS_PER_SOL} SOL`)
                logger.error(e.toUpperCase())// works, `e` narrowed to string
            } else if (e instanceof Error) {
                logger.error(`${this.getPublicKey()} ${(this.balance - 0.000015 * LAMPORTS_PER_SOL - 125000) / LAMPORTS_PER_SOL} SOL`)
                logger.error(e.message)// works, `e` narrowed to Error
            }
            return false; 
        }

    }
}
