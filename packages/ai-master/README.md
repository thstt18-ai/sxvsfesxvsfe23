
# 🧠 AI Code Master

Production-Ready Blockchain Engineering Assistant, встроенный в основное меню Flash Loan Arbitrage Bot.

## Возможности

### 🔍 Анализ кода
- Автоматический анализ Solidity, TypeScript, JavaScript файлов
- Обнаружение security issues, code quality проблем
- Метрики кода: complexity, maintainability index, lines of code
- Проверка на UUPS upgradeable patterns, Meta-TX compatibility

### ✏️ Monaco Editor
- Полнофункциональный редактор кода с syntax highlighting
- Dark theme (MUI-совместимый)
- Автодополнение, minimap, line numbers
- Real-time редактирование с сохранением изменений

### 🤖 AI Fix
- Автоматическое исправление найденных проблем
- Удаление debug логов (console.log, debugger)
- Форматирование кода с Prettier
- Добавление "use strict"
- Исправление security issues

### 💾 Save & Commit
- Применение изменений к файлам проекта
- Автоматический git commit с сообщением "AI: <описание>"
- Логирование всех операций в `agent.log`
- Activity log в базе данных

### 📊 Production-Ready Features

#### UUPS Upgradeable Proxy
- Автоматическая трансформация контрактов в upgradeable pattern
- Проверка storage layout diff
- Bytecode size guard (предупреждение при >24 KB)

#### Meta-Transactions (EIP-2771 + EIP-2612)
- Интеграция Trusted Forwarder
- Permit-based approvals без отдельных транзакций
- Пользователь не платит за gas

#### Ledger Integration
- WebHID / WebUSB для браузерного фронтенда
- Hardware-signed transactions
- CI pipeline с Ledger signing

#### Chainlink Proof-of-Reserve
- Ежечасная верификация ликвидности пулов
- Автоматическая приостановка торговли при подозрительной активности

#### Security & Testing
- Foundry + Slither CI pipeline
- Автоматический fail при high/critical issues
- Storage layout diff проверки
- Mainnet deployment gate с ручным approve

#### Monitoring
- Prometheus metrics endpoint `/metrics`
- Ключевые показатели: equity_usd, win_rate_ratio, gas_spent_total, sharpe_ratio_30d

## Использование

### Команды в чате

```
"Анализируй код" - запустить анализ текущего файла
"Исправь проблемы" - AI Fix для автоматического исправления
"Сделай контракт upgradeable" - трансформация в UUPS proxy
"Добавь Meta-TX" - интеграция EIP-2771 + EIP-2612
"Интегрируй Ledger" - добавление WebHID/WebUSB
"Покажи дерево проекта" - структура файлов
```

### Workflow

1. **Загрузить файл** - через кнопку "Загрузить" или drag & drop
2. **Анализ** - нажать "Анализировать" или команда в чате
3. **AI Fix** - автоматическое исправление проблем
4. **Редактирование** - Monaco Editor с real-time изменениями
5. **Save & Commit** - ввести commit message и нажать кнопку

## Логи

Все операции логируются в `packages/ai-master/agent.log`:

```
[2025-11-02T03:00:00.000Z] COMMIT: AI: Fixed security issues in ArbitrageExecutor.sol | Files: contracts/ArbitrageExecutor.sol
[2025-11-02T03:01:00.000Z] ANALYSIS: contracts/ArbitrageExecutor.sol | Issues: 3 | Complexity: 12
[2025-11-02T03:02:00.000Z] FIX: Removed 5 console.log statements
```

## API Endpoints

### `POST /api/ai/analyze-file`
Анализ одного файла

### `POST /api/ai/auto-fix`
Автоматическое исправление проблем

### `POST /api/ai/edit-file`
Редактирование файла по инструкции

### `POST /api/ai/apply-edits`
Применение изменений к нескольким файлам

### `POST /api/ai/git-commit`
Git commit изменений

### `GET /api/ai/project-tree`
Получить дерево проекта

### `GET /api/ai/limits`
Получить лимиты API использования

## Требования

- Node.js 18+
- Git
- Prettier (для форматирования)
- Monaco Editor React

## Безопасность

- Все файловые операции проходят проверку на path traversal
- Rate limiting: 20 запросов в минуту
- Логирование всех операций
- Sandbox для выполнения кода

## Production Checklist

- [ ] UUPS upgradeable proxy
- [ ] Meta-TX (EIP-2771 + EIP-2612)
- [ ] Ledger integration (WebHID/WebUSB)
- [ ] Chainlink Proof-of-Reserve
- [ ] Foundry + Slither CI
- [ ] Bytecode size guard
- [ ] Storage layout diff
- [ ] Mainnet deployment gate
- [ ] Prometheus metrics
- [ ] Hardware-signed CI artifacts
