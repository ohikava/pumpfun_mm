import {getContract, parseUnits, formatGwei, Address } from 'viem';
import PoolABI from "../abi/poolABI.json";
import ROUTER from "../abi/vistaABI.json";
import ERC20 from "../abi/erc20.json";
import FactoryABI from "../abi/factory.json";
import { UniswapAMMSimulator } from './sandbox';
import { WETH, ROUTER_CA, GAS_LIMIT_APPROVE, GAS_LIMIT_SWAP } from './constants';
import { Config } from './interfaces';
import { parseGwei } from 'viem'

export class Token {
    private client: any;
    private tokenContract: any;
    private wethContract: any;
    public wethDecimals: number;
    public tokenDecimals: number;
    private routerContract: any;
    private factoryContract: any | undefined;
    private poolContract: any | undefined;
    public tokenAddress: string;
    public sb: UniswapAMMSimulator;
    public gasDelta: number;
    public pairAddress: string;
    constructor(tokenAddress: string, provider: any, sb:UniswapAMMSimulator, config: Config ) {
        this.sb = sb;
        this.tokenAddress = tokenAddress;
        this.client = provider;

        this.tokenContract = getContract({address: tokenAddress as Address, abi: ERC20, client: provider});
        this.wethContract = getContract({ address: WETH, abi: ERC20, client: provider });
        this.routerContract = getContract({ address: ROUTER_CA, abi: ROUTER, client: provider });
    
        this.wethDecimals = 0;
        this.tokenDecimals = 0;
        this.gasDelta = config.gasDelta;
        this.pairAddress = "";
    }

    async buy(amount: string, slippage: number, walletClient: any, gasPrice: bigint) {
        if (this.sb.isRunning) {
            this.sb.buy(amount, slippage, walletClient, 0.01);
            return;
        }
        const tokens = [WETH, this.tokenAddress];
        const time = Math.floor(Date.now() / 1000) + 200000;
        const deadline = BigInt(time);

        const amountIn = parseUnits(amount, this.wethDecimals);
        const amountOut = await this.routerContract.read.getAmountsOut([amountIn, tokens]);
        let liqFee = await this.routerContract.read.usdcToEth([await this.poolContract.read.buyTotalFee()]);
    
        gasPrice = gasPrice ? gasPrice : await this.getGasPrice();
        gasPrice = parseGwei((Number(formatGwei(gasPrice)) + this.gasDelta).toString());

        console.log(`gasPrice: ${gasPrice}, gasDelta: ${this.gasDelta}`);
        return walletClient.writeContract({
            address: ROUTER_CA,
            abi: ROUTER,
            functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
            args: [
                BigInt(Math.round(Number(amountOut[1]) * (1 - slippage / 100))),
                tokens,
                walletClient.account.address,
                deadline
            ],
            value: BigInt(Math.round(Number(liqFee) + Number(amountIn))),
            gasLimit: GAS_LIMIT_SWAP,
            gasPrice: gasPrice
        })
    }
    async getTokenPrice() {
        const tokens = [this.tokenAddress, WETH];
        const amountIn = parseUnits('1', this.tokenDecimals);
        const amountOut = await this.routerContract.read.getAmountsOut([amountIn, tokens]);
        return amountOut[1] / amountIn;
    }
    async sell(amount: string, slippage: number, walletClient: any, gasPrice: bigint) {
        if (this.sb.isRunning) {
            this.sb.sell(amount, slippage, walletClient, 0.01);
            return;
        }
        const tokens = [this.tokenAddress, WETH];
        const time = Math.floor(Date.now() / 1000) + 200000;
        const deadline = BigInt(time);
        const amountIn = parseUnits(amount, this.tokenDecimals);
        const allowance1 = await this.tokenContract.read.allowance([walletClient.account.address, ROUTER_CA]);
        
        gasPrice = gasPrice ? gasPrice : await this.getGasPrice();
        gasPrice = parseGwei((Number(formatGwei(gasPrice)) + this.gasDelta).toString());

        if (Number(allowance1) < Number(amountIn)) {
            // let tx = await this.tokenContract.write.approve([ROUTER_CA, BigInt(Number(amountIn) * 2)]);
            let tx = await walletClient.writeContract({
                address: this.tokenAddress,
                abi: ERC20,
                functionName: "approve",
                args: [ROUTER_CA, BigInt(Number(amountIn) * 2)],
                value: 0,
                gasLimit: GAS_LIMIT_APPROVE,
                gasPrice: gasPrice
            });
            await this.client.waitForTransactionReceipt(tx);
        }
        const amountOut = await this.routerContract.read.getAmountsOut([amountIn, tokens]);

        let sellfee = await this.poolContract.read.sellTotalFee();
        let liqFee = await this.routerContract.read.usdcToEth([sellfee]);
        
        return walletClient.writeContract({
            address: ROUTER_CA,
            abi: ROUTER,
            functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
            args: [
                BigInt(amountIn),
                BigInt(Math.round(Number(amountOut[1]) * (1 - slippage / 100))),
                tokens,
                walletClient.account.address,
                deadline
            ],
            value: BigInt(Math.round(Number(liqFee) * 1.03)),
            account: walletClient.account,
            gasLimit: GAS_LIMIT_SWAP,
            gasPrice: gasPrice
        });
    }

    async init() {
        this.wethDecimals = await this._getDecimals(this.wethContract);
        this.tokenDecimals = await this._getDecimals(this.tokenContract);
        this.factoryContract = await this._getFactory();
        this.poolContract = await this._getPool();
    }

    async getTokenBalance(address: string) {
        if (this.sb.isRunning) {
            return this.sb.getAddressHoldings(address).tokenBalance;
        }
        return await this.tokenContract.read.balanceOf([address]);
    }

    async _getPool() {
        const pairAddress = await this.factoryContract.read.getPair([this.tokenAddress, WETH]);
        this.pairAddress = pairAddress;
        return getContract({
            address: pairAddress,
            abi: PoolABI,
            client: this.client
        });
    }

    async _getDecimals(tokenContract: any) {
        const decimals = await tokenContract.read.decimals().catch((error: any) => {
            return 18;
        });
        return decimals;
    }

    async _getFactory() {
        const factory = await this.routerContract.read.factory();
        
        return getContract({
            address: factory,
            abi: FactoryABI,
            client: this.client
        });
    }

    async getGasPrice() {
        return await this.client.getGasPrice();
    }

    // /**
    //  * Compare the current gas price with the gas price limit.
    //  * @param gasPriceLimitGwei - The gas price limit in gwei.
    //  * @returns True if the gas price is less than or equal to the limit, false otherwise.
    //  */
    // async compareGasPrice(gasPriceLimitGwei: number) {
    //     const gasPrice = await this.getGasPrice();
    //     const gasPriceGwei = Number.parseFloat(formatGwei(gasPrice));
    //     if (gasPriceGwei <= gasPriceLimitGwei) {
    //         return true;
    //     }
    //     return false;
    // }

    async transfer(to: string, amount: string, walletClient: any) {
        // return await this.tokenContract.write.transfer([to, BigInt(amount)]);
        return walletClient.writeContract({
            address: this.tokenAddress,
            abi: ERC20,
            functionName: "transfer",
            args: [to, BigInt(amount)]
        });
    }
}