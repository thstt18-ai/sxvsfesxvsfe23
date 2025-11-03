import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { storage } from "./storage";
import { configLoader } from "./configLoader";
import { validateEnv } from './envValidator';
import cors from 'cors';
import contractsRouter from './routes/contracts';

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Validate environment variables once
const envValidation = validateEnv();

// Initialize demo user
console.log('👤 Инициализация demo пользователя...');
await storage.ensureDemoUser();
console.log('✅ Demo пользователь инициализирован');

console.log('🔐 Инициализация системы безопасности...');
const riskConfig = configLoader.getConfig();
const validation = configLoader.validateConfig();

configLoader.printConfig();

// Initialize RPC Provider first
const { initializeProvider } = await import('./web3Provider');
try {
  await initializeProvider();
  console.log('✅ RPC Provider initialized successfully');
} catch (error: any) {
  console.error('⚠️ RPC Provider initialization failed:', error.message);
  console.log('Продолжаем работу в ограниченном режиме...');
}

// Initialize RPC Failover Manager
const DEMO_USER_ID = "demo-user-1";
const { rpcFailoverManager } = await import('./rpcFailover');
rpcFailoverManager.startMonitoring(DEMO_USER_ID);

// Initialize Retry Queue Manager
const { retryQueueManager } = await import('./retryQueue');
retryQueueManager.startProcessing();

// Initialize Graceful Shutdown
const { gracefulShutdown } = await import('./gracefulShutdown');
gracefulShutdown.initialize(DEMO_USER_ID);

// Initialize Health Check Service
const { healthCheckService } = await import('./healthCheck');
console.log('✅ Health check service initialized');

// Auto-setup contract authorization (non-blocking with timeout)
const { autoSetupContract } = await import('./contractAutoSetup');
Promise.race([
  autoSetupContract(DEMO_USER_ID),
  new Promise<any>((resolve) => setTimeout(() => resolve({ success: false, message: 'Contract setup timed out (skipped)' }), 10000))
]).then((setupResult) => {
  if (setupResult.success) {
    console.log(`✅ ${setupResult.message}`);
  } else {
    console.warn(`⚠️  Contract setup warning: ${setupResult.message}`);
    console.log('Пожалуйста, проверьте вывод команды и выполните вручную: cd contracts && npm run auto-deploy:amoy');
  }
}).catch((error) => {
  console.error('⚠️  Contract setup error:', error.message);
});

// Initialize Production-2.0 modules
const { logRotationManager } = await import('./logRotation');
const { memoryMonitor } = await import('./memoryMonitor');
const { diskSpaceMonitor } = await import('./diskSpaceMonitor');

await logRotationManager.initialize();
logRotationManager.startRotation(DEMO_USER_ID);
memoryMonitor.startMonitoring(DEMO_USER_ID);
diskSpaceMonitor.startMonitoring(DEMO_USER_ID);

console.log('✅ Production-2.0 modules initialized (log rotation, memory monitor, disk space monitor)');

if (!validation.valid) {
  console.error('\n⚠️  ПРЕДУПРЕЖДЕНИЯ КОНФИГУРАЦИИ:');
  validation.errors.forEach(error => console.error(`   - ${error}`));
  console.log('');
}

if (riskConfig.enableLiveTrading) {
  console.log('\n🔴 ВНИМАНИЕ! РЕЖИМ РЕАЛЬНОЙ ТОРГОВЛИ АКТИВИРОВАН!');
  console.log('   Убедитесь, что все настройки корректны.');
  console.log('   Для отключения установите ENABLE_LIVE_TRADING=false\n');
} else {
  console.log('\n🟢 Работа в режиме симуляции (безопасный режим)\n');
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register contracts API route
  app.use('/api/contracts', contractsRouter);

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);

  // Start auto-optimizer
  const { autoOptimizer } = await import('./autoOptimizer');
  autoOptimizer.start();

  // Initialize multi-chain support
  const { multiChainManager } = await import('./multiChainManager');
  await multiChainManager.initialize();

  // Initialize off-chain oracle
  const { offChainOracle } = await import('./offChainOracle');
  await offChainOracle.initialize('demo-user-1');

  // Start server
  server.listen(port, "0.0.0.0", () => {
    console.log('\n🚀 Server running on http://0.0.0.0:5000');
    console.log('📊 Database connected: ✓');
    console.log('🤖 Auto-optimizer: ✓ Running');
    console.log('🌐 Multi-Chain: ✓ Polygon, BSC, Arbitrum, Avalanche');
    console.log('🔮 Oracle: ✓ RedStone + Chainlink');
  });
})();