import bs58 from 'bs58'
import { Address } from 'viem';

import { formatUnits } from 'viem';
import {bufferFromUInt64, formatError, round} from "./utils"
import { Token } from './Token';
import * as logger from "./logger";
import {Config} from "./interfaces";
import { createWalletClient, http } from 'viem';
import { getBalance } from 'viem/actions';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export class Wallet {
    private keypair: any;
    private provider: any;
    private token: Token;
    public balance: number;
    private config: Config;
    public tokenBalance: number;


    constructor(privateKey: string, token: Token, provider: any, config: Config) {
        this.keypair = this.load_key_pair(privateKey);
        this.provider = provider;
        this.token = token; 
        this.tokenBalance = 0;

        this.config = config;
        this.balance = 0;
        
    }

    public async init() {
        await this.getBalance()
        await this.getTokenBalance()
    }

    private load_key_pair(privateKey: string): any {
        const wallet = createWalletClient({
            chain: mainnet,
            transport: http(),
            account: privateKeyToAccount(privateKey as `0x${string}`),
        })
        return wallet
    }

    public getPublicKey(): string{
        return this.keypair.account.address;
    }

    public async getBalance(): Promise<number> {
        if (this.token.sb.isRunning) {
            const balance = this.token.sb.getAddressHoldings(await this.getPublicKey());
            this.balance = balance.ethBalance;
            return balance.ethBalance;
        }
        const balance = await this.provider.getBalance({
            address: this.getPublicKey(),
        });
        const balanceFloat = Number(formatUnits(balance, this.token.wethDecimals));
        this.balance = balanceFloat;
        return balanceFloat;
    }
    public async getTokenBalance(): Promise<number> {
        if (this.token.sb.isRunning) {
            const tokenBalance = this.token.sb.getAddressHoldings(this.getPublicKey());
            this.tokenBalance = tokenBalance.tokenBalance;
            return tokenBalance.tokenBalance;
        }
        const tokenBalance = await this.token.getTokenBalance(this.getPublicKey());
        const tokenBalanceFloat = parseFloat(formatUnits(tokenBalance, this.token.tokenDecimals));
        this.tokenBalance = tokenBalanceFloat;
        return tokenBalanceFloat;
    }

    public async withdraw(to: any) {
    }

    public async transferTokens(to: any, amount: number) {
        try {
            const tx = await this.token.transfer(to, amount.toString(), this.keypair);
            return [true, tx];
        } catch (error) {
            logger.error(`Error transferring tokens: ${error}`);
            return [false, null];
        }
    }

    public async buy(amount: string, slippage: number, gasPrice: bigint): Promise<[boolean, any]> {
        try {
            console.log(`balance: ${this.balance}`);
            const tx = await this.token.buy(amount, slippage, this.keypair, gasPrice);
            return [true, tx];
        } catch (error) {
            logger.error(`Error buying: ${error}`);
            return [false, null];
        }
    }

    public async sell(amount: string, slippage: number, gasPrice: bigint): Promise<[boolean, any]> {
        try {
            const tx = await this.token.sell(amount, slippage, this.keypair, gasPrice);
            return [true, tx];
        } catch (error) {
            logger.error(`Error selling: ${error}`);
            return [false, null];
        }
    }
}
