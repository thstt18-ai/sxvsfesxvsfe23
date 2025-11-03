
-- Migration 0003: Add wallet_address column
-- Created: 2025-01-01

ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "wallet_address" text;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "deposit_wallet_address" text;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "auto_transfer_enabled" boolean DEFAULT false;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "transfer_threshold_usd" numeric(10,2) DEFAULT 10.0;

-- Update meta journal
UPDATE _journal SET version = 3 WHERE id = (SELECT MAX(id) FROM _journal);
