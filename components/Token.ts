import { 
    Connection, 
    PublicKey, 
    Keypair, 
    Transaction, 
    LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction 
} from '@solana/spl-token';
import { Sandbox } from './sandbox';
import { TokenMeta } from './interfaces';

export class Token {
    public mint: PublicKey;
    private connection: Connection
    public decimals: number;
    public tokenMeta: TokenMeta;
    public sb: Sandbox;
    constructor(mint: string, connection: Connection, sb: Sandbox) {
        this.mint = new PublicKey(mint)
        this.connection = connection;
        this.decimals = 6;
        this.sb = sb;
        this.tokenMeta = {
            "total_supply": 0,
            "virtual_sol_reserves": 1,
            "virtual_token_reserves": 1
        }

        this.getDecimals()
        this.getTokenMeta()
    }

    public getTotalSupply() {
        return this.tokenMeta['total_supply'] / 10**6;
    }
    public async getTokenMeta() {
        if (this.sb.isRunning) {
            this.tokenMeta = this.sb.getTokenMeta()
            return this.tokenMeta
        }
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


    public async checkIfTokenAccountExist(
        wallet: PublicKey,
    ): Promise<[Boolean, PublicKey]> {
        const associatedTokenAddress = await getAssociatedTokenAddress(
            this.mint, 
            wallet
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
        if (this.sb.isRunning) {
            this.decimals = this.sb.getDecimals()
            return;
        }
        const tokenInfo = await this.getAccountInfo();
        // console.log(this.decimals)
        this.decimals = tokenInfo.decimals;
    }
    
};