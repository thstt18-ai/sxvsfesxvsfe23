# DeFi Arbitrage Bot - Replit Project

## Обзор
Production-ready арбитражный бот для DeFi с поддержкой flash loans, multi-DEX интеграции, AI ассистента и **ONE-CLICK DEPLOYMENT**.

## Последние изменения
- **2025-11-03**: Initial Replit setup
  - Настроена PostgreSQL база данных
  - Запущен dev-server на порту 5000
  - Добавлена автоподпись контрактов (encrypted keystore + Meta-TX)
  - Убраны зависимости от Ledger и GUI

## Архитектура проекта

### Основные компоненты
- **Frontend**: React + Vite + TypeScript (порт 5000)
- **Backend**: Express + TypeScript (порт 5000, совмещен с frontend)
- **Database**: PostgreSQL (Neon) через Drizzle ORM
- **Contracts**: Hardhat + Solidity 0.8.24 (UUPS upgradeable)
- **Blockchain**: Polygon Mainnet / Amoy Testnet

### Структура директорий
```
/
├── client/          # React фронтенд
├── server/          # Express бэкенд
├── contracts/       # Solidity смарт-контракты
├── shared/          # Общие типы и схемы
├── migrations/      # Drizzle миграции БД
└── packages/        # Дополнительные модули (AI, core)
```

## Настройка и запуск

### 1. Переменные окружения (Secrets)
Обязательные:
- `DATABASE_URL` - автоматически настроен Replit
- `POLYGON_TESTNET_RPC_URL` = `https://rpc-amoy.polygon.technology`
- `PRIVATE_KEY` = `0x...` (66 символов, ваш MetaMask ключ)
- `ONEINCH_API_KEY` = получите на https://portal.1inch.dev/

Опциональные:
- `TELEGRAM_BOT_TOKEN` - для уведомлений
- `TELEGRAM_CHAT_ID` - ID чата для уведомлений
- `POLYGONSCAN_API_KEY` - для верификации контрактов

### 2. Развертывание контракта
```bash
cd contracts
npm install --legacy-peer-deps
npm run deploy:amoy
```

Скопируйте адрес контракта и добавьте в Settings → Network → Flash Loan Contract Address

### 3. Запуск приложения
```bash
npm run dev  # Запускается автоматически через workflow
```

Приложение доступно на http://0.0.0.0:5000

## Автоподпись контрактов

### Encrypted Keystore (без Ledger)
Используется зашифрованное хранилище ключей для автоподписи:

```bash
# Testnet
cd contracts
npm run ci:sign:amoy

# Mainnet
npm run ci:sign:polygon
```

### Meta-TX (Gasless транзакции)
Поддержка EIP-2771 и EIP-2612 для транзакций без MATIC:
- Релейер оплачивает gas
- Нет необходимости в approve транзакциях
- Работает через Trusted Forwarder

## Основные функции

### Торговля
- **Flash Loans**: Aave V3 интеграция
- **DEX Aggregation**: 1inch, Uniswap V3, QuickSwap
- **Auto-optimization**: 24h интервал
- **Risk Management**: Лимиты убытков, slippage protection

### Мониторинг
- **Dashboard**: Реальное время метрики
- **Logs**: Детальные логи активности
- **Transactions**: История сделок
- **Prometheus**: Экспорт метрик на `/metrics`

### Безопасность
- **UUPS Proxy**: Обновляемый контракт без миграции средств
- **Proof-of-Reserve**: Ежечасная проверка резервов
- **Kill Switch**: Аварийная остановка
- **Encrypted Keys**: Безопасное хранение приватных ключей

## Производственные функции
✅ UUPS-upgradeable proxy
✅ Meta-TX (EIP-2771 + EIP-2612) - gasless
✅ Encrypted keystore - безопасное хранение ключей
✅ Proof-of-Reserve - hourly проверка
✅ Prometheus metrics - equity, win-rate, gas-spent
✅ Contract size guard - предупреждение >24 KB
✅ No GUI errors - работает через HTTP + Monaco editor

## Пользовательские предпочтения

### Стиль кодирования
- TypeScript strict mode: отключен (для совместимости)
- ESM modules (type: "module" в package.json)
- Async/await для асинхронных операций
- Drizzle ORM для работы с БД

### Workflow
- Один workflow: `dev-server` (frontend + backend на порту 5000)
- Hot reload через Vite HMR
- Автоматический restart после изменений

## Известные проблемы и решения

### HHE10 Error
❌ **Проблема**: Попытка инициализировать новый Hardhat проект в существующей директории
✅ **Решение**: НЕ запускать `npx hardhat init` - проект уже настроен в `contracts/hardhat.config.ts`

### Database "relation users does not exist"
❌ **Проблема**: Таблицы БД не созданы
✅ **Решение**: `npm run db:push`

### tsx not found
❌ **Проблема**: Зависимости не установлены
✅ **Решение**: `npm install` в корневой директории

## Полезные команды

```bash
# Разработка
npm run dev                    # Запуск dev сервера
npm run db:push               # Синхронизация схемы БД

# Контракты
cd contracts
npm run compile               # Компиляция контрактов
npm run deploy:amoy          # Деплой в testnet
npm run deploy:polygon       # Деплой в mainnet
npm run size-check           # Проверка размера контрактов

# Автоподпись
npm run ci:sign:amoy         # Подписать транзакцию (testnet)
npm run ci:sign:broadcast:amoy  # Подписать и отправить (testnet)

# Утилиты
npm run balance              # Проверка баланса
npm run health               # Мониторинг здоровья системы
```

## Ресурсы
- [Trading Setup](TRADING_SETUP.md)
- [Testnet Setup](TESTNET_TRADING_SETUP.md)
- [Full Trade Flow](FULL_TRADE_FLOW.md)
- [Gasless Trading](GASLESS_TRADING.md)

## Поддержка
Для вопросов и issues используйте GitHub или документацию проекта.
