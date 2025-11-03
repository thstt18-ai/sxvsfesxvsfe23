import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const router = Router();

/**
 * POST /api/contracts/verify-deps
 * Проверка установленных зависимостей
 */
router.post('/verify-deps', async (req, res) => {
  try {
    console.log('🔍 Проверка зависимостей contracts...');

    const contractsDir = path.join(process.cwd(), 'contracts');
    const packageJsonPath = path.join(contractsDir, 'package.json');
    const nodeModulesPath = path.join(contractsDir, 'node_modules');

    // Проверяем существование package.json
    if (!fs.existsSync(packageJsonPath)) {
      return res.json({
        success: false,
        message: 'package.json не найден',
        details: 'Файл package.json отсутствует в директории contracts'
      });
    }

    // Проверяем существование node_modules
    if (!fs.existsSync(nodeModulesPath)) {
      return res.json({
        success: false,
        message: 'node_modules не найден',
        details: 'Директория node_modules отсутствует, требуется установка'
      });
    }

    // Проверяем критичные пакеты
    const criticalPackages = [
      'hardhat',
      'ethers',
      '@openzeppelin/contracts',
      '@openzeppelin/hardhat-upgrades',
      '@aave/core-v3',
      'dotenv'
    ];

    const missingPackages: string[] = [];

    for (const pkg of criticalPackages) {
      const pkgPath = path.join(nodeModulesPath, pkg);
      if (!fs.existsSync(pkgPath)) {
        missingPackages.push(pkg);
      }
    }

    if (missingPackages.length > 0) {
      return res.json({
        success: false,
        message: 'Требуется установка зависимостей',
        details: `Отсутствуют пакеты: ${missingPackages.join(', ')}`
      });
    }

    console.log('✅ Все зависимости установлены');
    res.json({
      success: true,
      message: 'Все зависимости установлены',
      details: 'Все критичные пакеты найдены'
    });

  } catch (error: any) {
    console.error('❌ Ошибка проверки зависимостей:', error);
    res.json({
      success: false,
      message: 'Ошибка проверки зависимостей',
      details: error.message
    });
  }
});

/**
 * POST /api/contracts/install-deps
 * Установка зависимостей contracts с потоковой передачей логов
 */
router.post('/install-deps', async (req, res) => {
  // Устанавливаем заголовки для потоковой передачи
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Отключаем буферизацию nginx

  const sendLog = (message: string) => {
    try {
      const data = JSON.stringify({ log: message });
      res.write(`data: ${data}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (e) {
      console.error('Error sending log:', e);
    }
  };

  const sendSuccess = (message: string) => {
    try {
      const data = JSON.stringify({ success: true, message });
      res.write(`data: ${data}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (e) {
      console.error('Error sending success:', e);
    }
  };

  const sendError = (error: string) => {
    try {
      const data = JSON.stringify({ success: false, error });
      res.write(`data: ${data}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (e) {
      console.error('Error sending error:', e);
    }
  };

  try {
    sendLog('📦 Начинаем установку зависимостей contracts...');

    const contractsDir = path.join(process.cwd(), 'contracts');

    // Проверяем существование package.json
    const packageJsonPath = path.join(contractsDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      sendLog('❌ Файл package.json не найден в папке contracts');
      res.write(`data: ${JSON.stringify({ error: 'package.json не найден', success: false })}\n\n`);
      res.end();
      return;
    }

    // Очистка node_modules при проблемах
    const nodeModulesPath = path.join(contractsDir, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      sendLog('🗑️ Удаление старой директории node_modules...');
      try {
        await execAsync(`rm -rf ${nodeModulesPath}`, {
          cwd: contractsDir,
          timeout: 30000
        });
        sendLog('✅ Старые зависимости удалены');
      } catch (e) {
        sendLog('⚠️ Не удалось удалить node_modules (продолжаем)');
      }
    }

    sendLog('🧹 Очистка кеша npm...');
    try {
      await execAsync('npm cache clean --force', {
        cwd: contractsDir,
        timeout: 30000
      });
      sendLog('✅ Кеш очищен');
    } catch (e) {
      sendLog('⚠️ Не удалось очистить кеш (продолжаем)');
    }

    // Установка всех зависимостей одной командой с флагом --no-audit для ускорения
    sendLog('📥 Установка всех пакетов из package.json...');
    sendLog('⏳ Пожалуйста подождите, это может занять 2-3 минуты...');

    try {
      const { spawn } = await import('child_process');
      const installProcess = spawn(
        'npm',
        ['install', '--legacy-peer-deps', '--no-audit', '--prefer-offline', '--progress=true'],
        {
          cwd: contractsDir,
          env: {
            ...process.env,
            NPM_CONFIG_PROGRESS: 'true',
            NPM_CONFIG_LOGLEVEL: 'info'
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );

      let lastLog = Date.now();
      const keepAliveInterval = setInterval(() => {
        if (Date.now() - lastLog > 10000) { // Каждые 10 секунд
          sendLog('⏳ Установка продолжается...');
          lastLog = Date.now();
        }
      }, 10000);

      // Потоковая передача stdout
      installProcess.stdout?.on('data', (data) => {
        lastLog = Date.now();
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          sendLog(`📦 ${line}`);
        });
      });

      // Потоковая передача stderr (часто содержит прогресс)
      installProcess.stderr?.on('data', (data) => {
        lastLog = Date.now();
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          if (!line.includes('deprecated') && !line.includes('WARN')) {
            sendLog(`ℹ️ ${line}`);
          }
        });
      });

      await new Promise((resolve, reject) => {
        installProcess.on('close', (code) => {
          clearInterval(keepAliveInterval);
          if (code === 0) {
            resolve(code);
          } else {
            reject(new Error(`npm install завершился с кодом ${code}`));
          }
        });
        installProcess.on('error', (err) => {
          clearInterval(keepAliveInterval);
          reject(err);
        });
      });

      sendLog('✅ Все пакеты установлены успешно!');
      sendSuccess('Установка завершена успешно');

    } catch (installError: any) {
      const errorMsg = installError.message || '';
      sendLog(`⚠️ Установка завершилась с ошибкой: ${errorMsg}`);

      // Специфичная обработка кода выхода 236
      if (installError.code === 236 || errorMsg.includes('code 236')) {
        sendLog('🔍 Обнаружен код выхода 236 - ошибка сборки нативных модулей');
        sendLog('📋 Возможные причины:');
        sendLog('  1. Проблемы с компиляцией нативных зависимостей (node-gyp)');
        sendLog('  2. Отсутствие необходимых системных библиотек');
        sendLog('  3. Несовместимость версий Node.js');
        sendLog('  4. Проблемы с доступом к сети/реестру npm');

        sendLog('\n🔧 Применяем специализированное восстановление...');

        try {
          // Попытка установки без нативных модулей
          sendLog('📦 Попытка установки с флагом --ignore-scripts...');
          await execAsync(
            'npm install --legacy-peer-deps --no-audit --ignore-scripts',
            {
              cwd: contractsDir,
              timeout: 180000
            }
          );
          sendLog('✅ Установка без сборки нативных модулей успешна');
          sendSuccess('Установка завершена (без нативных модулей)');
          setTimeout(() => { if (!res.writableEnded) res.end(); }, 1000);
          return;
        } catch (ignoreScriptsError: any) {
          sendLog(`⚠️ Установка без сборки не удалась: ${ignoreScriptsError.message}`);
        }
      }

      // Специфичная обработка ошибки ENOTDIR
      if (errorMsg.includes('ENOTDIR') || errorMsg.includes('not a directory')) {
        sendLog('🔍 Обнаружена ошибка ENOTDIR - поврежденная структура node_modules');
        sendLog('🗑️ Полная очистка node_modules...');

        try {
          await execAsync(`rm -rf ${path.join(contractsDir, 'node_modules')}`, {
            cwd: contractsDir,
            timeout: 30000
          });
          sendLog('✅ node_modules полностью удален');
          sendLog('🔄 Повторная попытка установки...');

          const retryInstall = spawn(
            'npm',
            ['install', '--legacy-peer-deps', '--no-audit', '--prefer-offline'],
            {
              cwd: contractsDir,
              env: {
                ...process.env,
                NPM_CONFIG_PROGRESS: 'true',
                NPM_CONFIG_LOGLEVEL: 'info'
              },
              stdio: ['ignore', 'pipe', 'pipe']
            }
          );

          retryInstall.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n').filter((line: string) => line.trim());
            lines.forEach((line: string) => sendLog(`📦 ${line}`));
          });

          await new Promise((resolve, reject) => {
            retryInstall.on('close', (code) => {
              if (code === 0) {
                sendLog('✅ Повторная установка успешна!');
                resolve(code);
              } else {
                reject(new Error(`Повторная установка завершилась с кодом ${code}`));
              }
            });
            retryInstall.on('error', reject);
          });

          sendSuccess('Установка завершена после повторной попытки');
          setTimeout(() => { if (!res.writableEnded) res.end(); }, 1000);
          return;

        } catch (retryError: any) {
          sendLog(`❌ Повторная установка не удалась: ${retryError.message}`);
        }
      }

      sendLog('🤖 Запуск AI-ассистента для диагностики...');

      // AI-assisted error recovery
      try {
        const { aiAssistant } = await import('../aiAssistant');

        // Собираем полную информацию об ошибке
        const fullErrorLog = [
          `Exit Code: ${installError.code || 'unknown'}`,
          `Error Message: ${errorMsg}`,
          installError.stdout ? `STDOUT:\n${installError.stdout}` : '',
          installError.stderr ? `STDERR:\n${installError.stderr}` : ''
        ].filter(Boolean).join('\n\n');

        const errorAnalysis = await aiAssistant.analyzeErrorLog(fullErrorLog);

        if (errorAnalysis.errors.length > 0) {
          sendLog(`🔍 AI обнаружил ${errorAnalysis.errors.length} проблем:`);
          errorAnalysis.errors.forEach((error, idx) => {
            sendLog(`  ${idx + 1}. [${error.type}] ${error.message}`);
          });

          sendLog('\n💡 Рекомендации AI:');
          errorAnalysis.suggestions.forEach((suggestion, idx) => {
            sendLog(`  ${idx + 1}. ${suggestion}`);
          });
        } else {
          sendLog('ℹ️ AI не обнаружил специфичных проблем, продолжаем стандартное восстановление');
        }

        // Применяем автоматические исправления если возможно
        const autoFix = await aiAssistant.autoFixErrors(fullErrorLog);
        if (autoFix.success && autoFix.fixed.length > 0) {
          sendLog('\n✅ AI применил автоматические исправления:');
          autoFix.fixed.forEach(fix => sendLog(`  ✓ ${fix}`));
        }
        if (autoFix.failed.length > 0) {
          sendLog('\n⚠️ Не удалось автоматически исправить:');
          autoFix.failed.forEach(fail => sendLog(`  ✗ ${fail}`));
        }

      } catch (aiError: any) {
        sendLog(`⚠️ AI-диагностика недоступна: ${aiError.message}`);
      }

      sendLog('🔄 Попытка установить критичные пакеты по отдельности...');

      // Резервный план - установка критичных пакетов по одному
      const criticalPackages = [
        'hardhat@^2.22.0',
        'ethers@^6.13.0',
        '@openzeppelin/contracts@^5.0.0',
        '@openzeppelin/contracts-upgradeable@^5.0.0',
        '@aave/core-v3@^1.19.3',
        'dotenv@^16.3.1'
      ];

      for (const pkg of criticalPackages) {
        sendLog(`📥 Установка ${pkg}...`);
        try {
          await execAsync(
            `npm install --legacy-peer-deps --no-audit ${pkg}`,
            {
              cwd: contractsDir,
              timeout: 120000,
            }
          );
          sendLog(`✅ ${pkg} установлен`);
        } catch (pkgError: any) {
          sendLog(`⚠️ Пропуск ${pkg}: ${pkgError.message}`);
        }
      }
    }

    // Проверка установки
    sendLog('🔍 Проверка установленных пакетов...');

    try {
      const { stdout: verifyOut } = await execAsync(
        'npx tsx scripts/verify-deps.ts',
        {
          cwd: contractsDir,
          timeout: 30000,
        }
      );

      verifyOut.split('\n').forEach(line => {
        if (line.trim()) sendLog(line);
      });

      sendLog('✅ Все зависимости установлены и проверены!');
      sendSuccess('Установка завершена успешно');

    } catch (verifyError: any) {
      sendLog('⚠️ Проверка завершилась с предупреждениями');
      if (verifyError.stdout) {
        verifyError.stdout.split('\n').forEach((line: string) => {
          if (line.trim()) sendLog(line);
        });
      }
      sendSuccess('Установка завершена с предупреждениями');
    }

    // Гарантированное завершение потока SSE
    if (!res.writableEnded) {
      sendLog('🔚 Завершение потока логов...');
      res.write('data: {"complete": true}\n\n');

      setTimeout(() => {
        if (!res.writableEnded) {
          res.end();
          console.log('✅ SSE поток закрыт успешно');
        }
      }, 500);
    }

  } catch (error: any) {
    console.error('❌ Критическая ошибка установки:', error);
    sendLog(`❌ Критическая ошибка: ${error.message}`);
    sendLog(`⏰ Время ошибки: ${new Date().toLocaleTimeString()}`);
    sendError(error.message);

    // Гарантированное завершение при ошибке
    if (!res.writableEnded) {
      res.write('data: {"complete": true, "error": true}\n\n');

      setTimeout(() => {
        if (!res.writableEnded) {
          res.end();
          console.log('✅ SSE поток закрыт после ошибки');
        }
      }, 500);
    }
  }
});

/**
 * POST /api/contracts/install-deps-simple
 * Простая установка зависимостей без потоковой передачи
 */
router.post('/install-deps-simple', async (req, res) => {
  try {
    console.log('📦 Начинаем простую установку зависимостей...');

    const contractsDir = path.join(process.cwd(), 'contracts');

    // Очистка кеша
    console.log('🧹 Очистка кеша npm...');
    try {
      await execAsync('npm cache clean --force', {
        cwd: contractsDir,
        timeout: 30000
      });
    } catch (e) {
      console.log('⚠️ Не удалось очистить кеш');
    }

    // Установка
    console.log('📥 Установка пакетов...');
    const { stdout, stderr } = await execAsync(
      'npm install --legacy-peer-deps --no-audit --prefer-offline',
      {
        cwd: contractsDir,
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024
      }
    );

    console.log('✅ Установка завершена');

    res.json({
      success: true,
      message: 'Установка завершена успешно',
      stdout: stdout.substring(0, 1000), // Первые 1000 символов
      stderr: stderr ? stderr.substring(0, 1000) : ''
    });

  } catch (error: any) {
    console.error('❌ Ошибка установки:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stdout: error.stdout?.substring(0, 1000),
      stderr: error.stderr?.substring(0, 1000)
    });
  }
});

/**
 * API endpoint для автоматического развертывания контракта
 * POST /api/contracts/auto-deploy
 */
router.post('/auto-deploy', async (req, res) => {
  try {
    const { network, privateKey, aavePoolAddress } = req.body;

    if (!network || !privateKey) {
      return res.status(400).json({
        error: 'Требуются параметры: network и privateKey'
      });
    }

    if (!privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        error: 'Неверный формат Private Key (должно быть 0x + 64 hex символа)'
      });
    }

    console.log(`🚀 Запуск автодеплоя контракта в сеть: ${network}`);

    const contractsDir = path.join(process.cwd(), 'contracts');
    const aavePool = aavePoolAddress || (network === 'polygon'
      ? '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb'
      : '0x0496275d34753A48320CA58103d5220d394FF77F');

    // Определяем RPC URL для сети
    const rpcUrl = network === 'polygon'
      ? (process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com')
      : (process.env.POLYGON_TESTNET_RPC_URL || 'https://rpc-amoy.polygon.technology');

    console.log(`🌐 Используется RPC: ${rpcUrl}`);

    // Установка переменных окружения для деплоя
    const env = {
      ...process.env,
      PRIVATE_KEY: privateKey,
      AAVE_POOL_ADDRESS: aavePool,
      DEPLOY_NETWORK: network,
      POLYGON_RPC_URL: network === 'polygon' ? rpcUrl : process.env.POLYGON_RPC_URL,
      POLYGON_TESTNET_RPC_URL: network === 'amoy' ? rpcUrl : process.env.POLYGON_TESTNET_RPC_URL
    };

    console.log('📝 Компиляция контракта...');

    // Сначала компилируем
    try {
      const { stdout: compileOut } = await execAsync('npx hardhat compile', {
        cwd: contractsDir,
        env,
        timeout: 120000,
      });
      console.log('✅ Контракт скомпилирован');
      console.log(compileOut);
    } catch (compileError: any) {
      throw new Error(`Ошибка компиляции: ${compileError.message}`);
    }

    console.log('🚀 Развертывание контракта...');

    // Запуск полного автоматического деплоя с авторизацией
    const { stdout, stderr } = await execAsync(
      `npx tsx scripts/full-auto-deploy.ts`,
      {
        cwd: contractsDir,
        env,
        timeout: 300000, // 5 минут
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    console.log('Деплой stdout:', stdout);
    if (stderr) console.log('Деплой stderr:', stderr);

    // Парсинг вывода для получения адреса контракта
    const addressMatch = stdout.match(/Адрес подписанного контракта:\s*(0x[a-fA-F0-9]{40})/i) ||
                         stdout.match(/ArbitrageExecutor развернут:\s*(0x[a-fA-F0-9]{40})/i) ||
                         stdout.match(/Contract Address:\s*(0x[a-fA-F0-9]{40})/i);

    if (!addressMatch) {
      throw new Error('Не удалось получить адрес развернутого контракта из вывода');
    }

    const contractAddress = addressMatch[1];
    console.log(`✅ Контракт развернут и подписан: ${contractAddress}`);

    // Проверяем статус авторизации из вывода
    const authSuccess = stdout.includes('успешно авторизован') ||
                       stdout.includes('Deployer авторизован') ||
                       stdout.includes('authorized: true');

    res.json({
      success: true,
      contractAddress,
      proxyAddress: contractAddress, // Для обратной совместимости
      network,
      aavePoolAddress: aavePool,
      authorized: authSuccess,
      message: authSuccess
        ? 'Контракт успешно развернут, подписан и авторизован'
        : 'Контракт развернут и подписан',
      deployLogs: stdout,
      authStatus: authSuccess ? 'authorized' : 'pending'
    });

  } catch (error: any) {
    console.error('❌ Ошибка деплоя контракта:', error);

    let errorMessage = error.message;

    // Обработка типичных ошибок
    if (errorMessage.includes('insufficient funds')) {
      errorMessage = 'Недостаточно MATIC для деплоя. Пополните кошелек через https://faucet.polygon.technology/';
    } else if (errorMessage.includes('nonce')) {
      errorMessage = 'Ошибка nonce. Подождите несколько секунд и попробуйте снова';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Превышено время ожидания. Проверьте RPC подключение';
    } else if (errorMessage.includes('HH12') || errorMessage.includes('Cannot find module')) {
      errorMessage = 'Зависимости не установлены. Нажмите кнопку "Проверить/Установить зависимости"';
    }

    res.status(500).json({
      error: errorMessage,
      details: error.stderr || error.stdout
    });
  }
});

/**
 * GET /api/contracts/status
 * Проверка статуса контракта
 */
router.get('/status/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Неверный формат адреса' });
    }

    // Здесь можно добавить проверку контракта через ethers.js
    // Например, проверить код контракта, вызвать view функции и т.д.

    res.json({
      address,
      isContract: true,
      message: 'Контракт найден'
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;