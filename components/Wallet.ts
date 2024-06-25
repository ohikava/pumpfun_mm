import bs58 from 'bs58'
import chalk from 'chalk';

const {Keypair, VersionedTransaction, Transaction, sendAndConfirmTransaction, Connection, clusterApiUrl, SystemProgram, LAMPORTS_PER_SOL, PublicKey} = require("@solana/web3.js")

const SOLANA_RPC = "https://api.mainnet-beta.solana.com/";
const PUMP_FUN_ADDRESS = "https://api.pumpdata.fun";

export class Wallet {
    private keypair: typeof Keypair;
    private connection: typeof Connection;


    constructor(privateKey: string) {
        this.keypair = this.load_key_pair(privateKey);
        this.connection = new Connection(SOLANA_RPC)
    }

    public async buy(token_address:string, amount:number, slippage=0.25, priorityFee=0.0001) {
        const response = await fetch(`${PUMP_FUN_ADDRESS}/buy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "mint": token_address,                // the token address from pump.fun
                "buyerPublicKey": this.getPublicKey(),    // Your wallet public key
                "amountInSol": amount,                               // amount of SOL, (0.1 SOL)
                "slippagePercent": slippage * 100,                            // percent slippage allowed (25%)
                "priorityFee": priorityFee,                            // priority fee (0.0001 SOl)
            })
        });
        if(response.status === 200) {
            const data = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(data));
            // console.log(tx);
            // console.log(Object.keys(tx));
            // console.log(tx.message.recentBlockhash);
            // console.log(tx.message.recentBlockhash);
            let blockhash = await this.connection.getRecentBlockhash('finalized');
            blockhash = blockhash.blockhash;
            tx.message.recentBlockhash = blockhash
            tx.sign([this.keypair]);
            try {
                const signature = await this.connection.sendTransaction(tx)
                console.log(chalk.green("Transaction: https://solscan.io/tx/" + signature));
            } catch (error:any) {
                console.log(chalk.red(error.message));

            }
        
        } else {
            console.log(response.statusText);
        }
    }

    // Empty method for selling assets
    public async sell(token_address:string, amount:number, slippage=0.25, priorityFee=0.0001) {
        const response = await fetch(`${PUMP_FUN_ADDRESS}/sell`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "mint": token_address,                // the token address from pump.fun
                "sellerPublicKey": this.getPublicKey(),    // Your wallet public key
                "tokens": amount,                               // amount of tokens, (35733.3 Doge tokens)
                "slippagePercent": slippage * 100,                            // percent slippage allowed (25%)
                "priorityFee": priorityFee,                            // priority fee (0.0001 SOl)
            })
        });
        if(response.status === 200) {
            const data = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(data));
            let blockhash = await this.connection.getRecentBlockhash('finalized');
            blockhash = blockhash.blockhash;
            tx.message.recentBlockhash = blockhash
            tx.sign([this.keypair]);
            try {
                const signature = await this.connection.sendTransaction(tx)
                console.log(chalk.green("Transaction: https://solscan.io/tx/" + signature));
            } catch (error:any) {
                console.log(chalk.red(error.message));

            }
        
        } else {
            console.log(response.statusText);
            console.log(response)
        }
    }

    public generateKeyPair(): typeof Keypair {
        return Keypair.generate();
    }

    private load_key_pair(privateKey: string): typeof Keypair {
        return Keypair.fromSecretKey(bs58.decode(privateKey));
    }

    public getPublicKey(): string {
        return this.keypair.publicKey.toString();
    }

    public transaction(to: string, amount: number): typeof Transaction {
        return new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: this.keypair.publicKey,
                toPubkey: new PublicKey(to),
                lamports: amount * LAMPORTS_PER_SOL,
            })
        );
    }

    public signAndSendTransaction(transaction: typeof Transaction): void {
        sendAndConfirmTransaction(this.connection, transaction, [this.keypair]);
    }

    public async getBalance(): Promise<string> {
        const balance = await this.connection.getBalance(this.keypair.publicKey);
        return balance;
    }
}