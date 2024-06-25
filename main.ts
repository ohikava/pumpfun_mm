// MainApp.ts
import { Wallet } from './components/Wallet';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
 

class MainApp {
    private wallets: Wallet[];

    constructor() {
        this.wallets = [];
        console.log(chalk.blue('application has started...'));
    }

    // Method to read private keys from a file and create wallets
    public createWalletsFromFile(filePath: string): void {
        try {
            const data = fs.readFileSync(path.resolve(__dirname, filePath), 'utf-8');
            const keys = data.split('\n').filter(line => line.trim() !== '');
            
            keys.forEach(privateKey => {
                const wallet = new Wallet(privateKey.trim());
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
app.getAllBalance()
// app.getWallets()[0].buy('H8EZLMCZnY5ZmtHPLUCDFuHmQW1eg2hqYM8QzgWbpump', 0.015, 0.25, 0.0001);
app.getWallets()[0].sell('H8EZLMCZnY5ZmtHPLUCDFuHmQW1eg2hqYM8QzgWbpump', 10**3, 0.25, 0.0001);