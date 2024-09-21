// MainApp.ts
import { Wallet } from './components/Wallet';
import {getRandomDecimalInRange, round, getRandomIntInRange, shuffle, convertUSDC2ETH, sortWalletsByTokenBalance, sortWalletsByBalance} from "./components/utils";
import * as fs from 'fs';
import * as path from 'path';
import { BUY, SELL } from './components/constants';
import {Token} from "./components/Token";
import * as logger from "./components/logger";
import bs58 from 'bs58'
import { Config, StatisticItem, TxOrder } from './components/interfaces';
import { UniswapAMMSimulator } from './components/sandbox';
import { log } from 'console';
import { createPublicClient, createWalletClient, formatGwei, formatUnits, http } from 'viem';
import { mainnet } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Monitor } from './components/Monitor';
import { isUndefined } from 'util';


export class MM {
    private wallets: Wallet[];
    public mint: Token;
    private provider: any;
    public config: Config;
    public sb: UniswapAMMSimulator;
    public totalBalance: number;
    public totalTokenBalance: number;
    public monitor: Monitor | undefined;


    constructor(config: Config) {
        this.config = config;
        this.wallets = [];
        this.provider = createPublicClient({
            chain: mainnet,
            transport: http(this.config.RPC),
          });

        this.sb = new UniswapAMMSimulator(1000000000000000000, 100, 18);
        this.sb.setIsRunning(this.config.simulation)

        this.mint = new Token(config.CA, this.provider, this.sb, this.config);

        this.totalBalance = 0;
        this.totalTokenBalance = 0;
    }

    public async init() {
        await this.mint.init();
        this.monitor = new Monitor(this.provider, this.mint.pairAddress, this.config);
        await this.monitor.init();
    }

    public reloadConfig(newConfig: Config) {
        logger.info("reloading...")
        this.config = newConfig;
        this.provider = createPublicClient({
            chain: mainnet,
            transport: http(this.config.RPC),
        })
        this.sb.setIsRunning(this.config.simulation);
        this.mint = new Token(newConfig.CA, this.provider, this.sb, this.config);
    };

    public async createWalletsFromFile(filePath: string) {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const keys = data.split('\n').filter(line => line.trim() !== '');

            let privateKey: string;
            for (let i = 0; i < keys.length; i++) {
                privateKey = keys[i];
                const wallet = new Wallet(privateKey.trim(), this.mint, this.provider, this.config);
                await wallet.init()

                this.totalBalance += wallet.balance;
                this.totalTokenBalance += wallet.tokenBalance;  


                this.wallets.push(wallet);

                logger.info(`${i+1}/${keys.length}`);

                await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));

            }

            logger.info(`cum ETH balance: ${round(this.totalBalance, 4)}, cum token balance: ${round(this.totalTokenBalance, 0)}`);

        } catch (error: any) {
            logger.error(`error reading file: ${error.message}`);
        }
    }

    
    // Method to get all wallets
    public getWallets(): Wallet[] {
        return this.wallets;
    }

    public async getAllBalance() {
        this.totalBalance = 0;
        this.totalTokenBalance = 0;

        for (const wallet of this.getWallets()) {
            await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));
            logger.info(`public key: ${await wallet.getPublicKey()}`);
            try {
                await wallet.getBalance()
                await wallet.getTokenBalance()

                let balance = wallet.balance;
                logger.info(`balance: ${balance} ETH`);
                logger.info(`token balance: ${wallet.tokenBalance} tokens`)
                this.totalBalance += balance;
                this.totalTokenBalance += wallet.tokenBalance;
                
            } catch (err: any) {
                logger.info(`error: ${err.message}`)
            }
        }
        logger.info(`cum ETH balance: ${round(this.totalBalance, 4)}, cum token balance: ${round(this.totalTokenBalance, 0)}`);
    }

    public async buyFromAll() {
        const txOrders: TxOrder[] = [];
        for (let i = 0; i < this.wallets.length; i++) {
            txOrders.push({
                wallet: this.wallets[i],
                amount: round(this.wallets[i].balance - this.config['leaveOnFee'], 3),
                txType: BUY
            });
        
        }
        await this.sendTxFromList(txOrders, true, true);
    }

    public async saveStatistic(statisticPath: string = "statistic.json") {
        const res: {[key: string]: StatisticItem} = {};
        let curr: Wallet, pk: string;
        for (let i = 0; i < this.wallets.length; i++) {
            curr = this.wallets[i];
            pk = curr.getPublicKey();
            res[pk] = {
                "solBalance": curr.balance,
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

    public async sendTxFromList(txOrders: TxOrder[], updateBalance=true, randomSleepTime=true) {
        let successBuyCount = 0;
        let successSellCount = 0;
        let buyAmount = 0;
        let sellAmount = 0;

        let totalEthSum = 0;
        let totalTokenSum = 0;

        let currentWallet;
        let balance;
        let tokenBalance;
        let isSuccess;
        let tx;
        let amount;
        let txType;

        for (let i = 0; i < txOrders.length; i++) {
            currentWallet = txOrders[i].wallet;
            amount = txOrders[i].amount;
            txType = txOrders[i].txType;

            const gasPrice = await this.mint.getGasPrice();
            const gasPriceGwei = Number.parseFloat(formatGwei(gasPrice));
            if (gasPriceGwei > this.config.gasPriceLimitGwei) {
                logger.info(`gas price is too high, skipping tx`)
                continue
            }

            if (txType == BUY) {
                balance = currentWallet.balance;

                buyAmount += 1;
            

                if (balance <= amount) {
                    continue
                }

                [isSuccess, tx] = await currentWallet.buy(amount.toString(), this.config.slippage, gasPrice);
                
                if (isSuccess) {
                    successBuyCount += 1;
                    totalEthSum += amount;
                    logger.info(`BUY ${currentWallet.getPublicKey().slice(0, 5)} ${amount} ETH, tx: ${tx}`)
                }

            } else if (txType == SELL) {
                sellAmount += 1;
                tokenBalance = currentWallet.tokenBalance;

                

                if (currentWallet.tokenBalance > 0) {
                    tokenBalance= currentWallet.tokenBalance;
                } else {
                    tokenBalance = await currentWallet.getTokenBalance();
                }

                if (isNaN(tokenBalance)) {
                    tokenBalance = 0;
                }
                if (tokenBalance <= amount) {
                    continue
                }

                [isSuccess, tx] = await currentWallet.sell((amount).toString(), this.config.slippage, gasPrice);

                if (isSuccess) {
                    successSellCount += 1;
                    totalTokenSum += amount;
                    logger.info(`SELL ${currentWallet.getPublicKey().slice(0, 5)} ${amount} tokens, tx: ${tx}`)
                }


            } else {
                logger.error(`${currentWallet.getPublicKey().slice(0, 5)} for some reason there is no operation type for this wallet`)
                continue 
            }

            if (!(i == txOrders.length - 1)) {
                if (randomSleepTime) {
                    const randomWaitTime = getRandomDecimalInRange(this.config.minSleepTime, this.config.maxSleepTime) * 1000;
                    await new Promise(resolve => setTimeout(resolve, randomWaitTime));
                } else {
                    await new Promise(resolve => setTimeout(resolve, this.config.rpcSendTxSleep));
                }
            }
        }
        
        const usedWallets: Set<string> = new Set();
        const uniqueWallets: Wallet[] = [];
        for (let i = 0; i < txOrders.length; i++) {
            const walletAddress = txOrders[i].wallet.getPublicKey();
            if (!usedWallets.has(walletAddress)) {
                usedWallets.add(walletAddress);
                uniqueWallets.push(txOrders[i].wallet);
            }
        }
    
        if ((updateBalance) && (uniqueWallets.length > 0)) {
            await new Promise(resolve => setTimeout(resolve, this.config['rpcReqSleep']));

            for (let i = 0; i < uniqueWallets.length; i +=1) {

                currentWallet = uniqueWallets[i];
                await currentWallet.getBalance()
                await currentWallet.getTokenBalance()
                await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));
            }
        }
        const tokenPrice = await this.mint.getTokenPrice();
        logger.info(`success buy: ${successBuyCount}/${buyAmount}, eth spend ${totalEthSum}}`);
        logger.info(`success sell: ${successSellCount}/${sellAmount}, eth got ${round(Number(tokenPrice) * totalTokenSum, 3)}`)
        
        if ((updateBalance) && (uniqueWallets.length > 0)) {
            this.totalBalance = 0;
            this.totalTokenBalance = 0;
            for (let i = 0; i < this.wallets.length; i++) {
                this.totalBalance += this.wallets[i].balance;
                this.totalTokenBalance += this.wallets[i].tokenBalance;
            }
            logger.info(`Balance:\n${this.totalBalance} ETH\n${this.totalTokenBalance} tokens`);
        }

    }

    public async sellFromAll(updateBalance: boolean, randomSleepTime: boolean) {
        const txOrders: TxOrder[] = [];
        for (let i = 0; i < this.wallets.length; i++) {
            txOrders.push({
                wallet: this.wallets[i],
                amount: this.wallets[i].tokenBalance,
                txType: SELL
            })
        }
        await this.sendTxFromList(txOrders, updateBalance, randomSleepTime);
    }

    public async getGasPrice() {
        const gasPriceWei = await this.mint.getGasPrice();
        const gasPriceGwei = formatUnits(gasPriceWei, 9);
        logger.info(`gas price: ${gasPriceGwei} gwei`);
        return gasPriceGwei;
    }
    public generateWallets(n: number, privatePath: string = "private.txt", publicPath: string = "public.txt"): void {
        const secretKeys = [];
        const publicKeys = []
        for (let i = 0; i < n; i++) {
            const private_key = generatePrivateKey()

            const wallet = privateKeyToAccount(private_key);
            const public_key = wallet.address;


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
        const txOrders: TxOrder[] = [];
        let ix = this.wallets.length - 1;
        let wallet: Wallet;
        let realRandomTxAmount = 0;
        let realRandomTxSum = 0;

        while ((sellAmountReal < sellAmountTotal) && (ix >= 0)) {
            wallet = this.wallets[ix];

            if (wallet.tokenBalance <= 10) {
                ix -= 1;
                continue
            }
            sellAmountReal += wallet.tokenBalance;
            txOrders.push({
                wallet: wallet,
                amount: wallet.tokenBalance,
                txType: SELL
            })
            ix -= 1;
        }
        let sellingWalletsLen = txOrders.length;
        let randomTxAmountInPercents;
        if (randomTx) {
            randomTxAmountInPercents = getRandomIntInRange(this.config.minRandomTxAmountInPercents, this.config.maxRandomTxAmountInPercents);
            let randomTxAmount = Math.max(round(randomTxAmountInPercents * txOrders.length / 100, 0), 1)

            ix = 0;

            const sortedWallets = sortWalletsByTokenBalance(this.wallets, true)

            while ((randomTxAmount > 0) && (ix < sortedWallets.length)) {
                wallet = sortedWallets[ix];
                if ((wallet.tokenBalance <= 100) && (wallet.balance > 0)) {
                    txOrders.push({
                        wallet: wallet,
                        amount: wallet.balance,
                        txType: BUY
                    })
                    randomTxAmount -= 1;
                    realRandomTxAmount += 1;
                    realRandomTxSum += wallet.balance;
                }
                ix +=1 

                if (randomTxAmount <= 0) {
                    break;
                }
            }

            shuffle(txOrders)
        }

        const tokenPrice = await this.mint.getTokenPrice();
        
        // const tokenPrice = tokenMeta['virtual_sol_reserves'] / tokenMeta['virtual_token_reserves'] / LAMPORTS_PER_SOL;
        logger.info(`selling wallets: ${sellingWalletsLen}, sum: ${round(sellAmountReal * Number(tokenPrice), 3)}`)
        logger.info(`random buying wallets: ${realRandomTxAmount}, sum: ${round(realRandomTxSum, 3)}`)
        this.sendTxFromList(txOrders, true, true)
    }

    public async buyAmountSol(amountSol: number, randomTx: boolean) {
        console.log(this.wallets)
        let currentEthSum = 0;
        let ix = 0;

        const txOrders: TxOrder[] = [];
        let wallet;
        let realRandomTxAmount = 0;
        let realRandomTxSum = 0;

        while ((currentEthSum < amountSol) && (ix < this.wallets.length)) {
            wallet = this.wallets[ix];

            if (wallet.tokenBalance >= 20) {
                ix += 1;
                continue 
            }

            currentEthSum += round(wallet.balance - this.config['leaveOnFee'], 3)
            txOrders.push({
                wallet: wallet,
                amount: round(wallet.balance - this.config['leaveOnFee'], 3),
                txType: BUY
            });

            ix += 1;
        }
        let buyingWalletsLen = txOrders.length;
        if (randomTx) {
            const randomTxAmountInPercents = getRandomIntInRange(this.config.minRandomTxAmountInPercents, this.config.maxRandomTxAmountInPercents);
            let randomTxAmount = Math.max(round(randomTxAmountInPercents * buyingWalletsLen / 100, 0), 1)

            ix = 0;
            const sortedWallets = sortWalletsByBalance(this.wallets, true)

            while ((randomTxAmount > 0) && (ix <= sortedWallets.length)) {
                wallet = sortedWallets[ix];

                if (wallet.tokenBalance >= 20) {
                    txOrders.push({
                        wallet: wallet,
                        amount: round(wallet.tokenBalance, 3),
                        txType: SELL
                    });
                    randomTxAmount -= 1;
                    realRandomTxAmount += 1;
                    realRandomTxSum += wallet.tokenBalance;
                }
                ix -=1;

                if (randomTxAmount <= 0) {
                    break;
                }
            }

        }

        shuffle(txOrders)

        const tokenPrice = await this.mint.getTokenPrice();
        logger.info(`buying wallets: ${buyingWalletsLen}, sum: ${round(currentEthSum, 3)}`)
        logger.info(`random selling wallets: ${realRandomTxAmount}, sum: ${round(realRandomTxSum * Number(tokenPrice), 3)}`)
        this.sendTxFromList(txOrders, true, true);
    }

    public async start() {
        logger.info("start...")
        await this.createWalletsFromFile('wallets.txt');
        await this.getGasPrice();
    }



    public async getLastWalletBalance() {
        let lastWallet = this.wallets[this.wallets.length - 1];
        await lastWallet.getBalance();
        await lastWallet.getTokenBalance();
        logger.info(`last wallet balance:\n${lastWallet.balance} ETH\n${lastWallet.tokenBalance} tokens`)
    }

    public async sellLastWallet() {
        let lastWallet = this.wallets[this.wallets.length - 1];
        await lastWallet.getTokenBalance();

        const gasPrice = await this.mint.getGasPrice()
        await lastWallet.sell(lastWallet.tokenBalance.toString(), this.config.slippage, gasPrice);
    }


    public async transferTokens() {
        let currentWallet;
        let isSuccess;
        let successCount = 0;
        const toKey = this.wallets[this.wallets.length-1].getPublicKey();
        for (let i = 0; i < this.wallets.length-1; i++) {
            currentWallet = this.wallets[i];
            await currentWallet.getTokenBalance();

            if (currentWallet.tokenBalance <= 10) {
                await new Promise(resolve => setTimeout(resolve, this.config.rpcReqSleep));
            }
            isSuccess = await currentWallet.transferTokens(toKey, currentWallet.tokenBalance);

            if (isSuccess) {
                successCount += 1;
                logger.info(`transfered ${currentWallet.tokenBalance} tokens from ${currentWallet.getPublicKey()} to ${toKey.toString()}`)
            }

            await new Promise(resolve => setTimeout(resolve, this.config.rpcSendTxSleep));
        }

        logger.info(`success rate: ${successCount}/${this.wallets.length}`)
    }


    public async startSlowSelling() {
        const volume = this.monitor.calcTokenVolume();

        if (volume <= 0) {
            return 
        }

        const totalSellAmount = volume * this.config['totalSellingLimitPercents'] / 100;
        const minSellAmount = convertUSDC2ETH(this.config['minSellingAmountUSDC']);
        const maxSellAmount = convertUSDC2ETH(this.config['maxSellingAmountUSDC']);
        const txOrders: TxOrder[] = [];

        if (volume) {
            logger.info(`volume: ${volume}`)
            
            let totalTokenSum = 0;
            const sortedWallets = sortWalletsByTokenBalance(this.wallets, false);


            const tokenPrice = Number(await this.mint.getTokenPrice())
            const minSellAmountTokens = round(minSellAmount / tokenPrice, 0);
            const maxSellAmountTokens = round(maxSellAmount / tokenPrice, 0);
            
            let shouldStop = false;
            for (let i = 0; i < sortedWallets.length; i++) {
                const wallet = sortedWallets[i];
                let walletTokenBalance = wallet.tokenBalance;
                if (walletTokenBalance < minSellAmountTokens) {
                    continue 
                }
                
                let randomSum;
                while (walletTokenBalance > minSellAmountTokens) {
                    if (totalTokenSum >= totalSellAmount) {
                        shouldStop = true;
                        break
                    }
                    randomSum = getRandomDecimalInRange(minSellAmountTokens, maxSellAmountTokens);

                    txOrders.push({
                        wallet: wallet,
                        amount: randomSum,
                        txType: SELL
                    });

                    walletTokenBalance -= randomSum;
                    totalTokenSum += randomSum;
                }

                if (shouldStop) {
                    break;
                }
            }

            this.sendTxFromList(txOrders, true, true);
        }
    }

}

