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
        sendAndConfirmTransaction,
        TransactionMessage} from "@solana/web3.js";
import {GLOBAL, 
        FEE_RECIPIENT, 
        SYSTEM_PROGRAM, 
        TOKEN_PROGRAM, 
        RENT, 
        EVENT_AUTHORITY, 
        PUMP_FUN_PROGRAM, 
        UNITS_BUDGET_BUY,
        BASE_FEE,
        UNITS_BUDGET_SELL,
        RANKS,
        SENDING_ERRORS
    } from "./constants";

import {
        createMint,
        getOrCreateAssociatedTokenAccount,
        mintTo,
        createTransferInstruction,
    } from "@solana/spl-token";


import {bufferFromUInt64, formatError, round} from "./utils"

import { Token } from './Token';
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as logger from "./logger";
import {Config, CreateTxOutput} from "./interfaces";

export class Wallet {
    private keypair: Keypair;
    private connection:  Connection;
    private token: Token;
    private tokenAccountAddress: PublicKey | undefined;
    public balance: number;
    private config: Config;
    public tokenBalance: number;
    public nextTxType: string;
    public rank: RANKS;


    constructor(privateKey: string, token: Token, connection: Connection, config: Config) {
        this.keypair = this.load_key_pair(privateKey);
        this.connection = connection;
        this.token = token; 
        this.tokenAccountAddress = undefined;
        this.tokenBalance = 0;

        this.config = config;
        this.balance = 0;
        this.nextTxType = "";
        this.rank = RANKS.LOW;
        
    }

    public async init() {
        await this.getSolBalance()
        await this.getTokenBalance()
    }

    public async getBuyTx(solIn: number, slippageDecimal: number): Promise<CreateTxOutput>{
        const coinData = await this.token.getTokenMeta()

        if (!coinData) {
            logger.error("Failed to retrieve coin data...");
            return {
                "isSuccess": false,
                "outputAmount": 0,
                "tx": undefined
            }
        }

        let tokenAccountInstructions: TransactionInstruction[] = [];

        const [isTokenAccountExist, tokenAccount] = await this.token.checkIfTokenAccountExist(this.keypair.publicKey)

        if (!isTokenAccountExist) {
            const ata = this.token.getCreateTokenAccountInstruction(this.keypair, tokenAccount);
            tokenAccountInstructions.push(...ata.instructions);
        }
        this.tokenAccountAddress = tokenAccount;

        const tokenOut = Math.floor(coinData['virtual_token_reserves'] / coinData['virtual_sol_reserves'] * solIn * LAMPORTS_PER_SOL);
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
        return {
            "isSuccess": true,
            "outputAmount": tokenOut,
            "tx": transaction
        }
    }

    public async buy(solIn: number, slippageDecimal: number) {
        let txInfo, txId, errMsg;
        let tries = 0;
        let shouldContinueSending = true;

        if (this.token.sb.isRunning) {
            return this.token.sb.buy(this.getPublicKey(), solIn, this.rank);
        }
        
        while (shouldContinueSending) {
            try {
                txInfo = await this.getBuyTx(solIn, slippageDecimal);

                if (txInfo['isSuccess']) {
                    
                    txId = await this.connection.sendTransaction(txInfo['tx']);
                    logger.info(`${this.keypair.publicKey.toString().slice(0, 5)} BUY ${round(solIn, 3)} SOL. tx: ${txId}`);

                    return true;
                }
                return false;
            } catch (e: any) {
                errMsg = formatError(e);

                shouldContinueSending = false;

                for (let i = 0; i < SENDING_ERRORS.length; i++) {
                    if (errMsg.includes(SENDING_ERRORS[i]) && (tries < this.config.errorMaxTries)) {
                        shouldContinueSending = true;
                    }
                }

                if (shouldContinueSending) {
                    tries += 1;
                } else {
                    logger.error(`${this.getPublicKey()} BUY ${solIn}`)
                    logger.error(errMsg)
                    return false;
                }


            }
        }
    }
    public async getSellTx(tokenOut: number, slippageDecimal: number): Promise<CreateTxOutput> {
        const coinData = await this.token.getTokenMeta()

        if (!coinData) {
            logger.error("Failed to retrieve coin data...");
            return {
                "isSuccess": false,
                "outputAmount": 0,
                "tx": undefined
            }
        }

        let tokenAccountInstructions: TransactionInstruction[] = [];
        let tokenAccount: PublicKey;
        let isTokenAccountExist: Boolean;
        if (!this.tokenAccountAddress) {
            [isTokenAccountExist, tokenAccount] = await this.token.checkIfTokenAccountExist(this.keypair.publicKey);
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
        return {
            "isSuccess": true,
            "outputAmount": minSolOutput,
            "tx": transaction
        }
    }

    public async sell(tokenOut: number, slippageDecimal: number) {
        let txInfo, txId, errMsg;
        let tries = 0;
        let shouldContinueSending = true;

        if (this.token.sb.isRunning) {
            return this.token.sb.sell(this.getPublicKey(), tokenOut, this.rank);
        }
        
        while (shouldContinueSending) {
            try {
                txInfo = await this.getSellTx(tokenOut, this.config.slippage)
                if (txInfo['isSuccess']) {
                    txId = await this.connection.sendTransaction(txInfo['tx']);
                    logger.info(`${this.keypair.publicKey.toString().slice(0, 5)} SELL ${round(tokenOut, 0)}. tx: ${txId}`);

                    return true;
                }
                return false;
            } catch (e: any) {
                errMsg = formatError(e);

                shouldContinueSending = false;

                for (let i = 0; i < SENDING_ERRORS.length; i++) {
                    if (errMsg.includes(SENDING_ERRORS[i]) && (tries < this.config.errorMaxTries)) {
                        shouldContinueSending = true;
                    }
                }

                if (shouldContinueSending) {
                    tries += 1;
                } else {
                    logger.error(`${this.getPublicKey()} SELL ${tokenOut}`)
                    logger.error(errMsg)
                    return false;
                }


            }
        }
    }

    public async getTokenAccountInfo() {
        var _: Boolean;
        if (!this.tokenAccountAddress) {
            [_, this.tokenAccountAddress] = await this.token.checkIfTokenAccountExist(this.keypair.publicKey);
        }
        const accountInfo = await this.connection.getParsedAccountInfo(this.tokenAccountAddress);
        return accountInfo;
    }

    public async getTokenAmount() {
        if (this.token.sb.isRunning) {
            return this.token.sb.getBalance(this.getPublicKey())
        }
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
        if (this.token.sb.isRunning) {
            this.balance = this.token.sb.getSolBalance(this.getPublicKey());
            return this.balance;
        }
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
            const balance = this.balance;

            
            const instructions = [
                SystemProgram.transfer({
                fromPubkey: this.keypair.publicKey,
                toPubkey: to,
                lamports: balance - BASE_FEE,
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

    public async transferTokens(to: PublicKey, amount: number): Promise<boolean> {
        try {
            let senderTokenAccount: PublicKey;
            let receiverTokenAccount: PublicKey;
            let isTokenAccountExist: Boolean;
            let ata;
            if (!this.tokenAccountAddress) {
                [isTokenAccountExist, senderTokenAccount] = await this.token.checkIfTokenAccountExist(this.keypair.publicKey);
            } else {
                senderTokenAccount = this.tokenAccountAddress;
            }

            [isTokenAccountExist, receiverTokenAccount] = await this.token.checkIfTokenAccountExist(to);

            const tokenAccountInstructions: TransactionInstruction[] = [];
            if (!isTokenAccountExist) {
                ata = this.token.getCreateTokenAccountInstruction(this.keypair, receiverTokenAccount);
                tokenAccountInstructions.push(...ata.instructions);
            }
            const budgetUsageInstructions = [
                ComputeBudgetProgram.setComputeUnitPrice({"microLamports": this.config['unitPrice']}),
                ComputeBudgetProgram.setComputeUnitLimit({"units": Math.max(this.config['unitBudget'], UNITS_BUDGET_BUY)})
            ]

            const transactions = [
                ...budgetUsageInstructions,
                ...tokenAccountInstructions,
                createTransferInstruction(
                    senderTokenAccount,
                    receiverTokenAccount,
                    this.keypair.publicKey,
                    this.tokenBalance*10**this.token.decimals,
                ),
            ]
            const transaction = new Transaction().add(...transactions);
             
            await this.connection.sendTransaction(transaction, [this.keypair]);

            return true;
            
        } catch (e: unknown) {
            if (typeof e === "string") {
                logger.error(`${this.getPublicKey()} transfer ${amount} tokens to ${to.toString()}`)
                logger.error(e.toUpperCase())// works, `e` narrowed to string
            } else if (e instanceof Error) {
                logger.error(`${this.getPublicKey()} transfer ${amount} tokens to ${to.toString()}`)
                logger.error(e.message)// works, `e` narrowed to Error
            }
            return false; 
        }
    } 
}
