# 🤖 AI Agent Prompt - Доработка Flash Loan Arbitrage Bot для Реальной Торговли

## 📋 Контекст Проекта

Вы работаете с **Flash Loan Arbitrage Trading Bot** - полнофункциональной платформой для автоматической арбитражной торговли на Polygon с использованием flash loans. Репозиторий полностью клонирован из GitHub и развернут на Replit с PostgreSQL базой данных.

**Текущий статус:** ✅ Backend работает, Database инициализирована, все модули загружены  
**Проблема:** Frontend требует доработки для полноценной торговли

---

## 🎯 Ваши Задачи (По Приоритету)

### ✅ ЗАДАЧА 1: Исправить Dashboard (Главная Страница)

**Проблема:** Dashboard (главная страница `/`) не отображается корректно

**Что нужно сделать:**

1. **Проверить маршрутизацию:**
   - Файл: `client/src/App.tsx`
   - Убедиться что маршрут `/` правильно настроен на `<Dashboard />`
   - Проверить что компонент импортирован

2. **Проверить компонент Dashboard:**
   - Файл: `client/src/pages/dashboard.tsx` (21KB)
   - Проверить на ошибки рендеринга
   - Убедиться что все hooks корректны
   - Проверить API calls (`/api/bot/status`, `/api/bot/config`)

3. **Добавить Bot Control Panel:**
   Создать компонент с кнопками управления ботом:
   ```tsx
   <BotControlPanel>
     <StatusIndicator status={isRunning ? 'running' : 'stopped'} mode={isLive ? 'live' : 'simulation'} />
     
     <Button onClick={startDemo}>
       ▶️ Start Demo Mode
     </Button>
     
     <Button onClick={startLive} variant="destructive" disabled={!hasApiKeys}>
       ▶️ Start Live Trading
     </Button>
     
     <Button onClick={pause} variant="secondary">
       ⏸️ Pause
     </Button>
     
     <Button onClick={emergencyStop} variant="destructive">
       ⛔ Emergency Stop
     </Button>
   </BotControlPanel>
   ```

4. **Добавить Live Event Log:**
   PowerShell-style лог с real-time событиями:
   ```tsx
   <LiveEventLog>
     {/* Цветовая индикация по типу: */}
     <LogEntry type="success">✅ Trade executed: +$12.34</LogEntry>
     <LogEntry type="info">ℹ️ Scanning DEX prices...</LogEntry>
     <LogEntry type="warning">⚠️ Gas price high: 150 Gwei</LogEntry>
     <LogEntry type="error">❌ Error: Insufficient liquidity</LogEntry>
   </LiveEventLog>
   ```

   Использовать WebSocket для real-time updates:
   ```typescript
   const ws = new WebSocket('ws://localhost:5000/ws');
   ws.onmessage = (event) => {
     const log = JSON.parse(event.data);
     addLogEntry(log);
   };
   ```

---

### ✅ ЗАДАЧА 2: Исправить AI Assistant Page

**Проблема:** Страница `/ai-assistant` не открывается

**Что нужно сделать:**

1. **Проверить routing:**
   ```tsx
   // client/src/App.tsx
   <Route path="/ai-assistant" component={AIAssistant} />
   ```

2. **Проверить компонент:**
   - Файл: `client/src/pages/ai-assistant.tsx` (39KB)
   - Проверить импорты
   - Проверить hooks и state management
   - Проверить API endpoints (`/api/ai/...`)

3. **Проверить server endpoints:**
   - Файл: `server/routes.ts`
   - Убедиться что AI endpoints существуют
   - Проверить `server/aiAssistant.ts` (27KB)

---

### ✅ ЗАДАЧА 3: Оптимизировать Торговые Параметры

**Проблема:** Текущие параметры не оптимизированы для реальной торговли

**Что изменить в `server/configLoader.ts`:**

```typescript
// ТОРГОВЫЕ ПАРАМЕТРЫ (Оптимизированные для Polygon)
export const OPTIMIZED_TRADING_CONFIG = {
  // Минимальная прибыль для входа в сделку
  MIN_PROFIT_PERCENT: 1.0,         // 1% минимум (было 0.5%)
  
  // Минимальная чистая прибыль после газа
  MIN_NET_PROFIT_PERCENT: 0.5,     // 0.5% чистой прибыли (было 0.3%)
  
  // Минимальная чистая прибыль в USD
  MIN_NET_PROFIT_USD: 5.0,         // $5 минимум (было $2)
  
  // Размер Flash Loan
  FLASH_LOAN_AMOUNT_USD: 2000,     // $2000 стартовый (было $1000)
  
  // Интервал сканирования
  SCAN_INTERVAL_SECONDS: 45,       // 45 сек (было 30 сек - слишком часто)
  
  // УПРАВЛЕНИЕ РИСКАМИ (Консервативные для начала)
  MAX_POSITION_SIZE_USD: 10000,    // $10k максимум (было $50k)
  DAILY_LOSS_LIMIT_USD: 200,       // $200/день максимум (было $500)
  MAX_SINGLE_LOSS_USD: 50,         // $50 на сделку (было $100)
  
  // POLYGON SPECIFIC
  MIN_MATIC_RESERVE: 1.0,          // 1 MATIC резерв (было 0.5)
  MAX_GAS_PRICE_GWEI: 200,         // 200 Gwei для Polygon (было 60)
  
  // БЕЗОПАСНОСТЬ ТРАНЗАКЦИЙ
  MAX_SLIPPAGE_PERCENT: 0.3,       // 0.3% slippage (было 0.5%)
  TX_DEADLINE_SECONDS: 180,        // 3 минуты (было 5 минут)
};
```

**Обоснование изменений:**
- ✅ Выше thresholds = меньше убыточных сделок
- ✅ Больше MATIC резерв = всегда есть газ
- ✅ Polygon часто имеет high gas спайки = нужен выше лимит
- ✅ Консервативные risk limits для начала
- ✅ Меньше slippage = меньше потерь на проскальзывании

---

### ✅ ЗАДАЧА 4: Добавить Trading Mode Controls

**Что добавить в Dashboard:**

1. **Mode Selector:**
   ```tsx
   <ModeSelector>
     <ModeButton 
       active={mode === 'simulation'} 
       onClick={() => setMode('simulation')}
     >
       🎮 Simulation Mode
       <Badge>Safe</Badge>
     </ModeButton>
     
     <ModeButton 
       active={mode === 'live'} 
       onClick={() => setMode('live')}
       disabled={!hasApiKeys}
     >
       💰 Live Trading
       <Badge variant="destructive">Real Money</Badge>
     </ModeButton>
   </ModeSelector>
   ```

2. **Pre-flight Check (перед Live):**
   ```tsx
   function checkReadyForLive() {
     const checks = [
       { name: 'Private Key', status: !!privateKey },
       { name: '1inch API Key', status: !!oneinchKey },
       { name: 'Contract Deployed', status: !!contractAddress },
       { name: 'MATIC Balance > 1', status: maticBalance > 1 },
       { name: 'All Acceptance Tests', status: testsPass },
     ];
     
     return checks.every(c => c.status);
   }
   ```

3. **Confirmation Dialog:**
   ```tsx
   <AlertDialog>
     <AlertDialogTitle>
       ⚠️ Switch to LIVE Trading?
     </AlertDialogTitle>
     <AlertDialogDescription>
       This will use REAL MONEY. Make sure:
       - You've tested in simulation
       - You understand the risks
       - You've set conservative limits
       
       Current Limits:
       - Max Daily Loss: ${dailyLossLimit}
       - Max Single Loss: ${singleLossLimit}
       - MATIC Reserve: {maticReserve}
     </AlertDialogDescription>
     <AlertDialogAction onClick={enableLiveTrading}>
       I Understand - Start Live Trading
     </AlertDialogAction>
   </AlertDialog>
   ```

---

### ✅ ЗАДАЧА 5: Улучшить Trade Page

**Файл:** `client/src/pages/trade.tsx`

**Что добавить:**

1. **DEX Swap Interface:**
   ```tsx
   <Card>
     <CardHeader>
       <CardTitle>DEX Swap</CardTitle>
     </CardHeader>
     <CardContent>
       <TokenSelect label="From" tokens={POLYGON_TOKENS} />
       <AmountInput label="Amount" />
       <SwapIcon />
       <TokenSelect label="To" tokens={POLYGON_TOKENS} />
       <QuoteDisplay 
         quote={quote} 
         priceImpact={priceImpact}
         route={route}
       />
       <Button onClick={executeSwap}>
         Swap Tokens
       </Button>
     </CardContent>
   </Card>
   ```

2. **Arbitrage Opportunities Panel:**
   ```tsx
   <Card>
     <CardHeader>
       <CardTitle>Live Arbitrage Opportunities</CardTitle>
       <RefreshButton onClick={scanOpportunities} />
     </CardHeader>
     <CardContent>
       {opportunities.map(opp => (
         <OpportunityCard key={opp.id}>
           <TokenPair>
             {opp.tokenIn} / {opp.tokenOut}
           </TokenPair>
           <ProfitBadge profit={opp.profitPercent}>
             +{opp.profitPercent}%
           </ProfitBadge>
           <DEXRoute>
             Buy: {opp.buyDex} → Sell: {opp.sellDex}
           </DEXRoute>
           <MetricsRow>
             <Metric label="Est. Profit" value={`$${opp.profitUsd}`} />
             <Metric label="Gas Cost" value={`$${opp.gasCost}`} />
             <Metric label="Net Profit" value={`$${opp.netProfit}`} />
           </MetricsRow>
           <Button 
             onClick={() => executeTrade(opp)}
             disabled={!opp.isExecutable}
           >
             Execute Trade
           </Button>
         </OpportunityCard>
       ))}
     </CardContent>
   </Card>
   ```

3. **Flash Loan Panel:**
   ```tsx
   <Card>
     <CardHeader>
       <CardTitle>Flash Loan Arbitrage</CardTitle>
     </CardHeader>
     <CardContent>
       <Input 
         label="Flash Loan Amount (USD)" 
         value={flashLoanAmount}
         onChange={setFlashLoanAmount}
       />
       <Select label="Protocol">
         <SelectItem value="aave-v2">Aave V2</SelectItem>
         <SelectItem value="aave-v3">Aave V3</SelectItem>
       </Select>
       <ArbitragePathDisplay path={arbitragePath} />
       <ProfitCalculator 
         loanAmount={flashLoanAmount}
         loanFee={0.05}
         dexFees={dexFees}
         gasEstimate={gasEstimate}
       />
       <Button onClick={executeFlashLoan}>
         Execute Flash Loan Arbitrage
       </Button>
     </CardContent>
   </Card>
   ```

---

### ✅ ЗАДАЧА 6: Добавить Live Log Component

**Создать:** `client/src/components/LiveLogPanel.tsx`

```tsx
import { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'success' | 'info' | 'warning' | 'error';
  message: string;
  details?: any;
}

export function LiveLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket for real-time logs
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onmessage = (event) => {
      const log = JSON.parse(event.data);
      setLogs(prev => [log, ...prev].slice(0, 500)); // Keep last 500
    };

    wsRef.current = ws;
    
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const getLevelIcon = (level: string) => {
    switch(level) {
      case 'success': return '✅';
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '•';
    }
  };

  const getLevelColor = (level: string) => {
    switch(level) {
      case 'success': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'info': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'warning': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'error': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-mono">Live Event Log</CardTitle>
        <div className="flex gap-2">
          <Badge 
            variant="outline" 
            className={autoScroll ? 'bg-primary/10' : ''}
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? '📌 Auto-scroll' : '⏸️ Paused'}
          </Badge>
          <Badge variant="outline" onClick={() => setLogs([])}>
            🗑️ Clear
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea ref={scrollRef} className="h-96">
          <div className="p-4 space-y-2 font-mono text-sm">
            {logs.map((log) => (
              <div 
                key={log.id}
                className={`p-2 rounded-md border ${getLevelColor(log.level)}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">{getLevelIcon(log.level)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {log.level.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-1">{log.message}</p>
                    {log.details && (
                      <pre className="mt-2 text-xs opacity-70 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
```

**Использование в Dashboard:**
```tsx
import { LiveLogPanel } from '@/components/LiveLogPanel';

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <BotControlPanel />
  <LiveLogPanel />
</div>
```

---

## 📚 Важные Файлы для Изучения

### Backend:
- `server/routes.ts` (2700+ строк) - Все API endpoints
- `server/opportunityScanner.ts` - Логика поиска арбитража
- `server/tradeExecutor.ts` - Выполнение сделок
- `server/riskManager.ts` - Управление рисками
- `server/configLoader.ts` - Конфигурация

### Frontend:
- `client/src/pages/dashboard.tsx` - Главная страница
- `client/src/pages/trade.tsx` - Торговая панель
- `client/src/pages/ai-assistant.tsx` - AI ассистент
- `client/src/App.tsx` - Routing

### Shared:
- `shared/schema.ts` - Database schema (24KB)

### Documentation:
- `IMPLEMENTATION_STATUS.md` - Текущий статус
- `ACCEPTANCE_CRITERIA.md` - Критерии приёмки
- `TRADING_SETUP.md` - Инструкция по настройке

---

## 🔍 Проверка Работы

### После каждой задачи:

1. **Перезапустить workflow:**
   ```bash
   npm run dev
   ```

2. **Проверить в браузере:**
   - Открыть https://[your-repl].replit.dev
   - Проверить что страница загружается
   - Проверить console на ошибки
   - Протестировать функциональность

3. **Проверить API:**
   ```bash
   curl http://localhost:5000/api/bot/status
   curl http://localhost:5000/api/bot/config
   curl http://localhost:5000/api/health/metrics
   ```

4. **Проверить логи:**
   ```bash
   tail -f logs/trades_*.csv
   ```

---

## ⚠️ Важные Напоминания

1. **Безопасность:**
   - НЕ коммитить приватные ключи
   - Все секреты только в Replit Secrets
   - ENABLE_LIVE_TRADING=false по умолчанию

2. **Тестирование:**
   - Всегда тестировать в Simulation перед Live
   - Проверять все Acceptance Criteria
   - Мониторить логи постоянно

3. **Performance:**
   - Использовать WebSocket для real-time
   - Кэшировать где возможно
   - Оптимизировать SQL запросы

4. **UI/UX:**
   - Следовать design_guidelines.md
   - Использовать Shadcn компоненты
   - Поддерживать dark mode
   - Добавлять data-testid атрибуты

---

## 🎯 Критерии Успеха

✅ **Dashboard работает и отображается**  
✅ **AI Assistant страница открывается**  
✅ **Есть кнопки Start Demo / Start Live**  
✅ **Live Log показывает события в реальном времени**  
✅ **Trade page имеет DEX Swap, Arbitrage, Flash Loan секции**  
✅ **Оптимизированные параметры в configLoader**  
✅ **Все критичные LSP ошибки исправлены**  
✅ **Приложение работает в режиме симуляции**

---

## 🚀 Начните с Задачи 1

Исправьте Dashboard и добавьте Bot Control Panel с кнопками управления. Это самое важное для пользователя!

**Удачи!** 🎉
