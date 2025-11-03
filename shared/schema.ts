import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Bot Configuration - все переменные окружения хранятся в БД
export const botConfig = pgTable("bot_config", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Network & RPC
  networkMode: varchar("network_mode", { length: 20 }).notNull().default("testnet"),
  polygonRpcUrl: text("polygon_rpc_url").notNull().default("https://polygon-rpc.com"),
  polygonTestnetRpcUrl: text("polygon_testnet_rpc_url").notNull().default("https://rpc.ankr.com/polygon_amoy"),

  // Wallets (encrypted) - ИСПРАВЛЕНО: убрано дублирование privateKey
  privateKey: text("private_key"),
  safeSigner2Key: text("safe_signer2_key"),

  // Trading Parameters
  minProfitPercent: numeric("min_profit_percent", { precision: 10, scale: 2 }).default("0.3"),
  minNetProfitPercent: numeric("min_net_profit_percent", { precision: 10, scale: 2 }).default("0.15"),
  flashLoanAmount: integer("flash_loan_amount").default(10000),
  scanInterval: integer("scan_interval").default(30),

  // Contracts
  flashLoanContract: text("flash_loan_contract"),

  // API Keys
  oneinchApiKey: varchar("oneinch_api_key", { length: 255 }),
  polygonscanApiKey: varchar("polygonscan_api_key", { length: 255 }),
  geckoTerminalEnabled: boolean("gecko_terminal_enabled").default(true),
  geckoTerminalRateLimit: integer("gecko_terminal_rate_limit").default(30),
  quickswapRateLimit: integer("quickswap_rate_limit").default(1000),

  // Telegram
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),

  // Real Money Trading
  maxLoanUsd: integer("max_loan_usd").default(50000),
  dailyLossLimit: numeric("daily_loss_limit", { precision: 10, scale: 2 }).default("500.0"),
  maxSingleLossUsd: numeric("max_single_loss_usd", { precision: 10, scale: 2 }).default("100.0"),
  insuranceWalletAddress: text("insurance_wallet_address"),
  insuranceFundPercent: numeric("insurance_fund_percent", { precision: 5, scale: 2 }).default("5.0"),

  // Deposit Wallet - кошелек для получения 100% прибыли после успешной сделки
  depositWalletAddress: text("deposit_wallet_address"),
  autoTransferEnabled: boolean("auto_transfer_enabled").default(false),
  transferThresholdUsd: numeric("transfer_threshold_usd", { precision: 10, scale: 2 }).default("10.0"),

  // Gas Settings
  maxGasPriceGwei: integer("max_gas_price_gwei").default(60),
  priorityFeeGwei: numeric("priority_fee_gwei", { precision: 5, scale: 2 }).default("1.5"),
  minNetProfitUsd: numeric("min_net_profit_usd", { precision: 10, scale: 2 }).default("1.5"),
  baseFeeMultiplier: numeric("base_fee_multiplier", { precision: 5, scale: 3 }).default("1.125"),
  maxGasLimit: integer("max_gas_limit").default(1500000),

  // Retry & Limits
  maxRetryAttempts: integer("max_retry_attempts").default(3),
  retryDelaySeconds: integer("retry_delay_seconds").default(5),
  liquidityMultiplier: integer("liquidity_multiplier").default(5),
  dexReserveMultiplier: integer("dex_reserve_multiplier").default(10),
  staticSlippagePercent: numeric("static_slippage_percent", { precision: 5, scale: 2 }).default("0.5"),

  // Safety & Emergency
  emergencyPauseDrawdownPercent: numeric("emergency_pause_drawdown_percent", { precision: 5, scale: 2 }).default("1.0"),
  autoPauseEnabled: boolean("auto_pause_enabled").default(true),
  enableRealTrading: boolean("enable_real_trading").default(false),
  useSimulation: boolean("use_simulation").default(true),
  useFlashbots: boolean("use_flashbots").default(false).notNull(),

  // Advanced Trading Strategies
  enableTriangularArbitrage: boolean("enable_triangular_arbitrage").default(false),
  enableMultiHopArbitrage: boolean("enable_multi_hop_arbitrage").default(false),
  enableJitLiquidity: boolean("enable_jit_liquidity").default(false),

  // DEX Selection (all enabled by default)
  enableQuickswap: boolean("enable_quickswap").default(true),
  enableSushiswap: boolean("enable_sushiswap").default(true),
  enableUniswapV3: boolean("enable_uniswap_v3").default(true),
  enableOneInch: boolean("enable_one_inch").default(true),
  enableBalancer: boolean("enable_balancer").default(true),
  enableDodo: boolean("enable_dodo").default(true),
  enableKyberswap: boolean("enable_kyberswap").default(true),

  // Pool filters
  minPoolDepthUsd: numeric("min_pool_depth_usd", { precision: 15, scale: 2 }).default("10000.0"),

  // Rate Limits
  oneinchRateLimit: integer("oneinch_rate_limit").default(150),

  // Telegram Thresholds
  telegramProfitThresholdUsd: numeric("telegram_profit_threshold_usd", { precision: 10, scale: 2 }).default("10.0"),
  telegramFailedTxSummaryIntervalMinutes: integer("telegram_failed_tx_summary_interval_minutes").default(30),

  // Gnosis Safe Configuration
  gnosisSafeAddress: text("gnosis_safe_address"),
  safeAutoSignEnabled: boolean("safe_auto_sign_enabled").default(true),
  safeRetryIntervalMinutes: integer("safe_retry_interval_minutes").default(30),
  safeMaxPendingHours: integer("safe_max_pending_hours").default(24),

  // Ledger Configuration
  ledgerEnabled: boolean("ledger_enabled").default(false),
  ledgerTimeoutSeconds: integer("ledger_timeout_seconds").default(10),
  ledgerTelegramFallback: boolean("ledger_telegram_fallback").default(true),
  ledgerBatteryCheckEnabled: boolean("ledger_battery_check_enabled").default(true),
  ledgerLowBatteryThreshold: integer("ledger_low_battery_threshold").default(20),
  ledgerDerivationPath: varchar("ledger_derivation_path", { length: 50 }).default("44'/60'/0'/0/0"),
  ledgerCriticalBatteryThreshold: integer("ledger_critical_battery_threshold").default(10),
  ledgerRejectOnCriticalBattery: boolean("ledger_reject_on_critical_battery").default(true),
  useLedgerForSafeSigner2: boolean("use_ledger_for_safe_signer2").default(false),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  // Wallet for receiving balances
  walletAddress: text("wallet_address"),
});

export const insertBotConfigSchema = createInsertSchema(botConfig, {
  autoPauseEnabled: z.boolean().optional(),
  enableRealTrading: z.boolean().optional(),
  useSimulation: z.boolean().optional(),
  geckoTerminalEnabled: z.boolean().optional(),
  safeAutoSignEnabled: z.boolean().optional(),
  ledgerEnabled: z.boolean().optional(),
  ledgerTelegramFallback: z.boolean().optional(),
  ledgerBatteryCheckEnabled: z.boolean().optional(),
  ledgerRejectOnCriticalBattery: z.boolean().optional(),
  useLedgerForSafeSigner2: z.boolean().optional(),
  useFlashbots: z.boolean().optional(),
  walletAddress: z.string().optional(),
});
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfig.$inferSelect;

// Bot Status - текущее состояние бота
export const botStatus = pgTable("bot_status", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Status
  isRunning: boolean("is_running").notNull().default(false),
  isPaused: boolean("is_paused").notNull().default(false),
  pauseReason: text("pause_reason"),

  // Metrics
  totalProfitUsd: numeric("total_profit_usd", { precision: 15, scale: 2 }).default("0.0"),
  successRate: numeric("success_rate", { precision: 5, scale: 2 }).default("0.0"),
  activeOpportunities: integer("active_opportunities").default(0),
  gasCostUsd: numeric("gas_cost_usd", { precision: 15, scale: 2 }).default("0.0"),
  net24hUsd: numeric("net_24h_usd", { precision: 15, scale: 2 }).default("0.0"),
  insuranceFundUsd: numeric("insurance_fund_usd", { precision: 15, scale: 2 }).default("0.0"),

  lastStartedAt: timestamp("last_started_at"),
  lastStoppedAt: timestamp("last_stopped_at"),
  lastTradeAt: timestamp("last_trade_at"),
  totalProfit: text("total_profit"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BotStatus = typeof botStatus.$inferSelect;

// Ledger Device Status
export const ledgerStatus = pgTable("ledger_status", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  connected: boolean("connected").notNull().default(false),
  deviceModel: varchar("device_model", { length: 100 }),
  firmwareVersion: varchar("firmware_version", { length: 50 }),
  batteryLevel: integer("battery_level"),
  address: text("address"),

  lastConnectedAt: timestamp("last_connected_at"),
  lastBatteryCheck: timestamp("last_battery_check"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LedgerStatus = typeof ledgerStatus.$inferSelect;

// Safe Multisig Transactions
export const safeTransactions = pgTable("safe_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  safeTxHash: text("safe_tx_hash").notNull().unique(),
  to: text("to").notNull(),
  value: text("value").notNull(),
  data: text("data"),
  operation: integer("operation").default(0),
  nonce: integer("nonce").notNull(),

  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  confirmations: integer("confirmations").default(0),
  requiredConfirmations: integer("required_confirmations").default(2),

  executedTxHash: text("executed_tx_hash"),
  executedAt: timestamp("executed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSafeTransactionSchema = createInsertSchema(safeTransactions);
export type InsertSafeTransaction = z.infer<typeof insertSafeTransactionSchema>;
export type SafeTransaction = typeof safeTransactions.$inferSelect;

// Arbitrage Transactions History
export const arbitrageTransactions = pgTable("arbitrage_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  txHash: text("tx_hash").notNull().unique(),
  tokenIn: varchar("token_in", { length: 100 }),
  tokenOut: varchar("token_out", { length: 100 }),
  amountIn: text("amount_in"),
  amountOut: text("amount_out"),
  profitUsd: numeric("profit_usd", { precision: 15, scale: 2 }),
  gasCostUsd: numeric("gas_cost_usd", { precision: 15, scale: 2 }),
  netProfitUsd: numeric("net_profit_usd", { precision: 15, scale: 2 }),

  status: varchar("status", { length: 50 }).notNull(),

  dexPath: text("dex_path"),

  createdAt: timestamp("created_at").defaultNow(),
});

export type ArbitrageTransaction = typeof arbitrageTransactions.$inferSelect;

// Connected Wallets (MetaMask, etc)
export const connectedWallets = pgTable("connected_wallets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  address: text("address").notNull(),
  walletType: varchar("wallet_type", { length: 50 }).notNull(),
  chainId: integer("chain_id").notNull(),
  isConnected: boolean("is_connected").notNull().default(true),

  lastConnectedAt: timestamp("last_connected_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ConnectedWallet = typeof connectedWallets.$inferSelect;

// Activity Logs - Real-time system activity tracking
export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  type: varchar("type", { length: 50 }).notNull(), // 'swap', 'wallet_connect', 'trade', 'config_update', etc
  level: varchar("level", { length: 20 }).notNull().default("info"), // 'info', 'warning', 'error', 'success'
  message: text("message").notNull(),

  metadata: jsonb("metadata"), // Additional data like transaction hash, amounts, etc

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs);
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Telegram Messages History - для отслеживания всех отправленных сообщений
export const telegramMessages = pgTable("telegram_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  message: text("message").notNull(),
  messageType: varchar("message_type", { length: 50 }).notNull().default("notification"), // 'notification', 'alert', 'trade', 'error'
  success: boolean("success").notNull().default(true),
  error: text("error"),

  metadata: jsonb("metadata"), // Дополнительные данные (profit, txHash, и т.д.)

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTelegramMessageSchema = createInsertSchema(telegramMessages, {
  success: z.boolean().optional(),
});
export type InsertTelegramMessage = z.infer<typeof insertTelegramMessageSchema>;
export type TelegramMessage = typeof telegramMessages.$inferSelect;

// Open Positions - активные позиции с расчетом unrealized P&L
export const openPositions = pgTable("open_positions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Position details
  tokenIn: varchar("token_in", { length: 100 }).notNull(),
  tokenOut: varchar("token_out", { length: 100 }).notNull(),
  amountIn: text("amount_in").notNull(),
  entryPriceUsd: numeric("entry_price_usd", { precision: 15, scale: 6 }).notNull(),

  // Flash loan details
  flashLoanAmount: text("flash_loan_amount"),
  flashLoanProvider: varchar("flash_loan_provider", { length: 50 }), // 'aave', 'balancer'

  // DEX path
  dexPath: text("dex_path"),

  // Current state (calculated)
  currentPriceUsd: numeric("current_price_usd", { precision: 15, scale: 6 }),
  unrealizedProfitUsd: numeric("unrealized_profit_usd", { precision: 15, scale: 2 }),
  unrealizedProfitPercent: numeric("unrealized_profit_percent", { precision: 10, scale: 2 }),

  // Status
  status: varchar("status", { length: 50 }).notNull().default("OPEN"), // 'OPEN', 'CLOSING', 'CLOSED'

  // Timestamps
  openedAt: timestamp("opened_at").defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertOpenPositionSchema = createInsertSchema(openPositions);
export type InsertOpenPosition = z.infer<typeof insertOpenPositionSchema>;
export type OpenPosition = typeof openPositions.$inferSelect;

// Flash Loan Requests - история flash loan запросов
export const flashLoanRequests = pgTable("flash_loan_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  token: varchar("token", { length: 100 }).notNull(),
  amount: text("amount").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // 'aave_v3', 'balancer'

  status: varchar("status", { length: 50 }).notNull(), // 'SUCCESS', 'FAILED', 'PENDING'
  txHash: text("tx_hash"),
  premium: text("premium"),
  gasCostUsd: text("gas_cost_usd"),
  error: text("error"),

  receiverContract: text("receiver_contract"),
  executionParams: text("execution_params"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFlashLoanRequestSchema = createInsertSchema(flashLoanRequests);
export type InsertFlashLoanRequest = z.infer<typeof insertFlashLoanRequestSchema>;
export type FlashLoanRequest = typeof flashLoanRequests.$inferSelect;

// Token Whitelist - список разрешенных токенов для торговли
export const tokenWhitelist = pgTable("token_whitelist", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  address: text("address").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  decimals: integer("decimals").notNull(),
  minLiquidity: text("min_liquidity"),
  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTokenWhitelistSchema = createInsertSchema(tokenWhitelist, {
  enabled: z.boolean().optional(),
});
export type InsertTokenWhitelist = z.infer<typeof insertTokenWhitelistSchema>;
export type TokenWhitelist = typeof tokenWhitelist.$inferSelect;

// Performance Metrics - метрики производительности по периодам
export const performanceMetrics = pgTable("performance_metrics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  period: varchar("period", { length: 20 }).notNull(), // 'hour', 'day', 'week', 'month'
  totalTrades: integer("total_trades").default(0),
  successfulTrades: integer("successful_trades").default(0),
  failedTrades: integer("failed_trades").default(0),
  totalProfitUsd: numeric("total_profit_usd", { precision: 15, scale: 2 }).default("0.0"),
  totalGasCostUsd: numeric("total_gas_cost_usd", { precision: 15, scale: 2 }).default("0.0"),
  netProfitUsd: numeric("net_profit_usd", { precision: 15, scale: 2 }).default("0.0"),
  avgProfitPercent: numeric("avg_profit_percent", { precision: 10, scale: 2 }),

  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
});

export type PerformanceMetrics = typeof performanceMetrics.$inferSelect;

// Alert Rules - правила для уведомлений
export const alertRules = pgTable("alert_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 100 }).notNull(),
  condition: varchar("condition", { length: 50 }).notNull(), // 'profit_above', 'loss_below', 'gas_above'
  thresholdValue: numeric("threshold_value", { precision: 15, scale: 2 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),

  notificationMethod: varchar("notification_method", { length: 50 }).notNull().default("telegram"), // 'telegram', 'webhook'

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAlertRuleSchema = createInsertSchema(alertRules, {
  enabled: z.boolean().optional(),
});
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type AlertRule = typeof alertRules.$inferSelect;

// Webhook Configurations - настройки вебхуков
export const webhookConfigs = pgTable("webhook_configs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  url: text("url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  eventTypes: jsonb("event_types"), // ['trade_success', 'trade_failure', 'bot_status_change']
  headers: text("headers"),

  totalCalls: integer("total_calls").default(0),
  successfulCalls: integer("successful_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  lastCalledAt: timestamp("last_called_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastErrorAt: timestamp("last_error_at"),
  lastError: text("last_error"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWebhookConfigSchema = createInsertSchema(webhookConfigs, {
  enabled: z.boolean().optional(),
});
export type InsertWebhookConfig = z.infer<typeof insertWebhookConfigSchema>;
export type WebhookConfig = typeof webhookConfigs.$inferSelect;

// Webhook Logs - история отправки вебхуков
export const webhookLogs = pgTable("webhook_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  webhookConfigId: integer("webhook_config_id").notNull().references(() => webhookConfigs.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  url: text("url").notNull(),
  method: varchar("method", { length: 10 }).default("POST"),
  requestBody: jsonb("request_body"),
  requestHeaders: jsonb("request_headers"),
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  responseTime: integer("response_time"),
  success: boolean("success").notNull(),
  error: text("error"),
  retryAttempt: integer("retry_attempt").default(0),

  createdAt: timestamp("created_at").defaultNow(),
});

export type WebhookLog = typeof webhookLogs.$inferSelect;

// Circuit Breaker Events - события аварийной остановки
export const circuitBreakerEvents = pgTable("circuit_breaker_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  reason: varchar("reason", { length: 100 }).notNull(), // 'daily_loss_limit', 'consecutive_failures'
  triggerValue: numeric("trigger_value", { precision: 15, scale: 2 }),
  thresholdValue: numeric("threshold_value", { precision: 15, scale: 2 }),

  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 100 }),
  resolutionNotes: text("resolution_notes"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCircuitBreakerEventSchema = createInsertSchema(circuitBreakerEvents, {
  resolved: z.boolean().optional(),
});
export type InsertCircuitBreakerEvent = z.infer<typeof insertCircuitBreakerEventSchema>;
export type CircuitBreakerEvent = typeof circuitBreakerEvents.$inferSelect;

// Risk Limits Tracking - отслеживание лимитов рисков
export const riskLimitsTracking = pgTable("risk_limits_tracking", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  dailyLossUsd: numeric("daily_loss_usd", { precision: 15, scale: 2 }).default("0.0"),
  dailyProfitUsd: numeric("daily_profit_usd", { precision: 15, scale: 2 }).default("0.0"),
  dailyTradeCount: integer("daily_trade_count").default(0),
  dailyGasUsedUsd: numeric("daily_gas_used_usd", { precision: 15, scale: 2 }).default("0.0"),
  consecutiveFailures: integer("consecutive_failures").default(0),

  dailyLossLimit: numeric("daily_loss_limit", { precision: 15, scale: 2 }).default("500.0"),
  maxPositionSizeUsd: numeric("max_position_size_usd", { precision: 15, scale: 2 }).default("50000.0"),
  maxSingleLossUsd: numeric("max_single_loss_usd", { precision: 15, scale: 2 }).default("100.0"),

  dailyLossUtilization: numeric("daily_loss_utilization", { precision: 5, scale: 2 }).default("0.0"),
  largestPositionUtilization: numeric("largest_position_utilization", { precision: 5, scale: 2 }).default("0.0"),

  lastResetAt: timestamp("last_reset_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type RiskLimitsTracking = typeof riskLimitsTracking.$inferSelect;