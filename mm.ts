// MainApp.ts
import { Wallet } from './components/Wallet';
import {getRandomDecimalInRange, round} from "./components/utils";
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {Token} from "./components/Token";
import {BASE_FEE, NUM_SIGNATURES, MICROLAMPORTS_PER_LAMPORT, UNITS_BUDGET_BUY, UNITS_BUDGET_SELL} from "./components/constants";
import * as logger from "./components/logger";
// import config from "./config.json" with {"type": "json"};
import bs58 from 'bs58'
import { Config } from './components/interfaces';

export class MM {
    private wallets: Wallet[];
    public mint: Token;
    private connection: Connection;
    private holders: Set<string>;
    private traders: Set<string>;
    public config: Config;


    constructor(config: Config) {
        this.wallets = [];
        this.holders = new Set<string>();
        this.traders = new Set<string>();
        this.connection = new Connection(config.RPC)
        logger.debug('application has started...');

        this.mint = new Token(config.CA, this.connection);
        this.config = config;
    }

    public reloadConfig(newConfig: Config) {
        logger.info("reloading...")
        this.connection = new Connection(newConfig.RPC);
        this.mint = new Token(newConfig.CA, this.connection);
        this.config = newConfig;
    };
    // Method to read private keys from a file and create wallets
    public async createWalletsFromFile(filePath: string): Promise<void> {
        try {
            const data = fs.readFileSync(path.resolve(filePath), 'utf-8');
            const keys = data.split('\n').filter(line => line.trim() !== '');
            
            let privateKey: string;
            for (let i = 0; i < keys.length; i++) {
                privateKey = keys[i];
                const wallet = new Wallet(privateKey.trim(), this.mint, this.connection, this.config);
                this.wallets.push(wallet);
                logger.info(`${i+1}/${keys.length}`);

                await new Promise(resolve => setTimeout(resolve, 200));

            }

            // keys.forEach(async privateKey => {
            //     const wallet = new Wallet(privateKey.trim(), this.mint, this.connection, config);
            //     this.wallets.push(wallet);
            //     await new Promise(resolve => setTimeout(resolve, 5000));

            // });
        } catch (error: any) {
            logger.error(`error reading file: ${error.message}`);
        }
    }
    public calculateTransactionFee() {
         const buyFee= (BASE_FEE * NUM_SIGNATURES + Math.max(UNITS_BUDGET_BUY, this.config['unitBudget']) * this.config['unitPrice']) / MICROLAMPORTS_PER_LAMPORT / LAMPORTS_PER_SOL;
         const sellFee= (BASE_FEE * NUM_SIGNATURES + Math.max(UNITS_BUDGET_SELL, this.config['unitBudget']) * this.config['unitPrice']) / MICROLAMPORTS_PER_LAMPORT / LAMPORTS_PER_SOL;
        
         logger.info(`buy fee: ${buyFee} SOL`)
         logger.info(`sell fee: ${sellFee} SOL`)

    };

    // Method to get all wallets
    public getWallets(): Wallet[] {
        return this.wallets;
    }

    public async getAllBalance() {
        let cumBalance = 0;
        let cumTokenBalance = 0;

        for (const wallet of this.getWallets()) {
            await new Promise(resolve => setTimeout(resolve, 200));
            logger.info(`public key: ${wallet.getPublicKey()}`);
            try {
                await wallet.getSolBalance()
                await wallet.getTokenBalance()

                let balance = wallet.balance / LAMPORTS_PER_SOL;
                logger.info(`balance: ${balance} SOL`);
                logger.info(`token balance: ${wallet.tokenBalance} tokens`)
                cumBalance += balance;
                cumTokenBalance += wallet.tokenBalance;
                
            } catch (err: any) {
                logger.info(`error: ${err.message}`)
            }
        }
        logger.info(`cum sol balance: ${round(cumBalance, 4)}, cum token balance: ${round(cumTokenBalance, 0)}, percentage of supply: ${round(cumTokenBalance / this.mint.getTotalSupply() * 100, 3)}%`);
    }

    public async buyFromList(walletsList: Wallet[]): Promise<Number[]> {
        let successCount = 0;
        let totalSum = 0;
        const successBuyList: Number[] = [];

        for (let i = 0; i < walletsList.length; i++) {
            
            const currentWallet = walletsList[i];
            // var randomSum = getRandomDecimalInRange(config.minBuyAmountSol, config.maxBuyAmountSol);
            var randomSum = walletsList[i].balance / LAMPORTS_PER_SOL - this.config['leaveOnFeeSol'];
            randomSum = round(randomSum, 3);
            const isSuccess = await currentWallet.buy(randomSum, this.config.slippage);
            
            if (isSuccess) {
                successCount += 1;
                totalSum += randomSum;
                successBuyList.push(i);
                let publicName = currentWallet.getPublicKey()
                this.holders.add(publicName)
                
                if (publicName in this.traders) {
                    this.traders.delete(publicName);
                }
            }

            const randomWaitTime = getRandomDecimalInRange(this.config.minSleepTime, this.config.maxSleepTime) * 1000;
            if (!(i == walletsList.length - 1)) {
                await new Promise(resolve => setTimeout(resolve, randomWaitTime));
            }
        }

        logger.info(`BUY success rate: ${successCount / walletsList.length}, total sum: ${totalSum}`);
        return successBuyList;
    }

    public async buyFromAll() {
        await this.buyFromList(this.wallets);
    }

    public async sellFromList(walletsList: Wallet[]): Promise<Number[]> {
        let successCount = 0;
        let totalSum = 0;
        let successSellList: Number[] = [];

        for (let i = 0; i < walletsList.length; i++) {
            const currentWallet = walletsList[i];
            let balance: number;
            if (currentWallet.tokenBalance > 0) {
                balance = currentWallet.tokenBalance;
            } else {
                balance = await currentWallet.getTokenAmount();
            }
            if (balance <= 10) {
                continue
            }
            const isSuccess = await currentWallet.sell(balance-2, this.config.slippage);
            
            if (isSuccess) {
                successCount += 1;
                totalSum += balance;
                successSellList.push(i);
                let publicName = currentWallet.getPublicKey()
                this.traders.add(publicName);

                if (publicName in this.holders) {
                    this.holders.delete(publicName);
                }
            }
            if (!(i == walletsList.length - 1)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        const tokenPrice = await this.mint.calculateTokenPrice();
        logger.info(`SELL success rate: ${successCount / walletsList.length}, total sum: ${round(totalSum * tokenPrice / 10**3, this.mint.decimals)}`);
        return successSellList;
    }

    public async sellFromAll() {
        await this.sellFromList(this.wallets);
    }

    public generateWallets(n: number, privatePath: string = "private.txt", publicPath: string = "public.txt"): void {
        const secretKeys = [];
        const publicKeys = []
        for (let i = 0; i < n; i++) {
            const key = Keypair.generate()

            const private_key = bs58.encode(key.secretKey);
            const public_key = key.publicKey.toString()

            secretKeys.push(private_key);
            publicKeys.push(public_key);
        }
        let data_row = secretKeys.join('\n');
        fs.writeFile(privatePath, data_row, (err) => {
            if (err) {
                console.error('ошибка при записи в файл:', err);
            } else {
                console.log(`${n} приватный ключей были успешно записанны в ${privatePath}`);
            }
        });
        data_row = publicKeys.join('\n');
        fs.writeFile(publicPath, data_row, (err) => {
            if (err) {
                console.error('ошибка при записи в файл:', err);
            } else {
                console.log(`${n} публичных ключей были успешно записанны в ${publicPath}`);
            }
        });


    }

    public splitWalletsIntoCategories() {
        const holders_n = Math.round(this.config['holderWalletsAmountInPercents'] / 100 * this.wallets.length)
        
        const holders: string[] = [];
        const traders: string[] = [];

        for (let i = 0; i < holders_n; i++) {
            let publicName = this.wallets[i].getPublicKey()
            holders.push(publicName);
        }

        for(let i = holders_n; i < this.wallets.length; i++) {
            let publicName = this.wallets[i].getPublicKey()
            traders.push(publicName);
        }



        const split = {
            "holders": holders,
            "trader": traders
        }
        const data_row = JSON.stringify(split);

        fs.writeFile("wallets_split", data_row, (err) => {
            if (err) {
                console.error('ошибка при записи в файл:', err);
            } 
        });
    };

    async sellAmountInPercents(amountInPercents: number) {
        let totalSupply = 0;
        for(let i = 0; i < this.wallets.length; i++) {
            totalSupply += this.wallets[i].tokenBalance;
        }
        console.log(totalSupply)
        const sellAmountTotal = amountInPercents * totalSupply / 100
        console.log(sellAmountTotal)
        
        let sellAmountReal = 0;
        const sellingWallets: Wallet[] = [];
        let ix = this.wallets.length - 1;
        while ((sellAmountReal < sellAmountTotal) && (ix >= 0)) {
            const wallet = this.wallets[ix];

            if (wallet.tokenBalance <= 10) {
                ix -= 1;
                continue
            }
            sellAmountReal += wallet.tokenBalance;
            sellingWallets.push(wallet);
            ix -= 1;
        }

        this.sellFromList(sellingWallets);
    }

    async buyAmountSol(amountSol: number) {
        let currentSolSum = 0;
        let ix = 0;

        const buyingWallets: Wallet[] = [];

        while ((currentSolSum < amountSol) && (ix < this.wallets.length)) {
            const wallet = this.wallets[ix];

            if (wallet.tokenBalance >= 100) {
                ix += 1;
                continue 
            }

            currentSolSum += round(wallet.balance / LAMPORTS_PER_SOL - this.config['leaveOnFeeSol'], 3)
            buyingWallets.push(wallet);
            ix += 1;
        }

        this.buyFromList(buyingWallets);
    }

    public async start() {
        logger.info("start...")
        await this.mint.getTokenMeta();
        await this.createWalletsFromFile('wallets.txt');
        // await this.printInterface()
    }

}


