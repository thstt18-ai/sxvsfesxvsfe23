CREATE TABLE "activity_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"level" varchar(20) DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"condition" varchar(50) NOT NULL,
	"threshold_value" numeric(15, 2) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notification_method" varchar(50) DEFAULT 'telegram' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "arbitrage_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "arbitrage_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"tx_hash" text NOT NULL,
	"token_in" varchar(100),
	"token_out" varchar(100),
	"amount_in" text,
	"amount_out" text,
	"profit_usd" numeric(15, 2),
	"gas_cost_usd" numeric(15, 2),
	"net_profit_usd" numeric(15, 2),
	"status" varchar(50) NOT NULL,
	"dex_path" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "arbitrage_transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "bot_config" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_config_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"network_mode" varchar(20) DEFAULT 'testnet' NOT NULL,
	"polygon_rpc_url" text DEFAULT 'https://polygon-rpc.com' NOT NULL,
	"polygon_testnet_rpc_url" text DEFAULT 'https://rpc.ankr.com/polygon_amoy' NOT NULL,
	"private_key" text,
	"safe_signer2_key" text,
	"min_profit_percent" numeric(10, 2) DEFAULT '0.3',
	"min_net_profit_percent" numeric(10, 2) DEFAULT '0.15',
	"flash_loan_amount" integer DEFAULT 10000,
	"scan_interval" integer DEFAULT 30,
	"flash_loan_contract" text,
	"oneinch_api_key" varchar(255),
	"polygonscan_api_key" varchar(255),
	"gecko_terminal_enabled" boolean DEFAULT true,
	"gecko_terminal_rate_limit" integer DEFAULT 30,
	"quickswap_rate_limit" integer DEFAULT 1000,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"max_loan_usd" integer DEFAULT 50000,
	"daily_loss_limit" numeric(10, 2) DEFAULT '500.0',
	"max_single_loss_usd" numeric(10, 2) DEFAULT '100.0',
	"insurance_wallet_address" text,
	"insurance_fund_percent" numeric(5, 2) DEFAULT '5.0',
	"max_gas_price_gwei" integer DEFAULT 60,
	"priority_fee_gwei" numeric(5, 2) DEFAULT '1.5',
	"min_net_profit_usd" numeric(10, 2) DEFAULT '1.5',
	"base_fee_multiplier" numeric(5, 3) DEFAULT '1.125',
	"max_gas_limit" integer DEFAULT 1500000,
	"max_retry_attempts" integer DEFAULT 3,
	"retry_delay_seconds" integer DEFAULT 5,
	"liquidity_multiplier" integer DEFAULT 5,
	"dex_reserve_multiplier" integer DEFAULT 10,
	"static_slippage_percent" numeric(5, 2) DEFAULT '0.5',
	"emergency_pause_drawdown_percent" numeric(5, 2) DEFAULT '1.0',
	"auto_pause_enabled" boolean DEFAULT true,
	"enable_real_trading" boolean DEFAULT false,
	"use_simulation" boolean DEFAULT true,
	"oneinch_rate_limit" integer DEFAULT 150,
	"telegram_profit_threshold_usd" numeric(10, 2) DEFAULT '10.0',
	"telegram_failed_tx_summary_interval_minutes" integer DEFAULT 30,
	"gnosis_safe_address" text,
	"safe_auto_sign_enabled" boolean DEFAULT true,
	"safe_retry_interval_minutes" integer DEFAULT 30,
	"safe_max_pending_hours" integer DEFAULT 24,
	"ledger_enabled" boolean DEFAULT false,
	"ledger_timeout_seconds" integer DEFAULT 10,
	"ledger_telegram_fallback" boolean DEFAULT true,
	"ledger_battery_check_enabled" boolean DEFAULT true,
	"ledger_low_battery_threshold" integer DEFAULT 20,
	"ledger_derivation_path" varchar(50) DEFAULT '44''/60''/0''/0/0',
	"ledger_critical_battery_threshold" integer DEFAULT 10,
	"ledger_reject_on_critical_battery" boolean DEFAULT true,
	"use_ledger_for_safe_signer2" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bot_status" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_status_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"is_running" boolean DEFAULT false NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"total_profit_usd" numeric(15, 2) DEFAULT '0.0',
	"success_rate" numeric(5, 2) DEFAULT '0.0',
	"active_opportunities" integer DEFAULT 0,
	"gas_cost_usd" numeric(15, 2) DEFAULT '0.0',
	"net_24h_usd" numeric(15, 2) DEFAULT '0.0',
	"insurance_fund_usd" numeric(15, 2) DEFAULT '0.0',
	"last_started_at" timestamp,
	"last_stopped_at" timestamp,
	"last_trade_at" timestamp,
	"total_profit" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "circuit_breaker_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "circuit_breaker_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"reason" varchar(100) NOT NULL,
	"trigger_value" numeric(15, 2),
	"threshold_value" numeric(15, 2),
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" varchar(100),
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connected_wallets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connected_wallets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"address" text NOT NULL,
	"wallet_type" varchar(50) NOT NULL,
	"chain_id" integer NOT NULL,
	"is_connected" boolean DEFAULT true NOT NULL,
	"last_connected_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flash_loan_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "flash_loan_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"token" varchar(100) NOT NULL,
	"amount" text NOT NULL,
	"provider" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"tx_hash" text,
	"premium" text,
	"gas_cost_usd" text,
	"error" text,
	"receiver_contract" text,
	"execution_params" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_status" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_status_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"device_model" varchar(100),
	"firmware_version" varchar(50),
	"battery_level" integer,
	"address" text,
	"last_connected_at" timestamp,
	"last_battery_check" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "open_positions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "open_positions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"token_in" varchar(100) NOT NULL,
	"token_out" varchar(100) NOT NULL,
	"amount_in" text NOT NULL,
	"entry_price_usd" numeric(15, 6) NOT NULL,
	"flash_loan_amount" text,
	"flash_loan_provider" varchar(50),
	"dex_path" text,
	"current_price_usd" numeric(15, 6),
	"unrealized_profit_usd" numeric(15, 2),
	"unrealized_profit_percent" numeric(10, 2),
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"last_updated_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "performance_metrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "performance_metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"period" varchar(20) NOT NULL,
	"total_trades" integer DEFAULT 0,
	"successful_trades" integer DEFAULT 0,
	"failed_trades" integer DEFAULT 0,
	"total_profit_usd" numeric(15, 2) DEFAULT '0.0',
	"total_gas_cost_usd" numeric(15, 2) DEFAULT '0.0',
	"net_profit_usd" numeric(15, 2) DEFAULT '0.0',
	"avg_profit_percent" numeric(10, 2),
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "risk_limits_tracking" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_limits_tracking_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"daily_loss_usd" numeric(15, 2) DEFAULT '0.0',
	"daily_profit_usd" numeric(15, 2) DEFAULT '0.0',
	"daily_trade_count" integer DEFAULT 0,
	"daily_gas_used_usd" numeric(15, 2) DEFAULT '0.0',
	"consecutive_failures" integer DEFAULT 0,
	"daily_loss_limit" numeric(15, 2) DEFAULT '500.0',
	"max_position_size_usd" numeric(15, 2) DEFAULT '50000.0',
	"max_single_loss_usd" numeric(15, 2) DEFAULT '100.0',
	"daily_loss_utilization" numeric(5, 2) DEFAULT '0.0',
	"largest_position_utilization" numeric(5, 2) DEFAULT '0.0',
	"last_reset_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "safe_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "safe_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"safe_tx_hash" text NOT NULL,
	"to" text NOT NULL,
	"value" text NOT NULL,
	"data" text,
	"operation" integer DEFAULT 0,
	"nonce" integer NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"confirmations" integer DEFAULT 0,
	"required_confirmations" integer DEFAULT 2,
	"executed_tx_hash" text,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "safe_transactions_safe_tx_hash_unique" UNIQUE("safe_tx_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "telegram_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"message_type" varchar(50) DEFAULT 'notification' NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_whitelist" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "token_whitelist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"address" text NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"decimals" integer NOT NULL,
	"min_liquidity" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_configs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"event_types" jsonb,
	"headers" text,
	"total_calls" integer DEFAULT 0,
	"successful_calls" integer DEFAULT 0,
	"failed_calls" integer DEFAULT 0,
	"last_called_at" timestamp,
	"last_success_at" timestamp,
	"last_error_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"webhook_config_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"method" varchar(10) DEFAULT 'POST',
	"request_body" jsonb,
	"request_headers" jsonb,
	"status_code" integer,
	"response_body" text,
	"response_time" integer,
	"success" boolean NOT NULL,
	"error" text,
	"retry_attempt" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arbitrage_transactions" ADD CONSTRAINT "arbitrage_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_config" ADD CONSTRAINT "bot_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_status" ADD CONSTRAINT "bot_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuit_breaker_events" ADD CONSTRAINT "circuit_breaker_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_wallets" ADD CONSTRAINT "connected_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_loan_requests" ADD CONSTRAINT "flash_loan_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_status" ADD CONSTRAINT "ledger_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_positions" ADD CONSTRAINT "open_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_limits_tracking" ADD CONSTRAINT "risk_limits_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_transactions" ADD CONSTRAINT "safe_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_whitelist" ADD CONSTRAINT "token_whitelist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_configs" ADD CONSTRAINT "webhook_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_config_id_webhook_configs_id_fk" FOREIGN KEY ("webhook_config_id") REFERENCES "public"."webhook_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");