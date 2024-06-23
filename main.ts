// MainApp.ts
import { Wallet } from './components/Wallet';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
 

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

    // Method to show private keys of all wallets (for demonstration purposes)
    public showWalletPrivateKeys(): void {
        this.wallets.forEach((wallet, index) => {
            console.log(chalk.green(`#${index + 1}. ${wallet.getPrivateKey()}`));
        });
    }
}

// Example usage
const app = new MainApp();
app.createWalletsFromFile('wallets.txt');
app.showWalletPrivateKeys();
