
-- Migration 0002: Add Advanced Trading Features
-- Created: 2025-01-01

-- Add triangular arbitrage support
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_triangular_arbitrage" boolean DEFAULT false;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_multi_hop_arbitrage" boolean DEFAULT false;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_jit_liquidity" boolean DEFAULT false;

-- Add DEX enable/disable flags
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_quickswap" boolean DEFAULT true;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_sushiswap" boolean DEFAULT true;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_uniswap_v3" boolean DEFAULT true;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_one_inch" boolean DEFAULT true;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_balancer" boolean DEFAULT true;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_dodo" boolean DEFAULT true;
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "enable_kyberswap" boolean DEFAULT true;

-- Add pool depth filter
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "min_pool_depth_usd" numeric(15, 2) DEFAULT 10000.0;

-- Update meta journal
UPDATE _journal SET version = 2 WHERE id = (SELECT MAX(id) FROM _journal);
