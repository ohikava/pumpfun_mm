import { UniswapAMMSimulator } from '../components/sandbox';

describe('UniswapAMMSimulator', () => {
  let simulator: UniswapAMMSimulator;

  beforeEach(() => {
    simulator = new UniswapAMMSimulator(1000000, 100, 18);
  });

  it('should initialize with correct pool state', () => {
    const poolState = simulator.getPoolState();
    expect(poolState.tokenBalance).toBe(1000000);
    expect(poolState.ethBalance).toBe(100);
  });

  it('should execute a buy order correctly', () => {
    const eth_input = 0.1;
    const minTokenOutput = simulator.getTokenOutputForEthInput(eth_input);
    simulator.buy('buyer1', minTokenOutput, eth_input, 0.1);
    const poolState = simulator.getPoolState();
    expect(poolState.tokenBalance).toBeLessThan(1000000);
    expect(poolState.ethBalance).toBeGreaterThan(100);
  });

  // Add more test cases for sell, slippage protection, etc.
});