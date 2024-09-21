export interface Config {
    minSleepTime: number,
    maxSleepTime: number,
    slippage: number,
    RPC: string,
    CA: string,
    gasPriceLimitGwei: number,
    gasDelta: number,
    leaveOnFee: number,
    minRandomTxAmountInPercents: number,
    maxRandomTxAmountInPercents: number,
    rpcReqSleep: number,
    rpcSendTxSleep: number,
    simulation: boolean,
    errorSleep: number,
    errorMaxTries: number,
    windowSizeMin: number,
    minSellingAmountUSDC: number,
    maxSellingAmountUSDC: number,
    totalSellingLimitPercents: number
}

export interface StatisticItem {
    solBalance: number,
    tokenBalance: number
}

export interface Reserves {
    tokenReserves: number,
    ethReserves: number
}

export interface Swap {
    amountIn: number,
    amountOut: number,
    isBuy: boolean,
    to: string,
    timestamp: number
}

export interface TxOrder {
    amount: number,
    wallet: any,
    txType: string
}