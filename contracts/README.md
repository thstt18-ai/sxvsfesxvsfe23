
# 🔐 Arbitrage Smart Contracts

Смарт-контракты для исполнения арбитражных сделок через Aave V3 Flash Loans.

## 📦 Установка

### Быстрая установка (рекомендуется)

```bash
cd contracts
npm install --legacy-peer-deps
```

### Установка отдельных модулей (если нужно)

Если у вас возникают проблемы с зависимостями, установите их по отдельности:

```bash
# Основные зависимости
npm install --save-dev hardhat@^2.19.4 --legacy-peer-deps
npm install --save-dev typescript@^5.3.3 ts-node@^10.9.2 --legacy-peer-deps

# TypeChain для генерации типов
npm install --save-dev @typechain/hardhat@^9.1.0 --legacy-peer-deps
npm install --save-dev @typechain/ethers-v5@^10.2.1 --legacy-peer-deps
npm install --save-dev @typechain/ethers-v6@^0.5.1 --legacy-peer-deps
npm install --save-dev typechain@^8.3.2 --legacy-peer-deps

# Плагины Hardhat
npm install --save-dev hardhat-contract-sizer@^2.10.0 --legacy-peer-deps
npm install --save-dev @openzeppelin/hardhat-upgrades@^3.5.0 --legacy-peer-deps
```

### Компиляция контрактов

```bash
# Компиляция с генерацией TypeChain типов
npx hardhat compile

# Проверка размера контрактов
npm run size
```

## 🚀 Развертывание

### 1. Настройте переменные окружения

В корне проекта (или в Replit Secrets) добавьте:

```bash
PRIVATE_KEY=0x... # Ваш приватный ключ
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_TESTNET_RPC_URL=https://rpc-amoy.polygon.technology
POLYGONSCAN_API_KEY=... # Для верификации (опционально)
```

### 2. Разверните контракт

**Testnet (Amoy):**
```bash
npm run deploy:amoy
```

**Mainnet (Polygon):**
```bash
npm run deploy:polygon
```

### 3. Сохраните адрес контракта

После развертывания скопируйте адрес контракта и добавьте в Secrets:

```bash
ARBITRAGE_CONTRACT=0x...
```

### 4. Авторизуйте кошелек для исполнения

```bash
npx tsx scripts/authorize-executor.ts <CONTRACT_ADDRESS> <EXECUTOR_WALLET_ADDRESS>
```

Где:
- `CONTRACT_ADDRESS` - адрес развернутого ArbitrageExecutor
- `EXECUTOR_WALLET_ADDRESS` - адрес кошелька, который будет исполнять сделки

### 5. Проверьте авторизацию

```bash
npx tsx scripts/check-authorization.ts <CONTRACT_ADDRESS> <EXECUTOR_WALLET_ADDRESS>
```

## 🔍 Верификация контракта

```bash
npx hardhat verify --network polygon <CONTRACT_ADDRESS> <POOL_ADDRESS_PROVIDER>
```

Где `POOL_ADDRESS_PROVIDER`:
- Polygon Mainnet: `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
- Polygon Amoy Testnet: `0x0496275d34753A48320CA58103d5220d394FF77F`

## 📋 Важные адреса

### Polygon Mainnet (ChainID: 137)
- Aave Pool Provider: `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
- USDC: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- WMATIC: `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`

### Polygon Amoy Testnet (ChainID: 80002)
- Aave Pool Provider: `0x0496275d34753A48320CA58103d5220d394FF77F`

## 🛡️ Безопасность

- **Только Owner** может авторизовать новых исполнителей
- **Только авторизованные кошельки** могут исполнять сделки
- Контракт использует Flash Loan - не требует предварительных депозитов
- Автоматическая проверка минимальной прибыли перед исполнением

## 📊 Мониторинг

После развертывания вы можете отслеживать контракт на:
- **Mainnet:** https://polygonscan.com/address/<CONTRACT_ADDRESS>
- **Testnet:** https://amoy.polygonscan.com/address/<CONTRACT_ADDRESS>
