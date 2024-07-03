// MainApp.ts
import { Wallet } from './components/Wallet';
import {getRandomDecimalInRange, round} from "./components/utils";
import * as fs from 'fs';
import * as path from 'path';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {Token} from "./components/Token";
import * as logger from "./components/logger";
import config from "./config.json" with {"type": "json"};
import * as readline from 'readline';
import {Dispatcher} from "./components/dispatcher";
import { SingleBar } from "cli-progress";


logger.setLevel("INFO");

class MainApp {
    private wallets: Wallet[];
    public mint: Token;
    private connection: Connection
    private dispatcher: Dispatcher;


    constructor() {
        this.wallets = [];
        this.connection = new Connection(config.RPC)
        logger.debug('application has started...');

        this.mint = new Token(config.CA, this.connection);
        this.dispatcher = new Dispatcher(config.apiKey, config.apiSecret, config.passwordOKX);


    }

    // Method to read private keys from a file and create wallets
    public createWalletsFromFile(filePath: string): void {
        try {
            const data = fs.readFileSync(path.resolve(filePath), 'utf-8');
            const keys = data.split('\n').filter(line => line.trim() !== '');
            
            keys.forEach(privateKey => {
                const wallet = new Wallet(privateKey.trim(), this.mint, this.connection);
                this.wallets.push(wallet);
            });
        } catch (error: any) {
            logger.error(`error reading file: ${error.message}`);
        }
    }

    // Method to get all wallets
    public getWallets(): Wallet[] {
        return this.wallets;
    }

    public async getAllBalance() {
        for (const wallet of app.getWallets()) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger.info(`public key: ${wallet.getPublicKey()}`);
            try {
                let balance: any = await wallet.getSolBalance();
                balance = Number.parseFloat(balance) / LAMPORTS_PER_SOL;
                logger.info(`balance: ${balance} SOL`);
                
            } catch (err: any) {
                logger.info(`error: ${err.message}`)
            }
        }
    }

    public async buyFromList(walletsList: Wallet[]): Promise<Number[]> {
        let successCount = 0;
        let totalSum = 0;
        const successBuyList: Number[] = [];

        for (let i = 0; i < walletsList.length; i++) {
            
            const currentWallet = walletsList[i];
            var randomSum = getRandomDecimalInRange(config.minBuyAmountSol, config.maxBuyAmountSol);
            randomSum = round(randomSum, 3);
            const isSuccess = await currentWallet.buy(randomSum, config.slippage);
            
            if (isSuccess) {
                successCount += 1;
                totalSum += randomSum;
                successBuyList.push(i);
            }

            const randomWaitTime = getRandomDecimalInRange(config.minSleepTime, config.maxSleepTime) * 1000;
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
            const balance = await currentWallet.getTokenAmount();
            const isSuccess = await currentWallet.sell(balance-2, config.slippage);
            
            if (isSuccess) {
                successCount += 1;
                totalSum += balance;
                successSellList.push(i);;
            }
        }
        const tokenPrice = await this.mint.calculateTokenPrice();
        logger.info(`SELL success rate: ${successCount / walletsList.length}, total sum: ${round(totalSum * tokenPrice, this.mint.decimals)}`);
        return successSellList;
    }

    public async sellFromAll() {
        await this.sellFromList(this.wallets);
    }

    public async dispatchFromOKX() {
        let bar = new SingleBar({
            format: `Вывод | ${"{bar}"} | {value}/{total} с.`,
            barCompleteChar: "\u2588",
            barIncompleteChar: "\u2591",
            hideCursor: true,
          });
          
        bar.start(this.wallets.length, 0);

        for (let i = 0; i < this.wallets.length; i++) {
            const currentWallet = this.wallets[i];
            const params = {
                "fee": config.solFee,
            }
            try {
                this.dispatcher.withdraw(config.dispatchAmountSol, currentWallet.getPublicKey(), params)
            } catch (error: any) {
                logger.error(error.message);
            }

            bar.update(1);
            
        }
        bar.stop();
    }


}

const app = new MainApp()
app.createWalletsFromFile('wallets.txt');

setTimeout(() => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question('please select an option: [1] buy all or [2] sell all or [3] dispatch from OKX\n', (answer) => {

    switch (parseInt(answer)) {
        case 1:
            app.buyFromAll();
            break;
        case 2:
            app.sellFromAll();
            break;
        case 3:
            app.dispatchFromOKX();
            break;
        default:
            console.log("invalid selection. Please try again.");
            return rl.close();
    }
    rl.close();
});
  }, 3 * 1000);