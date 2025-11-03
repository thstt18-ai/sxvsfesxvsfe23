
# Настройка торговли на Polygon Amoy Testnet

## Быстрое исправление всех проблем

```bash
bash scripts/auto-fix-trading.sh
```

## Ручная настройка (если автоматическая не сработала)

### 1. Установка зависимостей

```bash
cd contracts
npm install
```

### 2. Развертывание контракта

```bash
npm run deploy:amoy
```

**Важно:** Скопируйте адрес контракта из консоли!

### 3. Настройка в интерфейсе

1. Откройте **Settings** → **Flash Loan Contract Address**
2. Вставьте адрес контракта из шага 2
3. Удалите старый адрес `0x794a61358D6845594F94dc1DB02A252b5b4814aD`

### 4. Настройка API ключей

Откройте **Settings** → **Trading Parameters** и добавьте:

- 1inch API Key (необязательно для тестнета)
- Другие необходимые ключи

### 5. Включение реальной торговли

В **Settings** → **Trading Parameters**:

- ✅ Включите `Enable Real Trading`
- ✅ Установите `ENABLE_LIVE_TRADING=true` в Secrets

### 6. Настройка торговых параметров

Рекомендуемые значения для тестнета:

```
Min Profit Percent: 0.5%
Min Net Profit Percent: 0.3%
Min Profit USD: $1
Max Slippage: 1%
Gas Price Multiplier: 1.1
```

## Проверка статуса

После настройки проверьте:

1. **Dashboard** → Статус бота должен быть "Running"
2. **Logs** → Не должно быть ошибок с контрактом
3. **Trading** → Должны появляться возможности для арбитража

## Типичные ошибки

### JsonRpcProvider failed to detect network

**Решение:** Проверьте RPC URL в Secrets:
```
POLYGON_TESTNET_RPC_URL=https://rpc-amoy.polygon.technology
```

### Contract not deployed

**Решение:** Запустите развертывание:
```bash
cd contracts && npm run deploy:amoy
```

### No trading opportunities

**Причины:**
- Недостаточно ликвидности на тестнете
- Слишком высокие требования к прибыли
- Не включена реальная торговля

**Решение:** Снизьте `Min Profit Percent` до 0.3-0.5%

## Получение тестовых токенов

1. Получите MATIC: https://faucet.polygon.technology/
2. Получите тестовый USDC через Aave Faucet
3. Убедитесь, что на балансе есть минимум 1 MATIC для gas

## Мониторинг

Следите за логами в реальном времени:

```bash
# В интерфейсе: Logs → Filter by "trade"
```

## Поддержка

Если проблемы сохраняются:

1. Проверьте все логи в разделе **Logs**
2. Убедитесь, что контракт развернут правильно
3. Проверьте баланс кошелька на тестнете
4. Убедитесь, что все Secrets настроены корректно
