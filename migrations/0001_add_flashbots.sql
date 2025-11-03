-- Migration: Add Flashbots support
-- This migration adds the use_flashbots column to bot_config table

ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS use_flashbots BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS flash_loan_contract TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bot_config_flashbots ON bot_config(use_flashbots);

-- Add Flashbots support
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "use_flashbots" boolean DEFAULT false NOT NULL;

-- Ensure the column exists by trying to add it again (safe with IF NOT EXISTS)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bot_config' AND column_name = 'use_flashbots'
    ) THEN
        ALTER TABLE "bot_config" ADD COLUMN "use_flashbots" boolean DEFAULT false NOT NULL;
    END IF;
END $$;