// MainApp.ts
import { Wallet } from './components/Wallet';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {Token} from "./components/Token";
import { SOLANA_RPC } from './components/constants';


class MainApp {
    private wallets: Wallet[];
    private mint: Token;
    private connection: Connection


    constructor() {
        this.wallets = [];
        this.connection = new Connection(SOLANA_RPC)
        console.log(chalk.blue('application has started...'));

        const mint_contract = "H8EZLMCZnY5ZmtHPLUCDFuHmQW1eg2hqYM8QzgWbpump";
        this.mint = new Token(mint_contract, this.connection);


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
            console.error(chalk.red(`error reading file: ${error.message}`));
        }
    }

    // Method to get all wallets
    public getWallets(): Wallet[] {
        return this.wallets;
    }

    public async getAllBalance() {
        for (const wallet of app.getWallets()) {
            console.log(chalk.green(`public key: ${wallet.getPublicKey()}`));
            try {
                let balance: any = await wallet.getBalance();
                balance = Number.parseFloat(balance) / LAMPORTS_PER_SOL;
                console.log(chalk.green(`balance: ${balance} SOL`))
                
            } catch (err: any) {
                console.log(chalk.red(`error: ${err.message}`))
            }
        }
    }

}

// Example usage
const app = new MainApp();
app.createWalletsFromFile('wallets.txt');
// app.getAllBalance();
// app.getWallets()[0].buy(0.05, 0.1);
app.getWallets()[0].sell(1700000, 0.1);