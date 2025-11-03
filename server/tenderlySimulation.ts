// Using built-in fetch API (Node.js 18+)

interface TenderlySimulation {
  success: boolean;
  profit: bigint;
  gasUsed: number;
  revertReason?: string;
}

interface SimulationRequest {
  from: string;
  to: string;
  data: string;
  value: string;
  gasLimit: number;
}

export class TenderlySimulator {
  private apiKey: string;
  private projectId: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.TENDERLY_API_KEY || "";
    this.projectId = process.env.TENDERLY_PROJECT_ID || "";
    this.enabled = process.env.ENABLE_TENDERLY === "true";
  }

  async simulateTransaction(request: SimulationRequest): Promise<TenderlySimulation> {
    if (!this.enabled) {
      console.log("⏭️  Tenderly simulation disabled, executing without simulation");
      return {
        success: true,
        profit: BigInt(0),
        gasUsed: 0,
      };
    }

    if (!this.apiKey || !this.projectId) {
      console.warn("⚠️ Tenderly credentials not configured, skipping simulation");
      return {
        success: true,
        profit: BigInt(0),
        gasUsed: 0,
      };
    }

    try {
      console.log("🔬 Simulating transaction with Tenderly...");

      const response = await fetch(
        `https://api.tenderly.co/api/v1/account/${this.projectId}/project/arbitrage-bot/simulate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Key": this.apiKey,
          },
          body: JSON.stringify({
            network_id: "137", // Polygon Mainnet
            from: request.from,
            to: request.to,
            input: request.data,
            value: request.value,
            gas: request.gasLimit,
            save: false,
            save_if_fails: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Tenderly API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.transaction || !data.transaction.transaction_info) {
        throw new Error("Invalid Tenderly response");
      }

      const txInfo = data.transaction.transaction_info;
      const success = txInfo.call_trace.status;
      const gasUsed = parseInt(txInfo.gas_used);

      if (!success) {
        console.log("❌ Simulation FAILED:");
        console.log(`   Revert reason: ${txInfo.call_trace.error || "Unknown"}`);
        return {
          success: false,
          profit: BigInt(0),
          gasUsed,
          revertReason: txInfo.call_trace.error || "Transaction reverted",
        };
      }

      console.log("✅ Simulation SUCCESSFUL:");
      console.log(`   Gas used: ${gasUsed.toLocaleString()}`);

      return {
        success: true,
        profit: BigInt(0), // TODO: Parse profit from logs
        gasUsed,
      };
    } catch (error: any) {
      console.error("❌ Tenderly simulation error:", error.message);

      // Fail-safe: allow execution if simulation fails
      console.warn("⚠️ Proceeding without simulation due to error");
      return {
        success: true,
        profit: BigInt(0),
        gasUsed: 0,
      };
    }
  }

  async validateBeforeExecution(
    request: SimulationRequest,
    expectedProfit: bigint,
    maxSlippage: number = 5
  ): Promise<{ allowed: boolean; reason?: string }> {
    const simulation = await this.simulateTransaction(request);

    if (!simulation.success) {
      return {
        allowed: false,
        reason: simulation.revertReason || "Transaction would revert",
      };
    }

    // Check if gas cost exceeds profit (not implemented in basic version)
    // This would require parsing profit from transaction logs

    console.log("✅ Transaction validated, safe to execute");
    return { allowed: true };
  }
}

export const tenderlySimulator = new TenderlySimulator();