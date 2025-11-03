import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ethers } from "ethers";
import { testTelegramConnection, sendTelegramMessage } from "./telegram";
import { web3Provider, POLYGON_TOKENS } from "./web3Provider";
import { dexAggregator, DexAggregator, DEX_ROUTERS } from "./dexAggregator";
import { aaveFlashLoan } from "./aaveFlashLoan";
import { aaveFlashLoanV3 } from "./aaveFlashLoanV3";
import { opportunityScanner } from "./opportunityScanner";
import {
  insertOpenPositionSchema,
  insertFlashLoanRequestSchema
} from "@shared/schema";
import { z } from "zod";
import { authorizeExecutor, checkExecutorStatus } from "./contractAuthorization";
import path from "path";
import { fileURLToPath } from "url";

import { storage } from "./storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Telegram configuration
import { isTelegramEnabled, setTelegramEnabled } from './telegramConfig';

import contractsRouter from './routes/contracts';

export async function registerRoutes(app: Express): Promise<Server> {
  const DEMO_USER_ID = "demo-user-1";

  // Helper function to get DexAggregator with user's API key
  async function getDexAggregatorForUser(userId: string): Promise<DexAggregator> {
    const config = await storage.getBotConfig(userId);
    const apiKey = config?.oneinchApiKey?.trim() || undefined;
    return new DexAggregator(apiKey);
  }

  // Health metrics endpoint
  // Provides real-time performance and security metrics for the trading bot.
  app.get('/api/health/metrics', async (_req, res) => {
    try {
      const { tradingHealthMonitor } = await import('./tradingHealthMonitor');
      const metrics = tradingHealthMonitor.getMetrics();

      // Add security metrics
      const config = await storage.getBotConfig(DEMO_USER_ID);
      const securityMetrics = {
        mev_protection_used: config?.useFlashbots || false,
        flash_loan_used: !!config?.flashLoanContract,
        hardware_wallet_used: config?.ledgerEnabled || false,
        meta_tx_enabled: !!process.env.RELAYER_PRIVATE_KEY,
        uups_proxy_enabled: true,
      };

      // Enhanced trading metrics
      const { strategyOptimizer } = await import('./strategyOptimizer');
      const performance = await strategyOptimizer.analyzePerformance(DEMO_USER_ID);

      const enhancedMetrics = {
        active_dex_count: Object.keys(DEX_ROUTERS).length,
        avg_profit_per_trade_usd: performance.avgProfitUsd,
        win_rate: performance.winRate,
        sharpe_ratio_30d: performance.sharpeRatio,
        total_gas_spent_usd: performance.totalGasSpent,
        mev_protection_success_rate: config?.useFlashbots ? 0.95 : 0, // Mock data
      };

      res.json({
        ...metrics,
        security: securityMetrics,
        performance: enhancedMetrics
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bot Config Routes
  // Manages the bot's configuration settings, including API keys, network preferences, and trading parameters.
  app.get("/api/bot/config", async (req, res) => {
    try {
      const userId = "demo-user-1";
      let config = await storage.getBotConfig(userId);

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      // Автоматически загружаем адрес контракта из env если не настроен
      if (!config.flashLoanContract || config.flashLoanContract === '0x0000000000000000000000000000000000000000') {
        const envContract = process.env.ARBITRAGE_CONTRACT || process.env.ARBITRAGE_EXECUTOR_ADDRESS;
        if (envContract && envContract !== '0x0000000000000000000000000000000000000000') {
          await storage.updateBotConfig(userId, {
            flashLoanContract: envContract
          });
          config.flashLoanContract = envContract;
          console.log(`✅ Автоматически установлен адрес контракта: ${envContract}`);
        }
      }

      res.json(config);
    } catch (error: any) {
      console.error("Error fetching bot config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bot/config", async (req, res) => {
    try {
      // Exclude server-managed fields
      const { id, userId, createdAt, updatedAt, ...configData } = req.body;
      const config = await storage.upsertBotConfig(DEMO_USER_ID, configData);
      res.json(config);
    } catch (error) {
      console.error("Error updating bot config:", error);
      res.status(500).json({ error: "Failed to update bot config" });
    }
  });

  // Bot Status Routes
  // Provides the current operational status of the trading bot, including whether it's running, paused, or has encountered errors.
  app.get("/api/bot/status", async (req, res) => {
    try {
      const status = await storage.getBotStatus(DEMO_USER_ID);
      res.json(status);
    } catch (error) {
      console.error("Error getting bot status:", error);
      res.status(500).json({ error: "Failed to get bot status" });
    }
  });

  app.post("/api/bot/start", async (req, res) => {
    try {
      console.log("🚀 Starting bot...");

      // Update status in database
      const status = await storage.updateBotStatus(DEMO_USER_ID, {
        isRunning: true,
        isPaused: false,
        lastStartedAt: new Date(),
      });

      // START OPPORTUNITY SCANNER - THIS IS THE CRITICAL FIX!
      await opportunityScanner.startScanning(DEMO_USER_ID);
      console.log("✅ Opportunity scanner started successfully");

      // Create activity log
      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'bot_control',
        level: 'success',
        message: 'Бот запущен - сканер арбитражных возможностей активирован',
        metadata: { isRunning: true },
      });

      // Broadcast status update via WebSocket (after httpServer is created)
      setImmediate(() => {
        const broadcast = (req as any).app.locals.wsBroadcast;
        if (broadcast) {
          broadcast('botStatusUpdate', { isRunning: true, isPaused: false });
        }
      });

      res.json(status);
    } catch (error) {
      console.error("Error starting bot:", error);

      // Log error
      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'bot_control',
        level: 'error',
        message: `Ошибка запуска бота: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) },
      });

      res.status(500).json({ error: "Failed to start bot" });
    }
  });

  app.post("/api/bot/stop", async (req, res) => {
    try {
      console.log("🛑 Stopping bot...");

      // STOP OPPORTUNITY SCANNER - THIS IS THE CRITICAL FIX!
      await opportunityScanner.stopScanning(DEMO_USER_ID);
      console.log("✅ Opportunity scanner stopped successfully");

      // Update status in database
      const status = await storage.updateBotStatus(DEMO_USER_ID, {
        isRunning: false,
        lastStoppedAt: new Date(),
      });

      // Create activity log
      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'bot_control',
        level: 'info',
        message: 'Бот остановлен - сканер арбитражных возможностей деактивирован',
        metadata: { isRunning: false },
      });

      // Broadcast status update via WebSocket
      setImmediate(() => {
        const broadcast = (req as any).app.locals.wsBroadcast;
        if (broadcast) {
          broadcast('botStatusUpdate', { isRunning: false });
        }
      });

      res.json(status);
    } catch (error) {
      console.error("Error stopping bot:", error);

      // Log error
      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'bot_control',
        level: 'error',
        message: `Ошибка остановки бота: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) },
      });

      res.status(500).json({ error: "Failed to stop bot" });
    }
  });

  // Ledger Status Routes
  // Manages the status and updates of the ledger, tracking financial transactions and balances.
  app.get("/api/ledger/status", async (req, res) => {
    try {
      const status = await storage.getLedgerStatus(DEMO_USER_ID);
      res.json(status);
    } catch (error) {
      console.error("Error getting ledger status:", error);
      res.status(500).json({ error: "Failed to get ledger status" });
    }
  });

  app.post("/api/ledger/status", async (req, res) => {
    try {
      const status = await storage.updateLedgerStatus(DEMO_USER_ID, req.body);
      res.json(status);
    } catch (error) {
      console.error("Error updating ledger status:", error);
      res.status(500).json({ error: "Failed to update ledger status" });
    }
  });

  // Safe Transaction Routes
  // Manages safe transactions, ensuring the security and integrity of financial operations.
  app.get("/api/safe/transactions", async (req, res) => {
    try {
      const transactions = await storage.getSafeTransactions(DEMO_USER_ID);
      res.json(transactions);
    } catch (error) {
      console.error("Error getting safe transactions:", error);
      res.status(500).json({ error: "Failed to get safe transactions" });
    }
  });

  app.post("/api/safe/transactions", async (req, res) => {
    try {
      const transaction = await storage.createSafeTransaction(DEMO_USER_ID, req.body);
      res.json(transaction);
    } catch (error) {
      console.error("Error creating safe transaction:", error);
      res.status(500).json({ error: "Failed to create safe transaction" });
    }
  });

  // Arbitrage Transaction Routes
  // Records and manages arbitrage transactions, tracking profits and execution details.
  app.get("/api/arbitrage/transactions", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const transactions = await storage.getArbitrageTransactions(DEMO_USER_ID, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error getting arbitrage transactions:", error);
      res.status(500).json({ error: "Failed to get arbitrage transactions" });
    }
  });

  app.post("/api/arbitrage/transactions", async (req, res) => {
    try {
      const transaction = await storage.createArbitrageTransaction(DEMO_USER_ID, req.body);
      res.json(transaction);
    } catch (error) {
      console.error("Error creating arbitrage transaction:", error);
      res.status(500).json({ error: "Failed to create arbitrage transaction" });
    }
  });

  // Connected Wallets Routes
  // Manages connected user wallets, tracking addresses and connection status.
  app.get("/api/wallets", async (req, res) => {
    try {
      const wallets = await storage.getConnectedWallets(DEMO_USER_ID);
      res.json(wallets);
    } catch (error) {
      console.error("Error getting connected wallets:", error);
      res.status(500).json({ error: "Failed to get connected wallets" });
    }
  });

  app.post("/api/wallets/connect", async (req, res) => {
    try {
      const wallet = await storage.connectWallet(DEMO_USER_ID, req.body);
      res.json(wallet);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      res.status(500).json({ error: "Failed to connect wallet" });
    }
  });

  app.post("/api/wallets/:id/disconnect", async (req, res) => {
    try {
      const walletId = parseInt(req.params.id);
      await storage.disconnectWallet(DEMO_USER_ID, walletId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      res.status(500).json({ error: "Failed to disconnect wallet" });
    }
  });

  // Telegram settings
  // Manages Telegram integration settings, allowing users to enable/disable notifications and test connections.
  app.get("/api/telegram/status", async (req, res) => {
    // No authentication needed for status check
    res.json({ enabled: isTelegramEnabled() });
  });

  app.post("/api/telegram/toggle", async (req, res) => {
    // Assuming authentication is handled elsewhere or not required for this toggle
    const { enabled } = req.body;
    setTelegramEnabled(enabled === true);
    res.json({
      success: true,
      enabled: isTelegramEnabled()
    });
  });

  // Telegram routes
  // Handles Telegram-specific operations, including testing connections and sending messages.
  app.post("/api/telegram/test", async (req, res) => {
    if (!isTelegramEnabled()) {
      return res.status(400).json({ error: "Telegram module is disabled" });
    }
    try {
      const result = await testTelegramConnection(DEMO_USER_ID);
      res.json(result);
    } catch (error) {
      console.error("Error testing Telegram:", error);
      res.status(500).json({ error: "Failed to test Telegram connection" });
    }
  });

  app.post("/api/telegram/send", async (req, res) => {
    if (!isTelegramEnabled()) {
      return res.status(400).json({ error: "Telegram module is disabled" });
    }
    try {
      const { message } = req.body;
      const result = await sendTelegramMessage(DEMO_USER_ID, message);
      res.json(result);
    } catch (error) {
      console.error("Error sending Telegram message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // User Route (required by useAuth hook)
  // Manages user profile information, including name, email, and other relevant details.
  app.get("/api/user", async (req, res) => {
    try {
      let user = await storage.getUser(DEMO_USER_ID);

      if (!user) {
        user = await storage.upsertUser({
          id: DEMO_USER_ID,
          email: "demo@example.com",
          firstName: "Demo",
          lastName: "User",
        });
      }

      res.json(user);
    } catch (error) {
      console.error("Error getting user:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Web3 / Polygon Integration Routes
  // Provides Web3 functionalities, including balance checks, gas price retrieval, and transaction details on the Polygon network.
  app.get("/api/web3/balance/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : 137;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const balance = await web3Provider.getNativeBalance(address, chainId);
      res.json(balance);
    } catch (error) {
      console.error("Error getting native balance:", error);
      res.status(500).json({ error: "Failed to get balance" });
    }
  });

  app.get("/api/web3/wallet/:address/balances", async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : 137;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const balances = await web3Provider.getWalletBalances(address, chainId);
      res.json(balances);
    } catch (error) {
      console.error("Error getting wallet balances:", error);
      res.status(500).json({ error: "Failed to get wallet balances" });
    }
  });

  app.get("/api/web3/gas-price", async (req, res) => {
    try {
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : 137;
      const gasPrice = await web3Provider.getGasPrice(chainId);
      res.json(gasPrice);
    } catch (error) {
      console.error("Error getting gas price:", error);
      res.status(500).json({ error: "Failed to get gas price" });
    }
  });

  app.get("/api/web3/block-number", async (req, res) => {
    try {
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : 137;
      const blockNumber = await web3Provider.getBlockNumber(chainId);
      res.json({ blockNumber });
    } catch (error) {
      console.error("Error getting block number:", error);
      res.status(500).json({ error: "Failed to get block number" });
    }
  });

  app.get("/api/web3/transaction/:txHash", async (req, res) => {
    try {
      const { txHash } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : 137;
      const tx = await web3Provider.getTransaction(txHash, chainId);
      res.json(tx);
    } catch (error) {
      console.error("Error getting transaction:", error);
      res.status(500).json({ error: "Failed to get transaction" });
    }
  });

  app.get("/api/web3/token-addresses", (req, res) => {
    res.json(POLYGON_TOKENS);
  });

  // DEX / Trading Routes
  // Facilitates decentralized exchange operations, including token price lookups, trade quotes, and swap execution.
  app.get("/api/dex/tokens", (req, res) => {
    try {
      const tokens = dexAggregator.getSupportedTokens();
      res.json(tokens);
    } catch (error) {
      console.error("Error getting supported tokens:", error);
      res.status(500).json({ error: "Failed to get tokens" });
    }
  });

  app.get("/api/dex/quote", async (req, res) => {
    try {
      const { src, dst, amount, from } = req.query;

      if (!src || !dst || !amount) {
        return res.status(400).json({ error: "Missing required parameters: src, dst, amount" });
      }

      const aggregator = await getDexAggregatorForUser(DEMO_USER_ID);
      const quote = await aggregator.getQuote({
        src: src as string,
        dst: dst as string,
        amount: amount as string,
        from: from as string,
      });

      res.json(quote);
    } catch (error) {
      console.error("Error getting quote:", error);
      res.status(500).json({ error: "Failed to get quote" });
    }
  });

  app.post("/api/dex/swap", async (req, res) => {
    try {
      const { src, dst, amount, from } = req.body;

      if (!src || !dst || !amount) {
        return res.status(400).json({ error: "Missing required parameters: src, dst, amount" });
      }

      // Execute simulated swap
      const aggregator = await getDexAggregatorForUser(DEMO_USER_ID);
      const result = await aggregator.executeSwap({ src, dst, amount, from });

      // Create arbitrage transaction record
      await storage.createArbitrageTransaction(DEMO_USER_ID, {
        txHash: result.txHash,
        tokenIn: src,
        tokenOut: dst,
        amountIn: amount,
        amountOut: '0', // Would be filled in real transaction
        profit: 0,
        gasCost: 0,
        status: 'demo',
        timestamp: new Date(),
      });

      // Create activity log
      const log = await storage.createActivityLog(DEMO_USER_ID, {
        type: 'swap',
        level: 'success',
        message: `Swap выполнен: ${amount} ${src.slice(0, 6)}... → ${dst.slice(0, 6)}...`,
        metadata: {
          txHash: result.txHash,
          tokenIn: src,
          tokenOut: dst,
          amountIn: amount,
        },
      });

      // Broadcast swap event and log via WebSocket
      if (app.locals.wsBroadcast) {
        app.locals.wsBroadcast('swap_executed', {
          txHash: result.txHash,
          tokenIn: src,
          tokenOut: dst,
          amountIn: amount,
          timestamp: new Date().toISOString(),
        });
        app.locals.wsBroadcast('activity_log', log);
      }

      res.json(result);
    } catch (error) {
      console.error("Error executing swap:", error);

      // Log error
      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'swap',
        level: 'error',
        message: `Ошибка swap: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) },
      });

      res.status(500).json({ error: "Failed to execute swap" });
    }
  });

  app.get("/api/dex/prices", async (req, res) => {
    try {
      const addresses = req.query.addresses as string;
      if (!addresses) {
        return res.status(400).json({ error: "Missing addresses parameter" });
      }

      const tokenAddresses = addresses.split(',');
      const aggregator = await getDexAggregatorForUser(DEMO_USER_ID);
      const prices = await aggregator.getTokenPrices(tokenAddresses);
      res.json(prices);
    } catch (error) {
      console.error("Error getting token prices:", error);
      res.status(500).json({ error: "Failed to get prices" });
    }
  });

  app.get("/api/dex/arbitrage-opportunities", async (req, res) => {
    try {
      const aggregator = await getDexAggregatorForUser(DEMO_USER_ID);
      const opportunities = await aggregator.getArbitrageOpportunities();
      res.json(opportunities);
    } catch (error) {
      console.error("Error getting arbitrage opportunities:", error);
      res.status(500).json({ error: "Failed to get arbitrage opportunities" });
    }
  });

  // Activity Logs Routes
  // Provides access to activity logs, detailing bot actions, errors, and user interactions for auditing and debugging.
  app.get("/api/activity-logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getActivityLogs(DEMO_USER_ID, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error getting activity logs:", error);
      res.status(500).json({ error: "Failed to get activity logs" });
    }
  });

  app.post("/api/activity-logs", async (req, res) => {
    try {
      const log = await storage.createActivityLog(DEMO_USER_ID, req.body);

      // Broadcast log via WebSocket
      if (app.locals.wsBroadcast) {
        app.locals.wsBroadcast('activity_log', log);
      }

      res.json(log);
    } catch (error) {
      console.error("Error creating activity log:", error);
      res.status(500).json({ error: "Failed to create activity log" });
    }
  });

  app.delete("/api/activity-logs", async (req, res) => {
    try {
      const daysToKeep = req.query.daysToKeep ? parseInt(req.query.daysToKeep as string) : 7;
      await storage.clearOldLogs(DEMO_USER_ID, daysToKeep);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing old logs:", error);
      res.status(500).json({ error: "Failed to clear old logs" });
    }
  });

  // Telegram Messages Routes
  // Retrieves historical Telegram messages, useful for reviewing bot notifications and communication logs.
  app.get("/api/telegram/messages", async (req, res) => {
    if (!isTelegramEnabled()) {
      return res.status(400).json({ error: "Telegram module is disabled" });
    }
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const messages = await storage.getTelegramMessages(DEMO_USER_ID, limit);
      res.json(messages);
    } catch (error) {
      console.error("Error getting telegram messages:", error);
      res.status(500).json({ error: "Failed to get telegram messages" });
    }
  });

  // Open Positions Routes
  // Manages open trading positions, allowing users to view, create, update, and close positions.
  app.get("/api/positions/open", async (req, res) => {
    try {
      const positions = await storage.getOpenPositions(DEMO_USER_ID);
      res.json(positions);
    } catch (error) {
      console.error("Error getting open positions:", error);
      res.status(500).json({ error: "Failed to get open positions" });
    }
  });

  app.post("/api/positions/open", async (req, res) => {
    try {
      // Validate request body
      const validatedData = insertOpenPositionSchema.omit({ userId: true }).parse(req.body);
      const position = await storage.createOpenPosition(DEMO_USER_ID, validatedData);

      // Broadcast new position via WebSocket
      if (app.locals.wsBroadcast) {
        app.locals.wsBroadcast('position_opened', position);
      }

      res.json(position);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating open position:", error);
      res.status(500).json({ error: "Failed to create open position" });
    }
  });

  app.patch("/api/positions/open/:id", async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      if (isNaN(positionId)) {
        return res.status(400).json({ error: "Invalid position ID" });
      }

      // Validate request body - allow partial updates
      const updateSchema = insertOpenPositionSchema.omit({ userId: true }).partial();
      const validatedData = updateSchema.parse(req.body);

      const position = await storage.updateOpenPosition(DEMO_USER_ID, positionId, validatedData);

      // Broadcast position update via WebSocket
      if (app.locals.wsBroadcast) {
        app.locals.wsBroadcast('position_updated', position);
      }

      res.json(position);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating open position:", error);
      res.status(500).json({ error: "Failed to update open position" });
    }
  });

  app.post("/api/positions/close/:id", async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      await storage.closePosition(DEMO_USER_ID, positionId);

      // Broadcast position closed via WebSocket
      if (app.locals.wsBroadcast) {
        app.locals.wsBroadcast('position_closed', { positionId });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error closing position:", error);
      res.status(500).json({ error: "Failed to close position" });
    }
  });

  // Safe Transactions Routes (database only - frontend handles Safe SDK)
  // Manages safe transaction data stored in the database, complementing frontend SDK interactions.
  app.get("/api/safe/transactions", async (req, res) => {
    try {
      const transactions = await storage.getSafeTransactions(DEMO_USER_ID);
      res.json(transactions);
    } catch (error) {
      console.error("Error getting Safe transactions:", error);
      res.status(500).json({ error: "Failed to get Safe transactions" });
    }
  });

  app.post("/api/safe/transactions", async (req, res) => {
    try {
      const transaction = await storage.createSafeTransaction(DEMO_USER_ID, req.body);
      res.json(transaction);
    } catch (error) {
      console.error("Error creating Safe transaction:", error);
      res.status(500).json({ error: "Failed to create Safe transaction" });
    }
  });

  // Opportunity Scanner Routes
  // Controls the opportunity scanner, allowing it to be started, stopped, and queried for available arbitrage opportunities.
  app.post("/api/scanner/start", async (req, res) => {
    try {
      if (opportunityScanner.isRunning()) {
        return res.status(400).json({ error: "Scanner already running" });
      }

      const config = req.body || {};

      // Set broadcast callback
      opportunityScanner.setBroadcastCallback((type, data) => {
        if (app.locals.wsBroadcast) {
          app.locals.wsBroadcast(type, data);
        }
      });

      await opportunityScanner.startScanning(DEMO_USER_ID, config);

      res.json({ success: true, message: "Scanner started" });
    } catch (error: any) {
      console.error("Error starting scanner:", error);
      res.status(500).json({ error: error.message || "Failed to start scanner" });
    }
  });

  app.post("/api/scanner/stop", async (req, res) => {
    try {
      opportunityScanner.stopScanning();
      res.json({ success: true, message: "Scanner stopped" });
    } catch (error: any) {
      console.error("Error stopping scanner:", error);
      res.status(500).json({ error: error.message || "Failed to stop scanner" });
    }
  });

  app.get("/api/scanner/opportunities", async (req, res) => {
    try {
      const opportunities = opportunityScanner.getOpportunities();
      res.json(opportunities);
    } catch (error: any) {
      console.error("Error getting opportunities:", error);
      res.status(500).json({ error: error.message || "Failed to get opportunities" });
    }
  });

  // Network Management
  app.get("/api/network/current", async (req, res) => {
    try {
      const { networkManager } = await import('./networkManager');
      const network = networkManager.getCurrentNetwork();
      const config = networkManager.getNetworkConfig();
      res.json({ network, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/network/switch", async (req, res) => {
    try {
      const { networkManager } = await import('./networkManager');
      const { network } = req.body;
      await networkManager.switchNetwork(network);
      res.json({ success: true, network });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Paper Trading
  app.post("/api/paper-trading/execute", async (req, res) => {
    try {
      const { paperTradingEngine } = await import('./paperTradingEngine');
      const { opportunity } = req.body;
      const result = await paperTradingEngine.executePaperTrade(DEMO_USER_ID, opportunity);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paper-trading/metrics", async (req, res) => {
    try {
      const { paperTradingEngine } = await import('./paperTradingEngine');
      const metrics = paperTradingEngine.getPerformanceMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paper-trading/reset", async (req, res) => {
    try {
      const { paperTradingEngine } = await import('./paperTradingEngine');
      paperTradingEngine.reset();
      res.json({ success: true, message: "Paper trading reset" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Multi-hop Arbitrage
  app.get("/api/multihop/opportunities", async (req, res) => {
    try {
      const { multiHopArbitrage } = await import('./multiHopArbitrage');
      const { startToken } = req.query;
      const opportunities = await multiHopArbitrage.findMultiHopOpportunities(
        DEMO_USER_ID,
        startToken as string
      );
      res.json(opportunities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/multihop/execute", async (req, res) => {
    try {
      const { multiHopArbitrage } = await import('./multiHopArbitrage');
      const { opportunity, isSimulation } = req.body;
      const result = await multiHopArbitrage.executeMultiHop(DEMO_USER_ID, opportunity, isSimulation);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // JIT Liquidity
  app.post("/api/jit/add-liquidity", async (req, res) => {
    try {
      const { jitLiquidityEngine } = await import('./jitLiquidity');
      const { poolAddress, amount0, amount1, currentTick } = req.body;
      const position = await jitLiquidityEngine.addJITLiquidity(
        DEMO_USER_ID,
        poolAddress,
        amount0,
        amount1,
        currentTick
      );
      res.json(position);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jit/swap", async (req, res) => {
    try {
      const { jitLiquidityEngine } = await import('./jitLiquidity');
      const { poolAddress, tokenIn, tokenOut, amountIn } = req.body;
      const result = await jitLiquidityEngine.executeSwapWithJIT(
        DEMO_USER_ID,
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // A/B Testing
  app.get("/api/ab-test/performance", async (req, res) => {
    try {
      const { strategyABTest } = await import('./strategyABTest');
      const report = strategyABTest.getPerformanceReport();
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ab-test/best-strategy", async (req, res) => {
    try {
      const { strategyABTest } = await import('./strategyABTest');
      const bestStrategy = await strategyABTest.getBestStrategy();
      res.json({ strategy: bestStrategy });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ab-test/start-auto-switch", async (req, res) => {
    try {
      const { strategyABTest } = await import('./strategyABTest');
      await strategyABTest.startAutomaticSwitching(DEMO_USER_ID);
      res.json({ success: true, message: "Auto-switching started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Execute Arbitrage Trade Manually
  // Allows manual execution of arbitrage trades based on identified opportunities, with simulation option.
  app.post("/api/arbitrage/execute", async (req, res) => {
    try {
      const { opportunityId } = req.body;

      if (!opportunityId) {
        return res.status(400).json({ error: "Missing opportunityId" });
      }

      // Find the opportunity
      const opportunities = opportunityScanner.getOpportunities();
      const opportunity = opportunities.find(o => o.id === opportunityId);

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: "Opportunity not found or expired"
        });
      }

      // Get bot config to check mode
      const config = await storage.getBotConfig(DEMO_USER_ID);
      const isSimulation = config?.useSimulation !== false;

      // Import tradeExecutor dynamically to avoid circular dependency
      const { tradeExecutor } = await import('./tradeExecutor');

      // Execute the trade
      const result = await tradeExecutor.executeArbitrageTrade(
        DEMO_USER_ID,
        opportunity,
        isSimulation
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error executing arbitrage trade:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to execute trade"
      });
    }
  });

  app.get("/api/scanner/status", async (req, res) => {
    try {
      const isRunning = opportunityScanner.isRunning();
      const opportunities = opportunityScanner.getOpportunities();
      res.json({
        isRunning,
        opportunityCount: opportunities.length,
        opportunities: opportunities.slice(0, 5), // Top 5
      });
    } catch (error: any) {
      console.error("Error getting scanner status:", error);
      res.status(500).json({ error: error.message || "Failed to get scanner status" });
    }
  });

  // Flash Loan Routes
  // Manages flash loan operations, including asset availability, fee calculation, and execution.
  app.get("/api/flashloan/assets", async (req, res) => {
    try {
      const assets = aaveFlashLoan.getAvailableAssets();
      res.json(assets);
    } catch (error) {
      console.error("Error getting flash loan assets:", error);
      res.status(500).json({ error: "Failed to get flash loan assets" });
    }
  });

  app.post("/api/flashloan/calculate-fee", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount) {
        return res.status(400).json({ error: "Missing amount parameter" });
      }

      const result = aaveFlashLoan.calculateFee(amount);
      res.json(result);
    } catch (error) {
      console.error("Error calculating flash loan fee:", error);
      res.status(500).json({ error: "Failed to calculate fee" });
    }
  });

  app.post("/api/flashloan/execute", async (req, res) => {
    try {
      // Validate flash loan execution parameters
      const flashLoanExecuteSchema = z.object({
        asset: z.string().min(1, "Asset address required"),
        amount: z.string().min(1, "Amount required"),
        receiverAddress: z.string().min(1, "Receiver address required"),
        params: z.string().optional(),
      });

      const validatedData = flashLoanExecuteSchema.parse(req.body);

      const result = await aaveFlashLoan.executeFlashLoan(DEMO_USER_ID, {
        asset: validatedData.asset,
        amount: validatedData.amount,
        receiverAddress: validatedData.receiverAddress,
        params: validatedData.params,
      });

      // Broadcast flash loan executed via WebSocket
      if (app.locals.wsBroadcast) {
        app.locals.wsBroadcast('flashloan_executed', {
          success: result.success,
          txHash: result.txHash,
          asset: validatedData.asset, // Use validatedData.asset here
          amount: validatedData.amount, // Use validatedData.amount here
          timestamp: new Date().toISOString(),
        });
      }

      // Send Telegram notification
      if (result.success && isTelegramEnabled()) {
        await sendTelegramMessage(
          DEMO_USER_ID,
          `🔥 <b>Flash Loan выполнен</b>\n\nАктив: ${validatedData.asset}\nСумма: ${result.loanAmount}\nКомиссия: ${result.fee}\nTX: ${result.txHash}`,
          'flashloan',
          { asset: validatedData.asset, amount: validatedData.amount, txHash: result.txHash }
        );
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error executing flash loan:", error);
      res.status(500).json({ error: "Failed to execute flash loan" });
    }
  });

  app.get("/api/flashloan/requests", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const requests = await storage.getFlashLoanRequests(DEMO_USER_ID, limit);
      res.json(requests);
    } catch (error) {
      console.error("Error getting flash loan requests:", error);
      res.status(500).json({ error: "Failed to get flash loan requests" });
    }
  });

  // ==================== RISK MANAGEMENT ROUTES ====================
  // Manages risk parameters, including limits, circuit breakers, and related events to ensure safe trading operations.

  // Get Risk Limits Tracking
  // Retrieves current risk limit settings and tracking data.
  app.get("/api/risk/tracking", async (req, res) => {
    try {
      const tracking = await storage.getRiskLimitsTracking(DEMO_USER_ID);
      res.json(tracking);
    } catch (error) {
      console.error("Error getting risk limits tracking:", error);
      res.status(500).json({ error: "Failed to get risk limits tracking" });
    }
  });

  // Update Risk Limits Tracking
  // Allows modification of risk limit settings and tracking parameters.
  app.post("/api/risk/tracking", async (req, res) => {
    try {
      const tracking = await storage.updateRiskLimitsTracking(DEMO_USER_ID, req.body);
      res.json(tracking);
    } catch (error) {
      console.error("Error updating risk limits tracking:", error);
      res.status(500).json({ error: "Failed to update risk limits tracking" });
    }
  });

  // Reset Daily Risk Limits
  // Resets daily risk limits, allowing for a fresh start of risk monitoring each day.
  app.post("/api/risk/tracking/reset", async (req, res) => {
    try {
      const tracking = await storage.resetDailyRiskLimits(DEMO_USER_ID);
      res.json(tracking);
    } catch (error) {
      console.error("Error resetting daily risk limits:", error);
      res.status(500).json({ error: "Failed to reset daily risk limits" });
    }
  });

  // Get Circuit Breaker Events
  // Retrieves circuit breaker events, which are triggered when predefined risk thresholds are breached.
  app.get("/api/risk/circuit-breaker-events", async (req, res) => {
    try {
      const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const events = await storage.getCircuitBreakerEvents(DEMO_USER_ID, resolved, limit);
      res.json(events);
    } catch (error) {
      console.error("Error getting circuit breaker events:", error);
      res.status(500).json({ error: "Failed to get circuit breaker events" });
    }
  });

  // Create Circuit Breaker Event
  // Manually creates a circuit breaker event, often used for logging or manual intervention.
  app.post("/api/risk/circuit-breaker-events", async (req, res) => {
    try {
      const event = await storage.createCircuitBreakerEvent(DEMO_USER_ID, req.body);
      res.json(event);
    } catch (error) {
      console.error("Error creating circuit breaker event:", error);
      res.status(500).json({ error: "Failed to create circuit breaker event" });
    }
  });

  // Resolve Circuit Breaker Event
  // Marks a circuit breaker event as resolved, often after the risk condition has been addressed.
  app.post("/api/risk/circuit-breaker-events/:id/resolve", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const { resolvedBy, notes } = req.body;
      const event = await storage.resolveCircuitBreakerEvent(DEMO_USER_ID, eventId, resolvedBy, notes);
      res.json(event);
    } catch (error) {
      console.error("Error resolving circuit breaker event:", error);
      res.status(500).json({ error: "Failed to resolve circuit breaker event" });
    }
  });

  // ==================== TOKEN WHITELIST ROUTES ====================
  // Manages a whitelist of tokens, controlling which tokens the bot is allowed to trade or interact with.

  // Get Token Whitelist
  // Retrieves the list of whitelisted tokens.
  app.get("/api/whitelist", async (req, res) => {
    try {
      const tokens = await storage.getTokenWhitelist(DEMO_USER_ID);
      res.json(tokens);
    } catch (error) {
      console.error("Error getting token whitelist:", error);
      res.status(500).json({ error: "Failed to get token whitelist" });
    }
  });

  // Add Token to Whitelist
  // Adds a new token to the whitelist.
  app.post("/api/whitelist", async (req, res) => {
    try {
      const token = await storage.addTokenToWhitelist(DEMO_USER_ID, req.body);
      res.json(token);
    } catch (error) {
      console.error("Error adding token to whitelist:", error);
      res.status(500).json({ error: "Failed to add token to whitelist" });
    }
  });

  // Remove Token from Whitelist
  // Removes a token from the whitelist.
  app.delete("/api/whitelist/:id", async (req, res) => {
    try {
      const tokenId = parseInt(req.params.id);
      await storage.removeTokenFromWhitelist(DEMO_USER_ID, tokenId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing token from whitelist:", error);
      res.status(500).json({ error: "Failed to remove token from whitelist" });
    }
  });

  // Update Token in Whitelist
  // Modifies details of an existing whitelisted token.
  app.put("/api/whitelist/:id", async (req, res) => {
    try {
      const tokenId = parseInt(req.params.id);
      const token = await storage.updateTokenWhitelist(DEMO_USER_ID, tokenId, req.body);
      res.json(token);
    } catch (error) {
      console.error("Error updating token in whitelist:", error);
      res.status(500).json({ error: "Failed to update token in whitelist" });
    }
  });

  // ==================== ALERT RULES ROUTES ====================
  // Manages alert rules, allowing users to define conditions that trigger notifications.

  // Wallet Balance Route
  app.get("/api/wallet/balance", async (req, res) => {
    try {
      const userId = req.session?.userId || DEMO_USER_ID; // Use session ID or default to demo user
      const config = await storage.getBotConfig(userId);

      if (!config) {
        return res.status(400).json({ error: "Bot configuration not found" });
      }

      // Use walletAddress from config, or derive from privateKey
      let walletAddress = config.walletAddress;

      if (!walletAddress && config.privateKey) {
        try {
          const wallet = new ethers.Wallet(config.privateKey);
          walletAddress = wallet.address;
        } catch (error) {
          console.error('Error deriving address from private key:', error);
        }
      }

      if (!walletAddress) {
        // Return mock balances if no wallet is configured
        return res.json({
          maticBalance: "0.0",
          usdcBalance: "0.00",
          wethBalance: "0.00" // Added WETH balance as per original mock
        });
      }

      const chainId = config.networkMode === 'mainnet' ? 137 : 80002;
      const rpcUrl = config.networkMode === 'mainnet'
        ? config.polygonRpcUrl
        : config.polygonTestnetRpcUrl;

      if (!rpcUrl) {
        return res.json({
          maticBalance: "0.0",
          usdcBalance: "0.00",
          wethBalance: "0.00"
        });
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Get MATIC balance
      const maticBalance = await provider.getBalance(walletAddress);
      const maticFormatted = ethers.formatEther(maticBalance);

      // Get USDC balance
      const usdcAddress = config.networkMode === 'mainnet'
        ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Polygon mainnet USDC
        : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'; // Amoy testnet USDC
      const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
      const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
      const usdcBalance = await usdcContract.balanceOf(walletAddress);
      const usdcFormatted = ethers.formatUnits(usdcBalance, 6);

      // Get WETH balance
      const wethAddress = config.networkMode === 'mainnet'
        ? '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' // Polygon mainnet WETH
        : '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9'; // Amoy testnet WETH

      let wethFormatted = '0.00';
      try {
        const wethContract = new ethers.Contract(wethAddress, usdcAbi, provider);
        const wethBalance = await wethContract.balanceOf(walletAddress);
        wethFormatted = ethers.formatUnits(wethBalance, 18); // WETH has 18 decimals
      } catch (error) {
        console.error('Error fetching WETH balance:', error);
      }

      res.json({
        maticBalance: maticFormatted,
        usdcBalance: usdcFormatted,
        wethBalance: wethFormatted
      });
    } catch (error: any) {
      console.error("Error getting wallet balance:", error);
      res.json({
        maticBalance: "0.0",
        usdcBalance: "0.00",
        wethBalance: "0.00"
      });
    }
  });

  // Get Alert Rules
  // Retrieves all configured alert rules.
  app.get("/api/alerts", async (req, res) => {
    try {
      const rules = await storage.getAlertRules(DEMO_USER_ID);
      res.json(rules);
    } catch (error) {
      console.error("Error getting alert rules:", error);
      res.status(500).json({ error: "Failed to get alert rules" });
    }
  });

  // Create Alert Rule
  // Creates a new alert rule based on provided parameters.
  app.post("/api/alerts", async (req, res) => {
    try {
      const rule = await storage.createAlertRule(DEMO_USER_ID, req.body);
      res.json(rule);
    } catch (error) {
      console.error("Error creating alert rule:", error);
      res.status(500).json({ error: "Failed to create alert rule" });
    }
  });

  // Update Alert Rule
  // Modifies an existing alert rule.
  app.put("/api/alerts/:id", async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const rule = await storage.updateAlertRule(DEMO_USER_ID, ruleId, req.body);
      res.json(rule);
    } catch (error) {
      console.error("Error updating alert rule:", error);
      res.status(500).json({ error: "Failed to update alert rule" });
    }
  });

  // Delete Alert Rule
  // Removes an alert rule.
  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      await storage.deleteAlertRule(DEMO_USER_ID, ruleId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert rule:", error);
      res.status(500).json({ error: "Failed to delete alert rule" });
    }
  });

  // ==================== WEBHOOK ROUTES ====================
  // Manages webhook configurations, enabling external services to receive real-time updates from the bot.

  // Get Webhook Configs
  // Retrieves all configured webhooks.
  app.get("/api/webhooks", async (req, res) => {
    try {
      const configs = await storage.getWebhookConfigs(DEMO_USER_ID);
      res.json(configs);
    } catch (error) {
      console.error("Error getting webhook configs:", error);
      res.status(500).json({ error: "Failed to get webhook configs" });
    }
  });

  // Create Webhook Config
  // Creates a new webhook configuration.
  app.post("/api/webhooks", async (req, res) => {
    try {
      const config = await storage.createWebhookConfig(DEMO_USER_ID, req.body);
      res.json(config);
    } catch (error) {
      console.error("Error creating webhook config:", error);
      res.status(500).json({ error: "Failed to create webhook config" });
    }
  });

  // Update Webhook Config
  // Modifies an existing webhook configuration.
  app.put("/api/webhooks/:id", async (req, res) => {
    try {
      const configId = parseInt(req.params.id);
      const config = await storage.updateWebhookConfig(DEMO_USER_ID, configId, req.body);
      res.json(config);
    } catch (error) {
      console.error("Error updating webhook config:", error);
      res.status(500).json({ error: "Failed to update webhook config" });
    }
  });

  // Delete Webhook Config
  // Removes a webhook configuration.
  app.delete("/api/webhooks/:id", async (req, res) => {
    try {
      const configId = parseInt(req.params.id);
      await storage.deleteWebhookConfig(DEMO_USER_ID, configId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting webhook config:", error);
      res.status(500).json({ error: "Failed to delete webhook config" });
    }
  });

  // Test Webhook
  // Sends a test payload to a configured webhook to verify connectivity and configuration.
  app.post("/api/webhooks/:id/test", async (req, res) => {
    try {
      const configId = parseInt(req.params.id);
      const configs = await storage.getWebhookConfigs(DEMO_USER_ID);
      const config = configs.find(c => c.id === configId);

      if (!config) {
        return res.status(404).json({ error: "Webhook config not found" });
      }

      // Send test webhook
      const axios = require('axios');
      const testPayload = {
        event: "test",
        message: "Test webhook from Flash Loan Arbitrage Bot",
        timestamp: new Date().toISOString(),
        userId: DEMO_USER_ID
      };

      const startTime = Date.now();
      try {
        const response = await axios.post(config.url, testPayload, {
          headers: config.headers ? JSON.parse(config.headers as any) : {},
          timeout: 10000
        });
        const responseTime = Date.now() - startTime;

        // Log the test
        await storage.createWebhookLog(DEMO_USER_ID, {
          webhookConfigId: configId,
          eventType: "test",
          url: config.url,
          method: "POST",
          requestBody: testPayload,
          requestHeaders: config.headers ? JSON.parse(config.headers as any) : {},
          statusCode: response.status,
          responseBody: JSON.stringify(response.data).substring(0, 1000),
          responseTime,
          success: true,
          retryAttempt: 0
        });

        // Update webhook stats
        await storage.updateWebhookConfig(DEMO_USER_ID, configId, {
          totalCalls: (config.totalCalls || 0) + 1,
          successfulCalls: (config.successfulCalls || 0) + 1,
          lastCalledAt: new Date(),
          lastSuccessAt: new Date()
        });

        res.json({
          success: true,
          statusCode: response.status,
          responseTime,
          response: response.data
        });
      } catch (error: any) {
        const responseTime = Date.now() - startTime;

        // Log the failed test
        await storage.createWebhookLog(DEMO_USER_ID, {
          webhookConfigId: configId,
          eventType: "test",
          url: config.url,
          method: "POST",
          requestBody: testPayload,
          statusCode: error.response?.status,
          responseTime,
          success: false,
          error: error.message,
          retryAttempt: 0
        });

        // Update webhook stats
        await storage.updateWebhookConfig(DEMO_USER_ID, configId, {
          totalCalls: (config.totalCalls || 0) + 1,
          failedCalls: (config.failedCalls || 0) + 1,
          lastCalledAt: new Date(),
          lastErrorAt: new Date(),
          lastError: error.message
        });

        res.status(500).json({
          success: false,
          error: error.message,
          responseTime
        });
      }
    } catch (error) {
      console.error("Error testing webhook:", error);
      res.status(500).json({ error: "Failed to test webhook" });
    }
  });

  // Get Webhook Logs
  // Retrieves logs for webhook events, useful for troubleshooting delivery issues.
  app.get("/api/webhooks/logs", async (req, res) => {
    try {
      const webhookConfigId = req.query.webhookConfigId ? parseInt(req.query.webhookConfigId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getWebhookLogs(DEMO_USER_ID, webhookConfigId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error getting webhook logs:", error);
      res.status(500).json({ error: "Failed to get webhook logs" });
    }
  });

  // ==================== PERFORMANCE ANALYTICS ROUTES ====================
  // Collects and provides performance metrics for the bot, aiding in performance analysis and optimization.

  // Get Performance Metrics
  // Retrieves historical performance data, potentially filtered by a specified period.
  app.get("/api/analytics/performance", async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const metrics = await storage.getPerformanceMetrics(DEMO_USER_ID, period);
      res.json(metrics);
    } catch (error) {
      console.error("Error getting performance metrics:", error);
      res.status(500).json({ error: "Failed to get performance metrics" });
    }
  });

  // Create Performance Metric
  // Records a new performance metric data point.
  app.post("/api/analytics/performance", async (req, res) => {
    try {
      const metric = await storage.createPerformanceMetric(DEMO_USER_ID, req.body);
      res.json(metric);
    } catch (error) {
      console.error("Error creating performance metric:", error);
      res.status(500).json({ error: "Failed to create performance metric" });
    }
  });

  // Config Management Routes
  // Provides access to and validation of the bot's configuration files.
  app.get("/api/config/risk", async (req, res) => {
    try {
      const { configLoader } = await import('./configLoader');
      const config = configLoader.getConfig();
      const validation = configLoader.validateConfig();
      res.json({ config, validation });
    } catch (error) {
      console.error("Error getting risk config:", error);
      res.status(500).json({ error: "Failed to get risk config" });
    }
  });

  // Emergency Stop Routes
  // Allows for an immediate shutdown of the bot in critical situations via an emergency stop command.
  app.post("/api/emergency/stop", async (req, res) => {
    try {
      const { reason } = req.body;
      const { killSwitch } = await import('./killSwitch');

      const result = await killSwitch.emergencyStop(
        DEMO_USER_ID,
        reason || 'Manual emergency stop from UI'
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error during emergency stop:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Strategy Management Routes
  // Manage Live Strategy Orchestrator settings and mode
  app.get("/api/strategy/status", async (_req, res) => {
    try {
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      const state = orchestrator.getState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Assistant Auto-Fix Error Detection
  app.post("/api/ai/auto-detect-errors", async (req, res) => {
    try {
      const { aiAssistant } = await import('./aiAssistant');
      const assistant = new aiAssistant.AIAssistant();

      // Get recent error logs
      const errorLogs = await storage.getActivityLogs(DEMO_USER_ID, 50);
      const errors = errorLogs.filter(log => log.level === 'error');

      if (errors.length === 0) {
        return res.json({
          success: true,
          message: 'No errors detected',
          errors: []
        });
      }

      // Extract file paths from errors
      const filesToFix: string[] = [];
      for (const error of errors) {
        if (error.metadata?.file) {
          filesToFix.push(error.metadata.file);
        }
      }

      // Auto-fix detected files
      const fixResults = [];
      for (const file of [...new Set(filesToFix)]) {
        try {
          const fixedContent = await assistant.autoFix(file);
          fixResults.push({
            file,
            success: true,
            message: 'Auto-fixed'
          });
        } catch (error: any) {
          fixResults.push({
            file,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        errorsDetected: errors.length,
        filesFixed: fixResults.filter(r => r.success).length,
        results: fixResults
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategy/start", async (_req, res) => {
    try {
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      await orchestrator.start();

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'strategy_control',
        level: 'success',
        message: '🚀 Live Strategy Orchestrator запущен',
        metadata: { action: 'start' }
      });

      res.json({ success: true, message: 'Strategy started' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategy/stop", async (_req, res) => {
    try {
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      await orchestrator.stop();

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'strategy_control',
        level: 'info',
        message: '🛑 Live Strategy Orchestrator остановлен',
        metadata: { action: 'stop' }
      });

      res.json({ success: true, message: 'Strategy stopped' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategy/mode", async (req, res) => {
    try {
      const { mode } = req.body;

      if (!['flashloan', 'direct_swap', 'hybrid'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode. Must be: flashloan, direct_swap, or hybrid' });
      }

      const { orchestrator } = await import('./liveStrategyOrchestrator');
      await orchestrator.updateMode(mode);

      res.json({ success: true, mode });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategy/optimize", async (_req, res) => {
    try {
      const { strategyOptimizer } = await import('./strategyOptimizer');
      await strategyOptimizer.optimizeParameters(DEMO_USER_ID);

      res.json({
        success: true,
        message: 'Strategy parameters optimized based on historical performance'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve Management Routes
  // Manages token approval caches, allowing for selective cache resets.
  app.post("/api/approve/reset-cache", async (req, res) => {
    try {
      const { chainId } = req.body;
      const { approveManager } = await import('./approveManager');

      approveManager.resetCache(chainId);

      res.json({
        success: true,
        message: chainId ? `Cache reset for chain ${chainId}` : 'All cache reset'
      });
    } catch (error: any) {
      console.error("Error resetting approve cache:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Gas Price Check Route
  // Checks the current gas price against acceptable limits and provides estimated transaction costs.
  app.get("/api/gas/current", async (req, res) => {
    try {
      const config = await storage.getBotConfig(DEMO_USER_ID);
      const chainId = config?.networkMode === 'mainnet' ? 137 : 80002;

      const { gasManager } = await import('./gasManager');
      const provider = web3Provider.getProvider(chainId);

      const isAcceptable = await gasManager.isGasPriceAcceptable(provider);
      const gasData = await web3Provider.getGasPrice(chainId);

      res.json({
        currentGasGwei: gasData.gasPriceGwei,
        maxGasGwei: process.env.MAX_GAS_PRICE_GWEI || '60',
        isAcceptable,
        estimatedCostUsd: parseFloat(gasData.gasPriceGwei) * 0.000021 * parseFloat(process.env.MATIC_PRICE_USD || '0.7'),
      });
    } catch (error: any) {
      console.error("Error getting gas price:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reload configuration
  // Reloads the bot's configuration dynamically without requiring a restart.
  app.post("/api/config/reload", async (req, res) => {
    try {
      const { configLoader } = await import('./configLoader');
      configLoader.reloadConfig();
      const config = configLoader.getConfig();
      res.json({ success: true, config });
    } catch (error) {
      console.error("Error reloading config:", error);
      res.status(500).json({ error: "Failed to reload config" });
    }
  });

  // Token Validation Route
  // Validates token addresses on the blockchain, ensuring they are legitimate and active.
  app.post("/api/token/validate", async (req, res) => {
    try {
      const { tokenAddress, chainId } = req.body;

      if (!tokenAddress) {
        return res.status(400).json({ error: "Missing tokenAddress parameter" });
      }

      const config = await storage.getBotConfig(DEMO_USER_ID);
      const provider = web3Provider.getProvider(chainId || (config?.networkMode === 'mainnet' ? 137 : 80002));

      const { tokenValidator } = await import('./tokenValidator');
      const result = await tokenValidator.validateToken(DEMO_USER_ID, tokenAddress, provider);

      res.json(result);
    } catch (error: any) {
      console.error("Error validating token:", error);
      res.status(500).json({ error: error.message || "Failed to validate token" });
    }
  });

  // RPC Failover Status Route
  // Checks the health status of RPC endpoints and monitors failover mechanisms.
  app.get("/api/rpc/failover-status", async (req, res) => {
    try {
      const { rpcFailoverManager } = await import('./rpcFailover');
      const status = rpcFailoverManager.getHealthStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Error getting RPC failover status:", error);
      res.status(500).json({ error: error.message || "Failed to get failover status" });
    }
  });

  // Retry Queue Status Route
  // Provides status information about the retry queue, essential for managing failed or delayed operations.
  app.get("/api/retry-queue/status", async (req, res) => {
    try {
      const { retryQueueManager } = await import('./retryQueue');
      const status = retryQueueManager.getQueueStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Error getting retry queue status:", error);
      res.status(500).json({ error: error.message || "Failed to get queue status" });
    }
  });

  // Drawdown Status Route
  // Retrieves drawdown status, likely related to risk management and tracking potential losses.
  app.get("/api/drawdown/status", async (req, res) => {
    try {
      const tracking = await storage.getRiskLimitsTracking(DEMO_USER_ID);
      res.json(tracking);
    } catch (error: any) {
      console.error("Error getting drawdown status:", error);
      res.status(500).json({ error: error.message || "Failed to get drawdown status" });
    }
  });

  // Trade Logs Routes
  // Accesses trade logs for profit and loss (PnL) calculations and allows downloading trade history data.
  app.get("/api/logs/trades/pnl", async (req, res) => {
    try {
      const { tradeLogger } = await import('./tradeLogger');
      const pnl = tradeLogger.calculateTotalPnL();
      res.json(pnl);
    } catch (error) {
      console.error("Error calculating PnL:", error);
      res.status(500).json({ error: "Failed to calculate PnL" });
    }
  });

  app.get("/api/logs/trades/download", async (req, res) => {
    try {
      const { tradeLogger } = await import('./tradeLogger');
      const filePath = tradeLogger.getLogFilePath();
      res.download(filePath, `trades_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
      console.error("Error downloading trade logs:", error);
      res.status(500).json({ error: "Failed to download trade logs" });
    }
  });

  // Helper function to get wallet info from config
  async function getWalletInfo() {
    const config = await storage.getBotConfig(DEMO_USER_ID);
    if (!config?.privateKey) {
      throw new Error('Private key не настроен в конфигурации');
    }

    const rpcUrl = config.networkMode === 'mainnet'
      ? config.polygonRpcUrl
      : config.polygonTestnetRpcUrl;

    if (!rpcUrl) {
      throw new Error('RPC URL не настроен');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    return {
      address: wallet.address,
      provider,
      wallet
    };
  }

  // Contract Authorization routes
  // Manages authorization for smart contracts, checking and setting authorization status.
  app.get("/api/contract/authorization-status", async (req, res) => {
    try {
      const config = await storage.getBotConfig(DEMO_USER_ID);

      if (!config?.privateKey) {
        return res.status(400).json({
          error: "Private key не настроен в конфигурации",
          executorAddress: null,
          isAuthorized: false,
          isOwner: false
        });
      }

      if (!config?.flashLoanContract || config.flashLoanContract === '0x0000000000000000000000000000000000000000') {
        return res.status(400).json({
          error: "Контракт ArbitrageExecutor не развернут",
          executorAddress: null,
          isAuthorized: false,
          isOwner: false
        });
      }

      const chainId = config.networkMode === 'mainnet' ? 137 : 80002;
      const wallet = new ethers.Wallet(config.privateKey);
      const executorAddress = wallet.address;

      const status = await checkExecutorStatus(
        config.flashLoanContract,
        executorAddress,
        chainId
      );

      res.json({
        executorAddress,
        contractAddress: config.flashLoanContract,
        chainId,
        ...status
      });
    } catch (error: any) {
      console.error("Failed to check authorization status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contract/authorize-executor", async (req, res) => {
    try {
      const walletInfo = await getWalletInfo();
      const result = await authorizeExecutor(walletInfo.address);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Failed to authorize executor:", error);
      res.status(500).json({
        success: false,
        message: error.message,
        error: 'UNKNOWN_ERROR'
      });
    }
  });

  // Health check endpoint
  // Provides a basic health status of the application, useful for monitoring and load balancing.
  app.get('/health', async (req, res) => {
    try {
      const { healthCheckService } = await import('./healthCheck');
      const health = await healthCheckService.getHealthStatus();

      const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 503 : 500;
      res.status(statusCode).json(health);
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        blockNumber: 0,
        pendingTx: 0,

        circuitBreaker: true,
        timestamp: new Date().toISOString(),
        rpcHealthy: false,
        error: error.message,
      });
    }
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      const { prometheusExporter } = await import('./prometheusExporter');
      const metrics = await prometheusExporter.exportMetrics(DEMO_USER_ID);
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics);
    } catch (error: any) {
      console.error('Error exporting metrics:', error);
      res.status(500).send('# Error exporting metrics\n');
    }
  });

  // Cross-Chain Arbitrage Routes
  app.get("/api/cross-chain/opportunities", async (req, res) => {
    try {
      const { crossChainArbitrage } = await import('./crossChainArbitrage');
      const opportunities = await crossChainArbitrage.scanCrossChainOpportunities(DEMO_USER_ID);
      res.json(opportunities);
    } catch (error: any) {
      console.error("Error finding cross-chain opportunities:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cross-chain/start", async (req, res) => {
    try {
      const { crossChainArbitrage } = await import('./crossChainArbitrage');
      await crossChainArbitrage.startScanning(DEMO_USER_ID, 60000); // 60 sec interval
      res.json({ success: true, message: "Cross-chain scanner started" });
    } catch (error: any) {
      console.error("Error starting cross-chain scanner:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cross-chain/stop", async (req, res) => {
    try {
      const { crossChainArbitrage } = await import('./crossChainArbitrage');
      crossChainArbitrage.stopScanning();
      res.json({ success: true, message: "Cross-chain scanner stopped" });
    } catch (error: any) {
      console.error("Error stopping cross-chain scanner:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Triangular Arbitrage Routes
  app.get("/api/triangular/opportunities", async (req, res) => {
    try {
      const { triangularArbitrage } = await import('./triangularArbitrage');
      const opportunities = await triangularArbitrage.findTriangularOpportunities(DEMO_USER_ID);
      res.json(opportunities);
    } catch (error: any) {
      console.error("Error finding triangular opportunities:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/triangular/execute", async (req, res) => {
    try {
      const { path } = req.body;
      if (!path) {
        return res.status(400).json({ error: "Missing path parameter" });
      }

      const config = await storage.getBotConfig(DEMO_USER_ID);
      const isSimulation = config?.useSimulation !== false;

      const { triangularArbitrage } = await import('./triangularArbitrage');
      const result = await triangularArbitrage.executeTriangularArbitrage(
        DEMO_USER_ID,
        path,
        isSimulation
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error executing triangular arbitrage:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Web3 & Trading Routes
  // Provides status on Web3 connectivity, balance, gas prices, and DEX quote retrieval.
  app.get("/api/web3/status", async (req, res) => {
    try {
      const { currentProvider } = await import('./web3Provider');

      const balance = currentProvider.hasWallet()
        ? await currentProvider.getBalance()
        : BigInt(0);

      const gasPrice = await currentProvider.getGasPrice();
      const blockNumber = await currentProvider.getBlockNumber();

      res.json({
        connected: currentProvider.isConnected(),
        hasWallet: currentProvider.hasWallet(),
        network: currentProvider.getNetworkName(),
        chainId: currentProvider.getChainId(),
        balance: balance.toString(),
        gasPrice: gasPrice.toString(),
        blockNumber
      });
    } catch (error: any) {
      console.error("Error getting Web3 status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/dex/quote", async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn } = req.query;

      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const { dexSwapEngine } = await import('./dexSwapEngine');

      const quote = await dexSwapEngine.getQuote({
        tokenIn: tokenIn as string,
        tokenOut: tokenOut as string,
        amountIn: BigInt(amountIn as string),
        slippageTolerance: 0.5
      });

      res.json({
        amountOut: quote.amountOut.toString(),
        path: quote.path,
        priceImpact: quote.priceImpact,
        estimatedGas: quote.estimatedGas.toString()
      });
    } catch (error: any) {
      console.error("Error getting DEX quote:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/arbitrage/opportunities", async (req, res) => {
    try {
      const { arbitrageMonitor } = await import('./arbitrageMonitor');

      const opportunities = arbitrageMonitor.getOpportunities();

      res.json(opportunities.map(opp => ({
        ...opp,
        buyPrice: opp.buyPrice.toString(),
        sellPrice: opp.sellPrice.toString(),
        estimatedProfit: opp.estimatedProfit.toString(),
        estimatedGas: opp.estimatedGas.toString(),
        netProfit: opp.netProfit.toString()
      })));
    } catch (error: any) {
      console.error("Error getting arbitrage opportunities:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/arbitrage/start-monitor", async (req, res) => {
    try {
      const { arbitrageMonitor } = await import('./arbitrageMonitor');

      if (arbitrageMonitor.isRunning()) {
        return res.json({ message: "Monitor already running" });
      }

      await arbitrageMonitor.start();

      res.json({ success: true, message: "Arbitrage monitor started" });
    } catch (error: any) {
      console.error("Error starting arbitrage monitor:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/arbitrage/stop-monitor", async (req, res) => {
    try {
      const { arbitrageMonitor } = await import('./arbitrageMonitor');
      arbitrageMonitor.stop();

      res.json({ success: true, message: "Arbitrage monitor stopped" });
    } catch (error: any) {
      console.error("Error stopping arbitrage monitor:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Assistant Routes with rate limiting and validation
  // Provides AI-powered code analysis, auto-fixing, gas optimization, and project-wide insights. Includes rate limiting to manage usage.
  const aiRateLimiter = new Map<string, { count: number; resetTime: number }>();
  const AI_RATE_LIMIT = 20; // requests per minute
  const AI_RATE_WINDOW = 60000; // 1 minute

  function checkAIRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = aiRateLimiter.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      aiRateLimiter.set(userId, { count: 1, resetTime: now + AI_RATE_WINDOW });
      return true;
    }

    if (userLimit.count >= AI_RATE_LIMIT) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  // Get AI rate limits
  // Returns the current rate limit status for AI features.
  app.get("/api/ai/limits", async (req, res) => {
    try {
      const now = Date.now();
      const userLimit = aiRateLimiter.get(DEMO_USER_ID);

      if (!userLimit || now > userLimit.resetTime) {
        res.json({
          current: 0,
          max: AI_RATE_LIMIT,
          resetAt: new Date(now + AI_RATE_WINDOW).toISOString(),
          percentage: 0
        });
      } else {
        res.json({
          current: userLimit.count,
          max: AI_RATE_LIMIT,
          resetAt: new Date(userLimit.resetTime).toISOString(),
          percentage: Math.round((userLimit.count / AI_RATE_LIMIT) * 100)
        });
      }
    } catch (error: any) {
      console.error("Error getting AI limits:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/analyze-file", async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');
    let tempPath: string | null = null;

    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Превышен лимит запросов. Попробуйте через минуту.",
          retryAfter: 60,
          suggestion: "AI временно недоступен. Подождите 60 секунд."
        });
      }

      const { filename, content } = req.body;

      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({
          error: "Отсутствует имя файла",
          suggestion: "Укажите имя анализируемого файла"
        });
      }

      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          error: "Отсутствует содержимое файла",
          suggestion: "Вставьте код для анализа"
        });
      }

      // Validate content
      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        return res.status(400).json({
          error: "Файл пустой",
          suggestion: "Вставьте код для анализа"
        });
      }

      // Validate content size (max 2MB)
      if (content.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: "Файл слишком большой. Максимум 2MB" });
      }

      // Validate filename
      const allowedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.sol', '.json', '.md', '.txt', '.css', '.html'];
      const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';

      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({
          error: `Неподдерживаемый тип файла. Разрешены: ${allowedExtensions.join(', ')}`
        });
      }

      // Sanitize filename
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      tempPath = path.join('/tmp', `ai_analysis_${Date.now()}_${sanitizedFilename}`);

      console.log(`📝 AI Analysis: analyzing ${filename} (${content.length} bytes, ${trimmedContent.split('\n').length} lines)`);

      const { aiAssistant } = await import('./aiAssistant');

      // Write file
      fs.writeFileSync(tempPath, content, 'utf-8');

      // Analyze with enhanced context
      const analysis = await aiAssistant.analyzeCode(tempPath, filename);

      console.log(`✅ AI Analysis complete: ${analysis.issues.length} issues, complexity ${analysis.metrics.complexity}`);

      // Log activity
      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_analysis',
        level: 'info',
        message: `AI проанализировал ${filename}: ${analysis.issues.length} проблем`,
        metadata: {
          filename,
          issuesFound: analysis.issues.length,
          complexity: analysis.metrics.complexity,
          linesOfCode: analysis.metrics.linesOfCode
        },
      });

      res.json(analysis);
    } catch (error: any) {
      console.error("❌ Error analyzing file:", error);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_analysis',
        level: 'error',
        message: `Ошибка AI анализа: ${error.message}`,
        metadata: {
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
      });

      res.status(500).json({
        error: `Ошибка анализа: ${error.message}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      // Always cleanup temp file
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.error('Failed to cleanup temp file:', e);
        }
      }
    }
  });

  app.post("/api/ai/analyze-zip", async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');
    let tempDir: string | null = null;

    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Превышен лимит запросов",
          retryAfter: 60
        });
      }

      const { zipData } = req.body;

      if (!zipData || typeof zipData !== 'string') {
        return res.status(400).json({ error: "Отсутствуют данные ZIP архива" });
      }

      tempDir = path.join('/tmp', `ai_zip_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      console.log(`📦 Extracting ZIP to ${tempDir}`);

      // Decode base64 and extract
      try {
        const buffer = Buffer.from(zipData, 'base64');
        const zip = new AdmZip(buffer);
        zip.extractAllTo(tempDir, true);
      } catch (zipError: any) {
        throw new Error(`Ошибка распаковки ZIP: ${zipError.message}`);
      }

      const { aiAssistant } = await import('./aiAssistant');

      // Analyze project
      const projectAnalysis = await aiAssistant.analyzeProject(tempDir);

      console.log(`✅ ZIP Analysis complete: ${projectAnalysis.totalFiles} files, ${projectAnalysis.totalIssues} issues`);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_analysis',
        level: 'info',
        message: `AI проанализировал ZIP: ${projectAnalysis.totalFiles} файлов`,
        metadata: JSON.parse(JSON.stringify(projectAnalysis)),
      });

      res.json(projectAnalysis);
    } catch (error: any) {
      console.error("❌ Error analyzing ZIP:", error);

      // Return proper error message
      res.status(500).json({
        error: error.message || 'Ошибка анализа ZIP',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      // Cleanup
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
          console.error('Failed to cleanup temp dir:', e);
        }
      }
    }
  });

  app.post("/api/ai/auto-fix", async (req, res) => {
    const fs = await import('fs');
    let tempPath: string | null = null;

    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Превышен лимит запросов. Попробуйте через минуту.",
          retryAfter: 60
        });
      }

      const { filename, content } = req.body;

      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: "Отсутствует имя файла" });
      }

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Отсутствует содержимое файла" });
      }

      if (content.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: "Файл слишком большой. Максимум 2MB" });
      }

      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      tempPath = `/tmp/ai_fix_${Date.now()}_${sanitizedFilename}`;

      console.log(`🔧 AI Auto-fix: processing ${filename}`);

      const { aiAssistant } = await import('./aiAssistant');

      fs.writeFileSync(tempPath, content, 'utf-8');
      const fixedContent = await aiAssistant.autoFix(tempPath);

      console.log(`✅ AI Auto-fix complete`);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_autofix',
        level: 'success',
        message: `AI исправил файл: ${filename}`,
        metadata: {
          filename,
          originalSize: content.length,
          fixedSize: fixedContent.length
        },
      });

      res.json({ fixedContent });
    } catch (error: any) {
      console.error("❌ Error auto-fixing file:", error);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_autofix',
        level: 'error',
        message: `Ошибка автоисправления: ${error.message}`,
        metadata: { error: error.message },
      });

      res.status(500).json({
        error: `Ошибка автоисправления: ${error.message}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.error('Failed to cleanup temp file:', e);
        }
      }
    }
  });

  app.post("/api/ai/optimize-gas", async (req, res) => {
    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Rate limit exceeded. Please try again in a minute.",
          retryAfter: 60
        });
      }

      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: "Missing content" });
      }

      if (content.length > 1024 * 1024) {
        return res.status(400).json({ error: "File too large. Maximum size is 1MB" });
      }

      const tempPath = `/tmp/${Date.now()}_contract.sol`;
      const fs = await import('fs');
      const { aiAssistant } = await import('./aiAssistant');

      try {
        fs.writeFileSync(tempPath, content, 'utf-8');
        const suggestions = await aiAssistant.optimizeGas(tempPath);

        await storage.createActivityLog(DEMO_USER_ID, {
          type: 'ai_gas_optimization',
          level: 'info',
          message: `AI gas optimization completed`,
          metadata: { suggestionsCount: suggestions.length },
        });

        res.json({ suggestions });
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    } catch (error: any) {
      console.error("Error optimizing gas:", error);
      res.status(500).json({ error: error.message || "Gas optimization failed" });
    }
  });

  app.get("/api/ai/project-analysis", async (req, res) => {
    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Rate limit exceeded. Please try again in a minute.",
          retryAfter: 60
        });
      }

      const { aiAssistant } = await import('./aiAssistant');

      // Полный анализ проекта
      const projectAnalysis = await aiAssistant.analyzeProject('.');

      res.json({
        ...projectAnalysis,
        cacheSize: aiAssistant.getCacheSize(),
        timestamp: new Date().toISOString(),
        status: 'success'
      });
    } catch (error: any) {
      console.error("Error analyzing project:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/clear-cache", async (req, res) => {
    try {
      const { aiAssistant } = await import('./aiAssistant');
      aiAssistant.clearCache();

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_cache',
        level: 'info',
        message: 'AI analysis cache cleared',
        metadata: {},
      });

      res.json({ success: true, message: 'Cache cleared' });
    } catch (error: any) {
      console.error("Error clearing AI cache:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Edit file with AI suggestions
  // Allows AI to edit a specific file based on provided instructions.
  app.post("/api/ai/edit-file", async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');

    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Превышен лимит запросов",
          retryAfter: 60
        });
      }

      const { filepath, instruction } = req.body;

      if (!filepath) {
        return res.status(400).json({ error: "Отсутствует путь к файлу" });
      }

      if (!instruction) {
        return res.status(400).json({ error: "Отсутствует инструкция для редактирования" });
      }

      // Security: prevent path traversal
      const safePath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');

      if (!fs.existsSync(safePath)) {
        return res.status(404).json({ error: "Файл не найден" });
      }

      console.log(`✏️ AI Edit: ${safePath} with instruction: ${instruction}`);

      const { aiAssistant } = await import('./aiAssistant');
      const result = await aiAssistant.editFile(safePath, instruction);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_edit',
        level: 'success',
        message: `AI отредактировал ${path.basename(safePath)}`,
        metadata: { filepath: safePath, instruction },
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error editing file:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Apply AI edits to multiple files
  // Applies a batch of AI-generated edits to multiple files simultaneously.
  app.post("/api/ai/apply-edits", async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');

    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Превышен лимит запросов",
          retryAfter: 60
        });
      }

      const { edits } = req.body; // Array of { filepath, newContent }

      if (!Array.isArray(edits)) {
        return res.status(400).json({ error: "Неверный формат данных" });
      }

      const results = [];

      for (const edit of edits) {
        try {
          const safePath = path.normalize(edit.filepath).replace(/^(\.\.(\/|\\|$))+/, '');

          // Backup original
          const backupPath = `${safePath}.backup`;
          if (fs.existsSync(safePath)) {
            fs.copyFileSync(safePath, backupPath);
          }

          // Apply edit
          fs.writeFileSync(safePath, edit.newContent, 'utf-8');

          results.push({
            filepath: safePath,
            status: 'success',
            message: 'Файл успешно обновлен'
          });

          console.log(`✅ Applied edit to ${safePath}`);
        } catch (error: any) {
          results.push({
            filepath: edit.filepath,
            status: 'error',
            message: error.message
          });
        }
      }

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_bulk_edit',
        level: 'info',
        message: `AI применил изменения к ${results.filter(r => r.status === 'success').length} файлам`,
        metadata: { totalEdits: edits.length, successful: results.filter(r => r.status === 'success').length },
      });

      res.json({ results });
    } catch (error: any) {
      console.error("Error applying edits:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Read project structure
  // Fetches the project's directory structure, useful for AI analysis and navigation.
  app.get("/api/ai/project-tree", async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');

    try {
      const { aiAssistant } = await import('./aiAssistant');
      const tree = await aiAssistant.getProjectTree('.');
      res.json(tree);
    } catch (error: any) {
      console.error("Error reading project tree:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Read file content
  // Retrieves the content of a specified file, typically for AI analysis or display.
  app.post("/api/ai/read-file", async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');

    try {
      const { filepath } = req.body;

      if (!filepath) {
        return res.status(400).json({ error: "Отсутствует путь к файлу" });
      }

      const safePath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');

      if (!fs.existsSync(safePath)) {
        return res.status(404).json({ error: "Файл не найден" });
      }

      const content = fs.readFileSync(safePath, 'utf-8');
      const stats = fs.statSync(safePath);

      res.json({
        filepath: safePath,
        content,
        size: stats.size,
        modified: stats.mtime
      });
    } catch (error: any) {
      console.error("Error reading file:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/fix-project", async (req, res) => {
    try {
      const { aiAssistant } = await import('./aiAssistant');
      const fs = await import('fs');
      const { files } = req.body;

      const results = [];
      for (const filePath of files || []) {
        if (fs.existsSync(filePath)) {
          const fixedContent = await aiAssistant.autoFix(filePath);
          results.push({ file: filePath, status: 'fixed' });
        }
      }

      res.json({ results, status: 'success' });
    } catch (error: any) {
      console.error("Error fixing project:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-apply AI changes with prompt
  // Applies AI-generated changes across relevant project files based on a natural language prompt.
  app.post("/api/ai/auto-apply-prompt", async (req, res) => {
    try {
      if (!checkAIRateLimit(DEMO_USER_ID)) {
        return res.status(429).json({
          error: "Превышен лимит запросов",
          retryAfter: 60
        });
      }

      const { prompt } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: "Отсутствует промт" });
      }

      console.log(`🤖 Auto-apply prompt: ${prompt}`);

      const { aiAssistant } = await import('./aiAssistant');
      const fs = await import('fs');

      // Analyze what needs to be done
      const projectTree = await aiAssistant.getProjectTree('.');

      // Find relevant files based on prompt
      const relevantFiles: string[] = [];
      const scanForFiles = (node: any) => {
        if (node.type === 'file' &&
          (node.path.endsWith('.ts') || node.path.endsWith('.tsx') ||
            node.path.endsWith('.js') || node.path.endsWith('.jsx'))) {
          relevantFiles.push(node.path);
        }
        if (node.children) {
          node.children.forEach(scanForFiles);
        }
      };
      scanForFiles(projectTree);

      // Apply changes to relevant files
      const results = [];
      for (const filePath of relevantFiles.slice(0, 10)) { // Limit to 10 files
        try {
          const editResult = await aiAssistant.editFile(filePath, prompt);

          if (editResult.success && editResult.editedContent !== editResult.originalContent) {
            // Write changes
            fs.writeFileSync(filePath, editResult.editedContent, 'utf-8');

            results.push({
              file: filePath,
              status: 'success',
              changes: editResult.changes
            });
          }
        } catch (error: any) {
          results.push({
            file: filePath,
            status: 'error',
            error: error.message
          });
        }
      }

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_auto_apply',
        level: 'success',
        message: `AI применил изменения к ${results.filter(r => r.status === 'success').length} файлам`,
        metadata: { prompt, totalFiles: results.length },
      });

      res.json({
        success: true,
        results,
        totalProcessed: results.length,
        successCount: results.filter(r => r.status === 'success').length
      });
    } catch (error: any) {
      console.error("Error auto-applying prompt:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Download edited file
  // Allows downloading a file after it has been edited by AI.
  app.post("/api/ai/download-edited", async (req, res) => {
    try {
      const { filename, content } = req.body;

      if (!filename || !content) {
        return res.status(400).json({ error: "Missing filename or content" });
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error: any) {
      console.error("Error downloading file:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Git commit endpoint
  // Commits staged changes to Git with a provided message and list of files.
  app.post("/api/ai/git-commit", async (req, res) => {
    const { execSync } = await import('child_process');
    const fs = await import('fs');

    try {
      const { message, files } = req.body;

      if (!message || !files || !Array.isArray(files)) {
        return res.status(400).json({ error: "Missing message or files" });
      }

      // Ensure files exist
      for (const file of files) {
        if (!fs.existsSync(file)) {
          return res.status(404).json({ error: `File not found: ${file}` });
        }
      }

      // Git add
      execSync(`git add ${files.join(' ')}`, { encoding: 'utf-8' });

      // Git commit
      const commitResult = execSync(`git commit -m "${message}"`, { encoding: 'utf-8' });

      console.log(`✅ Git commit: ${message}`);

      // Log to agent.log
      const logPath = 'packages/ai-master/agent.log';
      const logDir = 'packages/ai-master';

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logEntry = `[${new Date().toISOString()}] COMMIT: ${message} | Files: ${files.join(', ')}\n`;
      fs.appendFileSync(logPath, logEntry);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_commit',
        level: 'success',
        message: `Git commit: ${message}`,
        metadata: { files, commit: commitResult.trim() },
      });

      res.json({
        success: true,
        message: 'Committed successfully',
        commit: commitResult.trim()
      });
    } catch (error: any) {
      console.error("Error git commit:", error);

      await storage.createActivityLog(DEMO_USER_ID, {
        type: 'ai_commit',
        level: 'error',
        message: `Git commit failed: ${error.message}`,
        metadata: { error: error.message },
      });

      res.status(500).json({ error: error.message });
    }
  });

  // Test trade execution endpoint
  // Executes a simulated or real trade for a given opportunity ID, used for testing.
  app.post('/api/test-trade', async (req, res) => {
    try {
      const { opportunityId } = req.body;

      if (!opportunityId) {
        return res.status(400).json({ error: "Missing opportunityId" });
      }

      const opportunities = opportunityScanner.getOpportunities();
      const opportunity = opportunities.find(o => o.id === opportunityId);

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: "Opportunity not found or expired"
        });
      }

      const config = await storage.getBotConfig(DEMO_USER_ID);
      const isSimulation = config?.useSimulation !== false;

      const { tradeExecutor } = await import('./tradeExecutor');

      const result = await tradeExecutor.executeArbitrageTrade(
        DEMO_USER_ID,
        opportunity,
        isSimulation
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error executing test trade:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to execute test trade"
      });
    }
  });

  // Live Strategy Orchestrator
  // Manages the lifecycle and state of live trading strategies, allowing for start, stop, mode updates, and state retrieval.
  app.post("/api/strategy/start", async (req, res) => {
    try {
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      await orchestrator.start();
      res.json({ success: true, message: 'Strategy started' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategy/stop", async (req, res) => {
    try {
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      await orchestrator.stop();
      res.json({ success: true, message: 'Strategy stopped' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/strategy/state", async (req, res) => {
    try {
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      const state = orchestrator.getState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategy/mode", async (req, res) => {
    try {
      const { mode } = req.body;
      if (!['flashloan', 'direct_swap', 'hybrid'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }
      const { orchestrator } = await import('./liveStrategyOrchestrator');
      await orchestrator.updateMode(mode);
      res.json({ success: true, mode });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time updates (ref: blueprint:javascript_websocket)
  // Manages WebSocket connections for real-time data pushing to connected clients.
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    noServer: false
  });

  // Track connected clients
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('✅ WebSocket client connected');

    // Отправляем приветственное сообщение
    try {
      ws.send(JSON.stringify({
        type: 'connection',
        data: {
          status: 'connected',
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Error sending welcome message:', error);
    }

    clients.add(ws);

    // Ping для поддержания соединения
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (error) {
          console.error('Error pinging WebSocket:', error);
        }
      }
    }, 30000);

    ws.on('pong', () => {
      // Подтверждение активности соединения
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      clients.delete(ws);
      console.log('❌ WebSocket client disconnected, remaining clients:', clients.size);
    });

    ws.on('error', (error) => {
      console.error('⚠️ WebSocket error:', error.message);
      clearInterval(pingInterval);
      clients.delete(ws);
    });
  });

  // Обработка ошибок WebSocket сервера
  wss.on('error', (error) => {
    console.error('⚠️ WebSocket Server error:', error.message);
  });

  // Broadcast function for real-time updates
  // Sends messages to all connected WebSocket clients.
  const broadcast = (type: string, data: any) => {
    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
    });

    let successCount = 0;
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          successCount++;
        } catch (error) {
          console.error('Failed to send to client:', error);
        }
      }
    });

    console.log(`Broadcast ${type} to ${successCount}/${clients.size} clients`);
  };

  // Store broadcast function for use in routes
  app.locals.wsBroadcast = broadcast;
  (httpServer as any).wsBroadcast = broadcast;

  // MetaMask Office routes
  app.post('/api/metamask/start-trading', async (req, res) => {
    try {
      const { metamaskService } = await import('./metamaskService');
      const result = await metamaskService.startTrading(req.body);

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/scanner/pair-opportunities', async (req, res) => {
    try {
      const { pair } = req.query;
      const { metamaskService } = await import('./metamaskService');
      const result = await metamaskService.analyzeTradingPair(pair as string);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message, opportunities: [] });
    }
  });

  app.post('/api/metamask/export/pdf', async (req, res) => {
    try {
      const { metamaskService } = await import('./metamaskService');
      const { address } = req.body;
      const pdfBuffer = await metamaskService.generatePDFReport(address || 'unknown');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=trading-report.pdf');
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/metamask/export/csv', async (req, res) => {
    try {
      const { metamaskService } = await import('./metamaskService');
      const { address } = req.body;
      const csvContent = await metamaskService.generateCSVReport(address || 'unknown');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=trading-data.csv');
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/metamask/deposit', async (req, res) => {
    try {
      const { metamaskService } = await import('./metamaskService');
      const { address, amount, token } = req.body;
      const result = await metamaskService.deposit(address, amount, token);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/metamask/withdraw', async (req, res) => {
    try {
      const { metamaskService } = await import('./metamaskService');
      const { address, amount, token } = req.body;
      const result = await metamaskService.withdraw(address, amount, token);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/metamask/analytics/:address', async (req, res) => {
    try {
      const { metamaskService } = await import('./metamaskService');
      const analytics = await metamaskService.getAnalytics(req.params.address);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-sign routes
  app.post('/api/auto-sign/deploy', async (_req, res) => {
    try {
      const { autoSignService } = await import('./autoSignService');
      const result = await autoSignService.deployDependencies();

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/auto-sign/sign', async (req, res) => {
    try {
      const { autoSignService } = await import('./autoSignService');
      const { amount, gasLimit } = req.body;
      const result = await autoSignService.signTransaction({ amount, gasLimit });

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/auto-sign/finance', async (req, res) => {
    try {
      const { autoSignService } = await import('./autoSignService');
      const { type, amount } = req.body;

      if (!type || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Требуются параметры type и amount'
        });
      }

      const result = await autoSignService.processFinanceChoice({ type, amount });

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Register contracts router
  app.use('/api/contracts', contractsRouter);
  console.log('✅ Contracts API маршруты подключены: /api/contracts');

  // Social Features Routes
  app.get('/api/social/leaderboard', async (req, res) => {
    try {
      const { socialFeatures } = await import('./socialFeatures');
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const leaderboard = await socialFeatures.getLeaderboard(limit);
      res.json(leaderboard);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/social/copy-trading', async (req, res) => {
    try {
      const { socialFeatures } = await import('./socialFeatures');
      const strategies = await socialFeatures.getCopyTradingStrategies();
      res.json(strategies);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/social/copy-trading/subscribe', async (req, res) => {
    try {
      const { socialFeatures } = await import('./socialFeatures');
      const { strategyId } = req.body;
      const result = await socialFeatures.subscribeToCopyTrading(DEMO_USER_ID, strategyId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/social/dao/proposals', async (req, res) => {
    try {
      const { socialFeatures } = await import('./socialFeatures');
      const proposals = await socialFeatures.getDAOProposals();
      res.json(proposals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/social/dao/vote', async (req, res) => {
    try {
      const { socialFeatures } = await import('./socialFeatures');
      const { proposalId, vote } = req.body;
      const result = await socialFeatures.voteOnProposal(DEMO_USER_ID, proposalId, vote);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/social/nft/badges', async (req, res) => {
    try {
      const { socialFeatures } = await import('./socialFeatures');
      const badges = await socialFeatures.getUserBadges(DEMO_USER_ID);
      res.json(badges);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Multi-Chain Routes
  app.get('/api/chains/supported', async (req, res) => {
    try {
      const { multiChainManager } = await import('./multiChainManager');
      const chains = multiChainManager.getSupportedChains();
      res.json(chains);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/chains/switch', async (req, res) => {
    try {
      const { chainId } = req.body;
      const { multiChainManager } = await import('./multiChainManager');
      await multiChainManager.switchChain(DEMO_USER_ID, chainId);
      res.json({ success: true, chainId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Zap Routes
  app.post('/api/zap/in', async (req, res) => {
    try {
      const { zapService } = await import('./zapService');
      const result = await zapService.zapIn({
        ...req.body,
        userId: DEMO_USER_ID,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/zap/out', async (req, res) => {
    try {
      const { zapService } = await import('./zapService');
      const result = await zapService.zapOut({
        ...req.body,
        userId: DEMO_USER_ID,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/zap/route', async (req, res) => {
    try {
      const { zapService } = await import('./zapService');
      const route = await zapService.getZapRoute({
        ...req.body,
        userId: DEMO_USER_ID,
      });
      res.json(route);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Oracle Routes
  app.get('/api/oracle/prices', async (req, res) => {
    try {
      const { offChainOracle } = await import('./offChainOracle');
      const prices = offChainOracle.getAllPrices();
      res.json(prices);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/oracle/price/:token', async (req, res) => {
    try {
      const { offChainOracle } = await import('./offChainOracle');
      const price = offChainOracle.getPrice(req.params.token);
      res.json({ token: req.params.token, price });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}