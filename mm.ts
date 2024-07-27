// MainApp.ts
import { Wallet } from './components/Wallet';
import {getRandomDecimalInRange, round, getRandomIntInRange, shuffle, readJson} from "./components/utils";
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {Token} from "./components/Token";
import {BASE_FEE, NUM_SIGNATURES, MICROLAMPORTS_PER_LAMPORT, UNITS_BUDGET_BUY, UNITS_BUDGET_SELL, BUY, SELL, RANKS} from "./components/constants";
import * as logger from "./components/logger";
import bs58 from 'bs58'
import { Config, StatisticItem, DispatchConf } from './components/interfaces';
import { Sandbox } from './components/sandbox';

export class MM {
    private wallets: Wallet[];
    public mint: Token;
    private connection: Connection;
    public config: Config;
    public sb: Sandbox;


    constructor(config: Config) {
        this.config = config;
        this.wallets = [];
        this.connection = new Connection(config.RPC)

        this.sb = new Sandbox();
        this.sb.setIsRunning(this.config.simulation)

        this.mint = new Token(config.CA, this.connection, this.sb);
    }

    public reloadConfig(newConfig: Config) {
        logger.info("reloading...")
        this.config = newConfig;
        this.connection = new Connection(newConfig.RPC);
        this.sb.setIsRunning(this.config.simulation);
        this.mint = new Token(newConfig.CA, this.connection, this.sb);
    };
    // Method to read private keys from a file and create wallets
    public async createWalletsFromFile(filePath: string, dispatchConfPath: string): Promise<void> {
        try {
            const data = fs.readFileSync(path.resolve(filePath), 'utf-8');
            const keys = data.split('\n').filter(line => line.trim() !== '');
            
            const dispatchConf: {[key: string]: DispatchConf} = await readJson(dispatchConfPath);

            let privateKey: string;
            for (let i = 0; i < keys.length; i++) {
                privateKey = keys[i];
                const wallet = new Wallet(privateKey.trim(), this.mint, this.connection, this.config);

                const rank: RANKS = dispatchConf[wallet.getPublicKey()]['rank'];
                wallet.rank = rank;

                this.wallets.push(wallet);

                const dispatchSolBalance: number = dispatchConf[wallet.getPublicKey()]['solBalance'];
                this.sb.setSolBalance(wallet.getPublicKey(), dispatchSolBalance * LAMPORTS_PER_SOL)

                logger.info(`${i+1}/${keys.length}`);

                await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));

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
            await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));
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

    public async buyFromAll() {
        for (let i = 0; i < this.wallets.length; i++) {
            this.wallets[i].nextTxType = BUY;
        }
        await this.sendTxFromList(this.wallets, true, true);
    }

    public async saveStatistic(statisticPath: string = "statistic.json") {
        const res: {[key: string]: StatisticItem} = {};
        let curr: Wallet, pk: string;
        for (let i = 0; i < this.wallets.length; i++) {
            curr = this.wallets[i];
            pk = curr.getPublicKey();
            res[pk] = {
                "solBalance": curr.balance / LAMPORTS_PER_SOL,
                "tokenBalance": curr.tokenBalance
            }
        }
        fs.writeFile(statisticPath, JSON.stringify(res), (err) => {
            if (err) {
                console.error('ошибка при записи в файл:', err);
            } else {
                console.log(`статистика о кошелька записана в файл statistic.json`);
            }
        });
        
    }

    public async sendTxFromList(walletsList: Wallet[], updateBalance=true, randomSleepTime=true) {
        let successBuyCount = 0;
        let successSellCount = 0;
        let buyAmount = 0;
        let sellAmount = 0;

        let totalSolSum = 0;
        let totalTokenSum = 0;

        const successTxList: Wallet[] = [];
        let currentWallet;
        let balance;
        let tokenBalance;
        let isSuccess;

        for (let i = 0; i < walletsList.length; i++) {
            currentWallet = walletsList[i];
            
            if (currentWallet.nextTxType == BUY) {
                buyAmount += 1;
                // check sol balance
                balance = walletsList[i].balance / LAMPORTS_PER_SOL - this.config['leaveOnFeeSol'];
                balance = round(balance, 3);

                if ((balance) <= 0) {
                    logger.error(`${currentWallet.getPublicKey().slice(0, 5)}} insufficient sol balance for buy: ${round(walletsList[i].balance / LAMPORTS_PER_SOL, 3)}`)
                    continue
                }

                isSuccess = await currentWallet.buy(balance, this.config.slippage);
                
                if (isSuccess) {
                    successBuyCount += 1;
                    totalSolSum += balance;
                    successTxList.push(currentWallet);                    
                }

            } else if (currentWallet.nextTxType == SELL) {
                sellAmount += 1;

                // check balance of the wallet
                if (currentWallet.tokenBalance > 0) {
                    tokenBalance= currentWallet.tokenBalance;
                } else {
                    tokenBalance = await currentWallet.getTokenAmount();
                }

                if (isNaN(tokenBalance)) {
                    tokenBalance = 0;
                }
                if (tokenBalance <= 10) {
                    logger.error(`${currentWallet.getPublicKey().slice(0, 5)} insufficient token balance: ${tokenBalance}`)
                    continue
                }

                isSuccess = await currentWallet.sell(tokenBalance-2, this.config.slippage);

                if (isSuccess) {
                    successSellCount += 1;
                    totalTokenSum += tokenBalance;
                    successTxList.push(currentWallet);
                }


            } else {
                logger.error(`${currentWallet.getPublicKey().slice(0, 5)} for some reason there is no operation type for this wallet`)
                continue 
            }

            currentWallet.nextTxType = "";

            if (!(i == walletsList.length - 1)) {
                if (randomSleepTime) {
                    const randomWaitTime = getRandomDecimalInRange(this.config.minSleepTime, this.config.maxSleepTime) * 1000;
                    await new Promise(resolve => setTimeout(resolve, randomWaitTime));
                } else {
                    await new Promise(resolve => setTimeout(resolve, this.config.rpcSendTxSleep));
                }
            }
        }

        if ((updateBalance) && (successTxList.length > 0)) {
            await new Promise(resolve => setTimeout(resolve, 3000));

            for (let i = 0; i < successTxList.length; i +=1) {

                currentWallet = successTxList[i];
                await currentWallet.getSolBalance()
                await currentWallet.getTokenBalance()
                await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));
            }
        }

        const tokenPrice = await this.mint.calculateTokenPrice();
        logger.info(`success buy: ${successBuyCount}/${buyAmount}, sol spend ${totalSolSum}`)
        logger.info(`success sell: ${successSellCount}/${sellAmount}, sol got ${round(totalTokenSum * tokenPrice / 10**3, this.mint.decimals)}`)
    }

    public async sellFromAll(updateBalance: boolean, randomSleepTime: boolean) {
        for (let i = 0; i < this.wallets.length; i++) {
            this.wallets[i].nextTxType = SELL;
        }
        await this.sendTxFromList(this.wallets, updateBalance, randomSleepTime);
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

    public async sellAmountInPercents(amountInPercents: number, randomTx: boolean) {
        let totalSupply = 0;
        for(let i = 0; i < this.wallets.length; i++) {
            totalSupply += this.wallets[i].tokenBalance;
        }
        const sellAmountTotal = amountInPercents * totalSupply / 100
        
        let sellAmountReal = 0;
        const walletsList: Wallet[] = [];
        let ix = this.wallets.length - 1;
        let wallet: Wallet;
    

        while ((sellAmountReal < sellAmountTotal) && (ix >= 0)) {
            wallet = this.wallets[ix];

            if (wallet.tokenBalance <= 10) {
                ix -= 1;
                continue
            }
            sellAmountReal += wallet.tokenBalance;
            wallet.nextTxType = SELL;
            walletsList.push(wallet);
            ix -= 1;
        }
        let randomTxAmountInPercents;
        if (randomTx) {
            randomTxAmountInPercents = getRandomIntInRange(this.config.minRandomTxAmountInPercents, this.config.maxRandomTxAmountInPercents);
            let randomTxAmount = Math.max(round(randomTxAmountInPercents * walletsList.length, 0), 1)

            ix = 0;
            while ((randomTxAmount > 0) && (ix < this.wallets.length)) {
                wallet = this.wallets[ix];
                if ((wallet.tokenBalance <= 10) && (wallet.balance > 0)) {
                    wallet.nextTxType = BUY;
                    walletsList.push(wallet);
                    randomTxAmount -= 1;
                }
                ix +=1 
            }

            shuffle(walletsList)
        }

        // for (let i = 0; i < walletsList.length; i++) {
        //     console.log(walletsList[i].nextTxType)
        // }
        
        this.sendTxFromList(walletsList, true, true)
    }

    public async buyAmountSol(amountSol: number, randomTx: boolean) {
        let currentSolSum = 0;
        let ix = 0;

        const walletsList: Wallet[] = [];
        let wallet;

        while ((currentSolSum < amountSol) && (ix < this.wallets.length)) {
            wallet = this.wallets[ix];

            if (wallet.tokenBalance >= 20) {
                ix += 1;
                continue 
            }

            currentSolSum += round(wallet.balance / LAMPORTS_PER_SOL - this.config['leaveOnFeeSol'], 3)
            wallet.nextTxType = BUY;

            walletsList.push(wallet);
            ix += 1;
        }

        if (randomTx) {
            const randomTxAmountInPercents = getRandomIntInRange(this.config.minRandomTxAmountInPercents, this.config.maxRandomTxAmountInPercents);
            let randomTxAmount = Math.max(round(randomTxAmountInPercents * walletsList.length, 0), 1)

            ix = this.wallets.length - 1;
            while ((randomTxAmount > 0) && (ix >= 0)) {
                wallet = this.wallets[ix];

                if (wallet.tokenBalance >= 20) {
                    wallet.nextTxType = SELL;
                    walletsList.push(wallet);
                    randomTxAmount -= 1;
                }
                ix -=1;
            }

            shuffle(walletsList)
        }

        // for (let i = 0; i < walletsList.length; i++) {
        //     console.log(walletsList[i].nextTxType)
        // }

        this.sendTxFromList(walletsList, true, true);
    }

    public async start() {
        logger.info("start...")
        await this.mint.getTokenMeta();
        await this.createWalletsFromFile('wallets.txt', "dispatch_config.json");
        // await this.printInterface()
    }

    public async withdrawall(address: string) {
        let currentWallet;
        let success_rate = 0
        let successWithdrawList: string[] = [];
        let isSuccess;

        const addressKey = new PublicKey(address);
        for (let ix = 0; ix < this.wallets.length; ix++) {
            currentWallet = this.wallets[ix];
            
            isSuccess = await currentWallet.withdrawSOL(addressKey);

            if (!isSuccess) {
                successWithdrawList.push(currentWallet.getPublicKey())
            } else {
                success_rate += 1;
            }
            await new Promise(resolve => setTimeout(resolve, this.config.rpcSendTxSleep));
            
        }

        logger.info(`success rate: ${success_rate}/${this.wallets.length}`)
        logger.error(`errors: ${JSON.stringify(successWithdrawList)}`);
    }

    public async savePKOnlyFromConf(dispatchConfPath: string = "dispatch_config.json", privatePath: string = "wallets.txt", newPrivatePath: string = "wallets_merged.txt") {
        const dispatchConf = await readJson(dispatchConfPath);
        const data = fs.readFileSync(path.resolve(privatePath), 'utf-8');
        const keys = data.split('\n').filter(line => line.trim() !== '');
        let currWallet: Wallet;
        const res: string[] = [];
        

        for (let i = 0; i < this.wallets.length; i++) {
            currWallet = this.wallets[i];

            if (currWallet.getPublicKey() in dispatchConf) {
                res.push(keys[i])
            }
        }

        let data_row = res.join('\n');
        fs.writeFile(newPrivatePath, data_row, (err) => {
            if (err) {
                console.error('ошибка при записи в файл:', err);
            } else {
                console.log(`${res.length} приватный ключей были успешно записанны в ${newPrivatePath}`);
            }
        });


    }

}

