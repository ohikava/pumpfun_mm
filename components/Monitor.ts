import { PublicClient, createPublicClient, formatEther, http } from 'viem';
import { arbitrum } from 'viem/chains';
import {Wallet} from "./Wallet";
import {eventABI, fromBlock, toBlock, MIN_LATEST_TX_AMOUNT} from "./constants";
import fs from 'fs'; 
import { getUTCDateTimeByBlockHash } from './utils';
import { Config, Swap } from './interfaces';
import { decodeAbiParameters } from 'viem'
import * as logger from "./logger";


export class Monitor {
    private client: PublicClient;
    private transactions: any[] = [];
    private poolAddress: string;
    private config: Config;
    constructor(publicClient: PublicClient, poolAddress: string, config: Config) {
        this.client = publicClient;
        this.poolAddress = poolAddress;
        this.config = config;

    }

    async init() {
        await this.loadHistoryTransactions();
        logger.debug(`successfully loaded history transactions: ${this.transactions.length}`);
        this.watchLogs();
    }



    public async loadHistoryTransactions() {
        console.log("Loading historical transactions...");
        const logs = await this.client.getLogs({
            address: this.poolAddress as `0x${string}`,
            fromBlock: BigInt(fromBlock),
            toBlock,
            events: [eventABI],
          });
        

        let ix = logs.length - 1;
        const txsFilteredByTime = [];
        while (ix >= 0) {
            const log = logs[ix];
            const blockHash = log.blockHash;
            const date = await getUTCDateTimeByBlockHash(blockHash, this.client);
            const txTimestamp = new Date(date).getTime();

            if (!this.checkIsInWindow(txTimestamp)) {
                if (txsFilteredByTime.length < MIN_LATEST_TX_AMOUNT) {
                    txsFilteredByTime.push({...log, timestamp: txTimestamp});
                } else {
                    break;
                }
            } else {
                txsFilteredByTime.push({...log, timestamp: txTimestamp});
            }
            ix--;
        }

        const processedLogs = this.preprocessLogs(txsFilteredByTime);
        this.transactions = processedLogs;

        const tokenVolume = this.calcTokenVolume();

        console.log(tokenVolume);

    }

    public async watchLogs() {
        const unwatch = this.client.watchEvent({
            address: this.poolAddress as `0x${string}`,
            events: [eventABI],
            onLogs: this.processNewTX
          });

    }

    private preprocessLogs(logs: any[]) {
        const processedLogs: Swap[] = [];

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            const amount0In = Number(formatEther(log.args.amount0In?.toString()));
            const amount1In = Number(formatEther(log.args.amount1In?.toString()));
            const amount0Out = Number(formatEther(log.args.amount0Out?.toString()));
            const amount1Out = Number(formatEther(log.args.amount1Out?.toString()));
            const isBuy = amount0In > amount0Out;
            const swap: Swap = {
                amountIn: amount0In + amount1In,
                amountOut: amount0Out + amount1Out,
                isBuy: isBuy,
                to: log.args.to,
                timestamp: Number(log.timestamp)
            }
            processedLogs.push(swap);
        }

        fs.writeFileSync('logs.json', JSON.stringify(processedLogs, null, 2));
        return processedLogs;
    }

    private async processNewTX(tx: any) {
        const blockHash = tx.blockHash;
        const date = await getUTCDateTimeByBlockHash(blockHash, this.client);
        const txTimestamp = new Date(date).getTime();
        const processedLogs = this.preprocessLogs([{
            ...tx,
            timestamp: txTimestamp
        }]);
        this.transactions.push(processedLogs[0]);
        this.moveWindow();
    }

    public calcTokenVolume() {
        let tokenVolume = 0;
        for (let i = 0; i < this.transactions.length; i++) {
            if (this.transactions[i].isBuy) {
                tokenVolume += this.transactions[i].amountOut;
            } else {
                tokenVolume -= this.transactions[i].amountIn;
            }
        }
        return tokenVolume;
    }

    public checkIsInWindow(timestamp: number) {
        const currentTimestamp = Date.now();
        const windowSizeInMs = this.config.windowSizeMin * 60 * 1000;
        return currentTimestamp - timestamp < windowSizeInMs;
    }
    

    public moveWindow() {
        if (this.transactions.length > MIN_LATEST_TX_AMOUNT) {
            const txToLeave = [];
            for (let i = 0; i < this.transactions.length - MIN_LATEST_TX_AMOUNT; i++) {
                const currentTx = this.transactions[i];
                if (this.checkIsInWindow(currentTx)) {
                    txToLeave.push(currentTx);
                }
            }
            
            
            for (let i = MIN_LATEST_TX_AMOUNT; i < this.transactions.length; i++) {
                txToLeave.push(this.transactions[i]);
            }

            this.transactions = txToLeave;
        }

        logger.debug(`transactions: ${this.transactions.length}`);
    }




}
