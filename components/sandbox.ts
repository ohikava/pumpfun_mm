export class UniswapAMMSimulator {
    private tokenSupply: number;
    private pooledEthLiquidity: number;
    private decimals: number;
    private tokenBalance: number;
    private ethBalance: number;
    private tokenHoldings: Map<string, number>;
    private ethHoldings: Map<string, number>;
    public isRunning: boolean;
    

    constructor(tokenSupply: number, pooledEthLiquidity: number, decimals: number) {
        this.tokenSupply = tokenSupply;
        this.pooledEthLiquidity = pooledEthLiquidity;
        this.decimals = decimals;
        this.tokenBalance = tokenSupply;
        this.ethBalance = pooledEthLiquidity;
        this.tokenHoldings = new Map<string, number>();
        this.ethHoldings = new Map<string, number>();
        this.isRunning = false;
        
    }

    public setIsRunning(isRunning: boolean) {
        this.isRunning = isRunning;
    }

    public buy(buyerPublicKey: string, minTokenOutput: number, ethInput: number, fee: number): void {
        const tokenOutput = this.getTokenOutputForEthInput(ethInput);

        if (tokenOutput < minTokenOutput) {
            throw new Error("Slippage too high");
        }

        const ethWithFee = ethInput + fee;

        // Update pool state
        this.tokenBalance -= tokenOutput;
        this.ethBalance += ethInput;

        // Update mappings
        this.updateHoldings(this.tokenHoldings, buyerPublicKey, tokenOutput);
        this.updateHoldings(this.ethHoldings, buyerPublicKey, -ethWithFee);
    }

    public sell(sellerPublicKey: string, tokenInput: number, minEthOutput: number, fee: number): void {

        const ethOutputWithFee = minEthOutput - fee;

        // Update pool state
        this.tokenBalance += tokenInput;
        this.ethBalance -= ethOutputWithFee;

        // Update mappings
        this.updateHoldings(this.tokenHoldings, sellerPublicKey, -tokenInput);
        this.updateHoldings(this.ethHoldings, sellerPublicKey, ethOutputWithFee);
    }

    public getPoolState(): { tokenBalance: number; ethBalance: number } {
        return {
            tokenBalance: this.tokenBalance,
            ethBalance: this.ethBalance
        };
    }


    public getTokenOutputForEthInput(ethInput: number): number {
        const k = this.tokenBalance * this.ethBalance;
        return this.tokenBalance - (k / (this.ethBalance + ethInput));
    }

    public getEthOutputForTokenInput(tokenInput: number): number {
        const k = this.tokenBalance * this.ethBalance;
        return this.ethBalance - (k / (this.tokenBalance + tokenInput));
    }

    private updateHoldings(holdings: Map<string, number>, publicKey: string, amount: number): void {
        const currentHolding = holdings.get(publicKey) || 0;
        holdings.set(publicKey, currentHolding + amount);
    }

    public getAddressHoldings(publicKey: string): { tokenBalance: number; ethBalance: number } {
        return {
            tokenBalance: this.tokenHoldings.get(publicKey) || 0,
            ethBalance: this.ethHoldings.get(publicKey) || 0
        };
    }
}
