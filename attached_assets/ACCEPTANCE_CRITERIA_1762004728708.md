
# Критерии Приёмки для Реальной Торговли

## 1. RiskManager - Контроль Рисков ✅

### Проверки перед каждой сделкой:
- ✅ Проверка LIVE-флага (`ENABLE_LIVE_TRADING`)
- ✅ Проверка максимального размера позиции (`MAX_POSITION_SIZE_USD`)
- ✅ Проверка дневного лимита убытков (`DAILY_LOSS_LIMIT_USD`)
- ✅ Проверка баланса MATIC для газа (`MIN_MATIC_RESERVE`)
- ✅ Проверка максимального убытка на сделку (`MAX_SINGLE_LOSS_USD`)

### Тестирование:
```bash
# 1. Попробуйте выполнить сделку с ENABLE_LIVE_TRADING=false
# Ожидание: Сделка отклонена

# 2. Попробуйте сделку больше MAX_POSITION_SIZE_USD
# Ожидание: Сделка отклонена

# 3. Уменьшите баланс MATIC ниже MIN_MATIC_RESERVE
# Ожидание: Сделка отклонена
```

## 2. TxGuard - Защита Транзакций ✅

### Проверки:
- ✅ Slippage ≤ 0.5% (настраивается через `MAX_SLIPPAGE_PERCENT`)
- ✅ Deadline для транзакций (`TX_DEADLINE_SECONDS`)
- ✅ Проверка revert перед отправкой (`CHECK_REVERT`)
- ✅ Единичный approve, не unlimited (`SINGLE_APPROVE`)

### Тестирование:
```bash
# 1. Проверьте, что slippage не превышает настроенный лимит
# Файл: server/txGuard.ts - метод validateTransaction

# 2. Проверьте, что approve делается на точную сумму
# Файл: server/txGuard.ts - метод createSafeApprove
```

## 3. LIVE-флаг - Глобальное Отключение ✅

### Переменная окружения:
```bash
ENABLE_LIVE_TRADING=false  # По умолчанию - безопасно
ENABLE_LIVE_TRADING=true   # Только для реальной торговли
```

### Проверка:
- ✅ Если `ENABLE_LIVE_TRADING != true`, все реальные сделки блокируются
- ✅ Работает независимо от настроек в БД
- ✅ Логируется в Activity Feed

## 4. ConfigLoader - Централизованная Конфигурация ✅

### Все параметры в .env:
```bash
# Риски
MAX_POSITION_SIZE_USD=50000
DAILY_LOSS_LIMIT_USD=500
MAX_SINGLE_LOSS_USD=100

# MATIC и газ
MIN_MATIC_RESERVE=0.5
MATIC_PRICE_USD=0.7
MAX_GAS_PRICE_GWEI=60

# Транзакции
MAX_SLIPPAGE_PERCENT=0.5
TX_DEADLINE_SECONDS=300

# Circuit Breaker
MAX_CONSECUTIVE_FAILURES=5
AUTO_PAUSE_ENABLED=true

# Комиссии
FLASH_LOAN_FEE_PERCENT=0.05
DEX_FEE_PERCENT=0.3
```

### API endpoints:
```bash
GET /api/config/risk          # Получить текущую конфигурацию
POST /api/config/reload       # Перезагрузить из .env
```

## 5. Trade Logger - CSV Аудит ✅

### Формат CSV:
```csv
Timestamp,Trade ID,Token In,Token Out,Amount In,Amount Out,Buy DEX,Sell DEX,Profit USD,Gas Cost USD,Net Profit USD,Net Profit %,TX Hash,Status,Error
```

### Расположение:
```bash
./logs/trades_YYYY-MM-DD.csv
```

### API endpoints:
```bash
GET /api/logs/trades/pnl       # Расчет общего PnL
GET /api/logs/trades/download  # Скачать CSV файл
```

### Пример расчета PnL:
```bash
curl http://localhost:5000/api/logs/trades/pnl
# Возвращает: { totalProfit, totalGas, netProfit, tradeCount }
```

## Критерии Приёмки (Обязательно!)

### Критерий 1: Проверка LIVE-флага
```bash
# Установите ENABLE_LIVE_TRADING=false
# Попробуйте выполнить реальную сделку
# ОЖИДАНИЕ: Сделка отклонена с сообщением "Реальная торговля отключена глобально"
```

### Критерий 2: Проверка баланса MATIC
```bash
# Установите MIN_MATIC_RESERVE=10.0 (больше текущего баланса)
# Попробуйте выполнить сделку
# ОЖИДАНИЕ: Сделка отклонена с сообщением "Недостаточно MATIC для газа"
```

### Критерий 3: Проверка slippage
```bash
# Установите MAX_SLIPPAGE_PERCENT=0.1
# Попробуйте сделку с высокой волатильностью
# ОЖИДАНИЕ: Сделка отклонена если slippage > 0.1%
```

### Критерий 4: Проверка CSV логирования
```bash
# Выполните несколько сделок (симуляция)
# Проверьте ./logs/trades_YYYY-MM-DD.csv
# ОЖИДАНИЕ: Все сделки залогированы с корректными данными
```

## Чек-лист перед запуском реальной торговли

- [ ] `.env` файл настроен с правильными лимитами
- [ ] `ENABLE_LIVE_TRADING=false` для тестирования
- [ ] Баланс MATIC > MIN_MATIC_RESERVE + запас на несколько сделок
- [ ] Приватный ключ в безопасном хранилище (Secrets)
- [ ] Контракт ArbitrageExecutor развернут
- [ ] Кошелек авторизован в контракте
- [ ] 1inch API ключ настроен
- [ ] Все 4 критерия приёмки пройдены
- [ ] Circuit breaker работает (протестирован)
- [ ] CSV логи создаются и читаются
- [ ] Telegram уведомления работают

## Переход в Production

### Шаг 1: Финальная проверка
```bash
# Проверьте конфигурацию
curl http://localhost:5000/api/config/risk

# Проверьте валидацию
# validation.valid должно быть true
```

### Шаг 2: Включение реальной торговли
```bash
# В Secrets установите:
ENABLE_LIVE_TRADING=true

# Перезагрузите конфигурацию:
curl -X POST http://localhost:5000/api/config/reload
```

### Шаг 3: Мониторинг
```bash
# Проверяйте логи каждые 10 минут
curl http://localhost:5000/api/logs/trades/pnl

# Следите за circuit breaker events
curl http://localhost:5000/api/risk/circuit-breaker-events
```

## Критические Предупреждения

⚠️ **НИКОГДА не устанавливайте ENABLE_LIVE_TRADING=true без прохождения всех критериев!**

⚠️ **ВСЕГДА проверяйте баланс MATIC перед началом торговли!**

⚠️ **ОБЯЗАТЕЛЬНО ведите мониторинг CSV логов!**

⚠️ **Circuit breaker должен быть настроен и протестирован!**
