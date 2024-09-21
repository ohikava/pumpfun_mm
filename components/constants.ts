import { getAddress, parseAbiItem } from 'viem';

export const CONFIG_PATH = "config.json";
export const BUY = "BUY";
export const SELL = "SELL";
export const TOKEN_ABI_PATH = "tokenABI.json";
export const WALLET_PATH = "wallets.txt";
export const POOL_ABI_PATH = "poolABI.json";
export const VISTA_ABI_PATH = "vistaABI.json"
export const VISTA_CA = "0xEAaa41cB2a64B11FE761D41E747c032CdD60CaCE"

export const WETH = getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
export const ROUTER_CA = getAddress("0xEad811D798020c635cf8dD4ddF31bDC5595B09F3");

export const GAS_LIMIT_APPROVE = 70000;
export const GAS_LIMIT_SWAP = 270000;

export const eventABI = parseAbiItem('event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,address indexed to)');
export const fromBlock = 0;
export const toBlock = 'latest';
export const MIN_LATEST_TX_AMOUNT = 30;
export const ETHPRICE = 2566