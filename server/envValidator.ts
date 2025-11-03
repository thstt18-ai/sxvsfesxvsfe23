
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // RPC Endpoints
  POLYGON_RPC_URL: z.string().url().optional(),
  POLYGON_TESTNET_RPC_URL: z.string().url().optional(),
  
  // API Keys
  ONEINCH_API_KEY: z.string().optional(),
  POLYGONSCAN_API_KEY: z.string().optional(),
  
  // Security
  ENABLE_LIVE_TRADING: z.enum(['true', 'false']).optional().default('false'),
  
  // Contracts
  ARBITRAGE_CONTRACT: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  console.log('\n🔍 Validating environment variables...\n');
  
  try {
    const env = envSchema.parse(process.env);
    
    console.log('✅ Environment validation passed');
    console.log('   DATABASE_URL:', env.DATABASE_URL ? '✓ configured' : '✗ missing');
    console.log('   POLYGON_RPC_URL:', env.POLYGON_RPC_URL ? '✓ configured' : '⚠️  using fallback');
    console.log('   POLYGON_TESTNET_RPC_URL:', env.POLYGON_TESTNET_RPC_URL ? '✓ configured' : '⚠️  using fallback');
    console.log('   ONEINCH_API_KEY:', env.ONEINCH_API_KEY ? '✓ configured' : '⚠️  demo mode');
    console.log('   ARBITRAGE_CONTRACT:', env.ARBITRAGE_CONTRACT ? '✓ configured' : '⚠️  needs deployment');
    console.log('   ENABLE_LIVE_TRADING:', env.ENABLE_LIVE_TRADING === 'true' ? '🔴 ENABLED' : '🟢 DISABLED');
    console.log('   NODE_ENV:', env.NODE_ENV);
    console.log('');
    
    // Critical checks
    if (env.NODE_ENV === 'production') {
      const criticalMissing: string[] = [];
      
      if (!env.POLYGON_RPC_URL) criticalMissing.push('POLYGON_RPC_URL');
      if (!env.ONEINCH_API_KEY) criticalMissing.push('ONEINCH_API_KEY');
      if (!env.ARBITRAGE_CONTRACT) criticalMissing.push('ARBITRAGE_CONTRACT');
      
      if (criticalMissing.length > 0) {
        console.error('❌ PRODUCTION MODE - Missing critical variables:');
        criticalMissing.forEach(v => console.error(`   - ${v}`));
        console.error('\nAdd these in Secrets tab or .env file\n');
        process.exit(1);
      }
    }
    
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:\n');
      error.errors.forEach((err) => {
        console.error(`   ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\n💡 Fix these issues in the Secrets tab or .env file\n');
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();
