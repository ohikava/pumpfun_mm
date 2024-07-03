import ccxt, {okx, AuthenticationError, InsufficientFunds, BadRequest } from "ccxt";
import { PublicKey } from "@solana/web3.js";


export class Dispatcher {
    private exchange: okx;

    public constructor(apiKey: String, secret: String, password: String) {
        this.exchange = new ccxt.okx({
            "apiKey": apiKey,
            "secret": secret,
            'password': password
        });
    };

    public async withdraw(amount: number, destination: string, params: object) {
        return await this.exchange.withdraw("SOL", amount, destination, params);
    }
}