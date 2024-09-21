import { Wallet } from "../components/Wallet";
import { Token } from "../components/Token";
import { Config } from "../components/interfaces";
import {readJson} from "../components/utils";
import { CONFIG_PATH, WALLET_PATH } from "../components/constants";
import { UniswapAMMSimulator } from "../components/sandbox";
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import * as fs from "fs";


const provider = createPublicClient({
    chain: mainnet,
    transport: http(),
});

const config: Config = readJson(CONFIG_PATH);

const sandbox = new UniswapAMMSimulator(1000000000000000000, 100, 18);
sandbox.setIsRunning(false);

const token = new Token(config.CA, provider, sandbox, config);

const privateKey = fs.readFileSync(WALLET_PATH, 'utf8').split("\n")[0];

describe('Wallet Class Tests', () => {
    let wallet: Wallet;

    beforeAll(async () => {
        wallet = new Wallet(privateKey, token, provider, config);
        console.log(wallet.getPublicKey());
        await token.init();
    });

    test('should get balance', async () => {
        await wallet.init();
        const balance = await wallet.getBalance();
        console.log('Balance:', balance);
        expect(balance).toBeDefined(); // Add your expected value check
    });

    test('should get token balance', async () => {
        const tokenBalance = await wallet.getTokenBalance();
        console.log('Token Balance:', tokenBalance);
        expect(tokenBalance).toBeDefined(); // Add your expected value check
    });


});