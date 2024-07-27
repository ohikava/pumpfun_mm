import { RANKS } from "./constants"

export interface Config {
    minSleepTime: number,
    maxSleepTime: number,
    slippage: number,
    RPC: string,
    CA: string,
    unitPrice: number,
    unitBudget: number,
    holderWalletsAmountInPercents: number,
    leaveOnFeeSol: number,
    minRandomTxAmountInPercents: number,
    maxRandomTxAmountInPercents: number,
    rpcReqSleep: number,
    rpcSendTxSleep: number,
    simulation: boolean
}

export interface StatisticItem {
    solBalance: number,
    tokenBalance: number
}

export interface TokenMeta {
    total_supply: number,
    virtual_sol_reserves: number,
    virtual_token_reserves: number
}

export interface DispatchConf {
    solBalance: number,
    rank: RANKS
}