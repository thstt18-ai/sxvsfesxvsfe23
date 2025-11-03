
import { DexAggregator } from './dexAggregator';
import { storage } from './storage';
import { ethers } from 'ethers';

export interface MultiHopRoute {
  path: string[];
  dexes: string[];
  expectedProfit: number;
  gasEstimate: number;
  totalHops: number;
}

export interface MultiHopOpportunity {
  id: string;
  route: MultiHopRoute;
  profitUsd: number;
  netProfitUsd: number;
  timestamp: number;
}

export class MultiHopArbitrage {
  private dexAggregator: DexAggregator;
  private maxHops: number = 6;

  constructor(apiKey?: string) {
    this.dexAggregator = new DexAggregator(apiKey);
  }

  async findMultiHopOpportunities(
    userId: string,
    startToken: string,
    targetProfit: number = 1.0
  ): Promise<MultiHopOpportunity[]> {
    console.log(`🔍 Searching multi-hop routes from ${startToken}...`);
    
    const opportunities: MultiHopOpportunity[] = [];
    
    // Common tokens for routing
    const routingTokens = [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
      '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
      '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
    ];

    // Generate paths up to maxHops
    for (let hopCount = 2; hopCount <= this.maxHops; hopCount++) {
      const routes = this.generateRoutes(startToken, routingTokens, hopCount);
      
      for (const route of routes) {
        try {
          const opportunity = await this.evaluateRoute(userId, route);
          if (opportunity && opportunity.netProfitUsd >= targetProfit) {
            opportunities.push(opportunity);
          }
        } catch (error) {
          console.error(`Error evaluating route:`, error);
        }
      }
    }

    return opportunities.sort((a, b) => b.netProfitUsd - a.netProfitUsd);
  }

  private generateRoutes(
    startToken: string,
    availableTokens: string[],
    hopCount: number
  ): string[][] {
    const routes: string[][] = [];
    
    function buildRoute(current: string[], remaining: number) {
      if (remaining === 0 && current[current.length - 1] === startToken) {
        routes.push([...current]);
        return;
      }
      
      if (remaining === 0) return;
      
      for (const token of availableTokens) {
        if (!current.includes(token) || (remaining === 1 && token === startToken)) {
          buildRoute([...current, token], remaining - 1);
        }
      }
    }
    
    buildRoute([startToken], hopCount);
    return routes;
  }

  private async evaluateRoute(
    userId: string,
    path: string[]
  ): Promise<MultiHopOpportunity | null> {
    const amount = ethers.parseUnits('1000', 6); // Start with $1000
    
    let currentAmount = amount;
    const dexes: string[] = [];
    
    // Execute each hop
    for (let i = 0; i < path.length - 1; i++) {
      const quote = await this.dexAggregator.getQuote({
        src: path[i],
        dst: path[i + 1],
        amount: currentAmount.toString(),
      });
      
      currentAmount = BigInt(quote.dstAmount);
      dexes.push(quote.dex || '1inch');
    }
    
    const finalAmount = currentAmount;
    const profit = parseFloat(ethers.formatUnits(finalAmount - amount, 6));
    
    // Estimate gas for multi-hop
    const gasEstimate = 150000 * (path.length - 1); // 150k per hop
    const gasCostUsd = (gasEstimate * 50 * 1e-9) * 0.7; // 50 Gwei, MATIC = $0.70
    
    const netProfit = profit - gasCostUsd;
    
    if (netProfit > 0) {
      return {
        id: `multihop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        route: {
          path,
          dexes,
          expectedProfit: profit,
          gasEstimate,
          totalHops: path.length - 1,
        },
        profitUsd: profit,
        netProfitUsd: netProfit,
        timestamp: Date.now(),
      };
    }
    
    return null;
  }

  async executeMultiHop(
    userId: string,
    opportunity: MultiHopOpportunity,
    isSimulation: boolean = true
  ): Promise<any> {
    console.log(`🚀 Executing multi-hop: ${opportunity.route.path.length} hops`);
    
    await storage.createActivityLog(userId, {
      type: 'multihop',
      level: 'info',
      message: `Executing ${opportunity.route.totalHops}-hop arbitrage - Expected: $${opportunity.netProfitUsd.toFixed(2)}`,
      metadata: opportunity,
    });
    
    // TODO: Implement actual execution via flash loan
    return {
      success: true,
      profitUsd: opportunity.netProfitUsd,
      txHash: isSimulation ? 'simulation' : '0x...',
    };
  }
}

export const multiHopArbitrage = new MultiHopArbitrage();
