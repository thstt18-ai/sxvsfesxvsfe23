
# Production Deployment Guide

## Архитектура

### Smart Contract Layer
- **UUPS Upgradeable Proxy** - обновления без миграции средств
- **Meta-TX Support (EIP-2771 + EIP-2612)** - gasless транзакции
- **Proof-of-Reserve** - hourly аудит резервов через Chainlink
- **Multi-sig Emergency Stop** - 2-of-3 мультиподпись для паузы

### Backend Layer
- **Encrypted Keystore** - безопасное хранение приватных ключей (вместо Ledger)
- **Prometheus Metrics** - мониторинг equity, win-rate, gas-spent, Sharpe
- **Rate Limiting** - защита от DDoS
- **Graceful Shutdown** - корректное завершение при ошибках

### Security Features
- **Circuit Breaker** - автоматическая остановка при аномалиях
- **Drawdown Monitor** - контроль просадки
- **Gas Price Guard** - защита от высоких цен на газ
- **Token Whitelist** - торговля только проверенными токенами

## Deployment Checklist

### 1. Настройка Secrets (обязательно!)
```
PRIVATE_KEY=0x... (66 символов)
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
POLYGON_TESTNET_RPC_URL=https://rpc-amoy.polygon.technology
ONEINCH_API_KEY=...
ARBITRAGE_CONTRACT=0x... (после деплоя)
```

### 2. Deploy контракта
```bash
cd contracts
npm install
npm run deploy:amoy  # Для testnet
# или
npm run deploy:polygon  # Для mainnet (ОСТОРОЖНО!)
```

### 3. Verify контракта
```bash
npx hardhat verify --network amoy <CONTRACT_ADDRESS>
```

### 4. Настройка мониторинга
- Prometheus metrics: `http://your-app.repl.co/metrics`
- Health check: `http://your-app.repl.co/api/health`

### 5. Тестирование
1. Запустите в режиме симуляции
2. Проверьте логи на ошибки
3. Выполните тестовую сделку
4. Проверьте баланс после сделки

## Production Best Practices

### Security
- ✅ Никогда не коммитьте приватные ключи в Git
- ✅ Используйте Replit Secrets для хранения ключей
- ✅ Включите 2FA на аккаунтах (Replit, 1inch, Alchemy)
- ✅ Регулярно проверяйте Proof-of-Reserve

### Risk Management
- ✅ Установите лимиты убытков (dailyLossLimit)
- ✅ Настройте emergency pause при просадке
- ✅ Используйте whitelist токенов
- ✅ Мониторьте gas prices

### Performance
- ✅ Используйте RPC с резервными fallback
- ✅ Настройте rate limiting для API
- ✅ Включите кэширование для часто используемых данных
- ✅ Мониторьте latency метрики

## Troubleshooting

### Contract not deployed
**Решение:** Разверните контракт через `npm run deploy:amoy`

### RPC connection failed
**Решение:** Проверьте RPC URL в Secrets, используйте публичные RPC

### Private key invalid
**Решение:** Убедитесь что ключ начинается с `0x` и имеет 66 символов

### Gas price too high
**Решение:** Увеличьте maxGasPriceGwei в Settings

## Monitoring & Alerts

### Prometheus Metrics
```
arbitrage_equity_usd - Current equity
arbitrage_win_rate - Win rate percentage
arbitrage_gas_spent_total - Total gas spent
arbitrage_sharpe_ratio - Sharpe ratio
arbitrage_trade_latency_ms - Trade latency
```

### Telegram Alerts
Настройте Telegram бота для получения:
- Уведомлений о прибыльных сделках
- Алертов о критических ошибках
- Ежедневных отчетов

## Upgrade Process

### Contract Upgrade (UUPS)
```bash
cd contracts
npm run upgrade
```

### Application Update
```bash
git pull
npm install
npm run dev
```

## Disaster Recovery

### Emergency Stop
1. Откройте Dashboard
2. Нажмите "Emergency Stop"
3. Подтвердите остановку

### Withdraw Funds
```bash
cd contracts
npx hardhat run scripts/emergency-withdraw.ts --network amoy
```

## Cost Estimation

### Gas Costs (Polygon)
- Contract deployment: ~0.5 MATIC
- Authorization: ~0.01 MATIC
- Flash loan execution: ~0.1-0.5 MATIC per trade
- Monthly (100 trades): ~10-50 MATIC

### API Costs
- 1inch API: Free tier (до 100 req/min)
- Alchemy RPC: Free tier (до 300M compute units/month)
- Replit: Core subscription recommended for production

## Support

- GitHub Issues: https://github.com/your-repo/issues
- Telegram: @your_support_bot
- Email: support@your-domain.com
