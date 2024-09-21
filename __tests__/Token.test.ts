import { Token } from '../components/Token';
import {readJson} from "../components/utils";
import { CONFIG_PATH, WALLET_PATH } from "../components/constants";
import { UniswapAMMSimulator } from "../components/sandbox";
import { Config } from "../components/interfaces";
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

describe('Token', () => {
    let token: Token;
    beforeAll(async () => {  
        const config: Config = readJson(CONFIG_PATH);

        const sandbox = new UniswapAMMSimulator(1000000000000000000, 100, 18);
        sandbox.setIsRunning(false);

        const provider = createPublicClient({
            chain: mainnet,
            transport: http(),
        });

        token = new Token(config.CA, provider, sandbox, config);
    });


});