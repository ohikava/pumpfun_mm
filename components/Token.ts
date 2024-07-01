import { 
    Connection, 
    PublicKey, 
    Keypair, 
    Transaction, 
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction 
} from '@solana/spl-token';

export class Token {
    public mint: PublicKey;
    private connection: Connection
    public decimals: Number;
    public tokenMeta: Object | undefined;
    constructor(mint: string, connection: Connection) {
        this.mint = new PublicKey(mint)
        this.connection = connection;
        this.decimals = 6;
        this.getDecimals()
    }


    public async getTokenMeta() {
        const url = `https://frontend-api.pump.fun/coins/${this.mint.toString()}`;

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "If-None-Match": 'W/"41b-5sP6oeDs1tG//az0nj9tRYbL22A"',
            "Priority": "u=4"
        }

        const r = await fetch(url, {
            "headers": headers
        });
        const r_body = await r.json();
        this.tokenMeta = r_body;
        return r_body;
    }
    public calculateTokenOut (solIn: number, coinData: any) {
        const virtualSolReserves = coinData.virtual_sol_reserves;
        const virtualTokenReserves = coinData.virtual_token_reserves;
        const solInLamports = solIn * LAMPORTS_PER_SOL;
        const tokenOut = Math.floor(solInLamports * virtualTokenReserves / virtualSolReserves);

        return tokenOut;
    }

    public async calculateTokenPrice() {
        if (typeof this.tokenMeta) {
            this.tokenMeta = await this.getTokenMeta()
        }
        const coinData = this.tokenMeta;

        return coinData['virtual_sol_reserves'] / coinData['virtual_token_reserves'];
    }
    public async checkIfTokenAccountExist(
        wallet: Keypair,
    ): Promise<[Boolean, PublicKey]> {
        const associatedTokenAddress = await getAssociatedTokenAddress(
            this.mint, 
            wallet.publicKey
        );
        const accountInfo = await this.connection.getAccountInfo(associatedTokenAddress);
        if (accountInfo == null) {
            return [false, associatedTokenAddress];
        } else {
            return [true, associatedTokenAddress];
        }
    }
    public getCreateTokenAccountInstruction(
        wallet: Keypair,
        tokenAccountAddress: PublicKey
    ): Transaction {
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey, 
                tokenAccountAddress, 
                wallet.publicKey, 
                this.mint, 
                TOKEN_PROGRAM_ID, 
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );

        return transaction;
    }

    public async getAccountInfo() {
        const accountInfo = await this.connection.getParsedAccountInfo(this.mint);
        return accountInfo.value?.data.parsed.info
    }

    public async getDecimals() {
        const tokenInfo = await this.getAccountInfo();
        // console.log(this.decimals)
        this.decimals = tokenInfo.decimals;
    }
    
};