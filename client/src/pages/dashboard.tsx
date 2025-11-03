import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Activity, TrendingUp, Percent, Fuel, DollarSign, Shield, Play, Square, AlertTriangle, Terminal, Search, Download, Trash2, CheckCircle2, AlertCircle, Info, XCircle, BarChart3, Zap, Clock } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ActivityFeed } from "@/components/activity-feed";
import { TelegramMessagesPanel } from "@/components/telegram-messages-panel";
import { OpenPositionsPanel } from "@/components/open-positions-panel";
import { PotentialOpportunitiesPanel } from "@/components/potential-opportunities-panel";
import { ErrorLogsDetailed } from "@/components/error-logs-detailed";
import { PerformanceAnalytics } from "@/components/performance-analytics";
import { RealTradingStatus } from "@/components/real-trading-status";
import { TradingHealthDashboard } from "@/components/trading-health-dashboard";
import { cn } from "@/lib/utils";
import type { BotStatus, BotConfig, ArbitrageTransaction } from "@shared/schema";

import { MetricCard } from "@/components/metric-card";
import BotControls from "@/components/bot-controls";

interface ActivityLog {
  id: number;
  userId: string;
  type: string;
  level: string;
  message: string;
  metadata?: any;
  createdAt: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [showRealTradingDialog, setShowRealTradingDialog] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  const { data: botStatus, isLoading: statusLoading, error: statusError } = useQuery<BotStatus>({
    queryKey: ["/api/bot/status"],
    refetchInterval: 5000,
  });

  // Показываем ошибку если есть
  useEffect(() => {
    if (statusError) {
      console.error("Error loading bot status:", statusError);
    }
  }, [statusError]);

  const { data: config, isLoading: configLoading } = useQuery<BotConfig>({
    queryKey: ["/api/bot/config"],
  });

  const { data: recentTransactions } = useQuery<ArbitrageTransaction[]>({
    queryKey: ["/api/arbitrage/transactions"],
  });

  const { data: logs } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
    refetchInterval: 5000,
  });

  const { data: walletData } = useQuery({
    queryKey: ['/api/wallet/balance'],
    refetchInterval: 10000,
  });

  const maticBalance = Number(walletData?.maticBalance || 0);
  const usdcBalance = Number(walletData?.usdcBalance || 0);
  const wethBalance = Number(walletData?.wethBalance || 0);

  // WebSocket for real-time logs
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'activity_log' && data.data) {
          const log = data.data;
          const timestamp = new Date(log.createdAt).toLocaleString('ru-RU');
          const levelIcon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : log.level === 'success' ? '✅' : 'ℹ️';
          const errorCode = log.metadata?.errorType ? `[${log.metadata.errorType}]` : '';
          const metadataStr = log.metadata ? ` ${errorCode} ${JSON.stringify(log.metadata).substring(0, 100)}` : '';
          const newLine = `[${timestamp}] ${levelIcon} [${log.type.toUpperCase()}] ${log.message}${metadataStr}`;
          setTerminalLogs(prev => [...prev, newLine].slice(-500));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => ws.close();
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs, autoScroll]);

  const startBotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/bot/start", { method: "POST" });
      if (!response.ok) throw new Error("Failed to start bot");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      toast({ title: "✅ Успех", description: "Бот успешно запущен" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось запустить бота", variant: "destructive" });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/bot/stop", { method: "POST" });
      if (!response.ok) throw new Error("Failed to stop bot");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      toast({ title: "✅ Успех", description: "Бот остановлен" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось остановить бота", variant: "destructive" });
    },
  });

  const toggleModeMutation = useMutation({
    mutationFn: async (newConfig: Partial<BotConfig>) => {
      const response = await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (!response.ok) throw new Error("Failed to update config");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/config"] });
      toast({ title: "✅ Успех", description: "Режим торговли изменен" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось изменить режим", variant: "destructive" });
    },
  });

  const handleToggleRealTrading = () => {
    if (config) {
      const newValue = !config.enableRealTrading;
      if (newValue) {
        setShowRealTradingDialog(true);
      } else {
        toggleModeMutation.mutate({ enableRealTrading: false, useSimulation: true });
      }
    }
  };

  const confirmEnableRealTrading = () => {
    toggleModeMutation.mutate({ enableRealTrading: true, useSimulation: false });
    setShowRealTradingDialog(false);
  };

  const filteredLogs = terminalLogs.filter(log =>
    log.toLowerCase().includes(filterText.toLowerCase())
  );

  const downloadLogs = () => {
    const blob = new Blob([filteredLogs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorLogs = logs?.filter(l => l.level === 'error' || l.level === 'warning') || [];

  if (statusLoading || configLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = [
    {
      title: "Общая Прибыль",
      value: `$${botStatus?.totalProfitUsd || "0.00"}`,
      icon: DollarSign,
      color: "text-green-500",
      trend: botStatus?.profitTrend ? {
        value: `${botStatus.profitTrend > 0 ? '+' : ''}${botStatus.profitTrend.toFixed(1)}%`,
        isPositive: botStatus.profitTrend > 0
      } : undefined
    },
    {
      title: "Win Rate",
      value: `${botStatus?.successRate || "0"}%`,
      icon: Percent,
      color: "text-blue-500",
      trend: botStatus?.winRateTrend ? {
        value: `${botStatus.winRateTrend > 0 ? '+' : ''}${botStatus.winRateTrend.toFixed(1)}%`,
        isPositive: botStatus.winRateTrend > 0
      } : undefined
    },
    {
      title: "Active Opportunities",
      value: botStatus?.activeOpportunities || 0,
      icon: Activity,
      color: "text-purple-500"
    },
    {
      title: "Gas Spent",
      value: `$${botStatus?.gasCostUsd || "0.00"}`,
      icon: Fuel,
      color: "text-orange-500"
    },
    {
      title: "Net Profit 24h",
      value: `$${botStatus?.net24hUsd || "0.00"}`,
      icon: TrendingUp,
      color: "text-green-500",
      trend: {
        value: `${(parseFloat(botStatus?.net24hUsd || "0") / Math.max(parseFloat(botStatus?.totalProfitUsd || "1"), 1) * 100).toFixed(1)}%`,
        isPositive: parseFloat(botStatus?.net24hUsd || "0") > 0
      }
    },
    {
      title: "Insurance Fund",
      value: `$${botStatus?.insuranceFundUsd || "0.00"}`,
      icon: Shield,
      color: "text-cyan-500"
    },
    {
      title: "Scan Rate",
      value: `${botStatus?.scanRate || 0}/min`,
      icon: Zap,
      color: "text-yellow-500"
    },
    {
      title: "Avg Trade Size",
      value: `$${botStatus?.avgTradeSize || "0"}`,
      icon: BarChart3,
      color: "text-indigo-500"
    },
  ];

  const tradingMode = config?.enableRealTrading ? "real" : "simulation";

  const chartData = (recentTransactions || [])
    .slice(-10)
    .map((tx, index) => ({
      name: `#${index + 1}`,
      profit: parseFloat(tx.profitUsd || "0"),
      gas: parseFloat(tx.gasCostUsd || "0"),
      net: parseFloat(tx.netProfitUsd || "0"),
    }));

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Панель Управления</h1>
          <p className="text-muted-foreground">Мониторинг и управление арбитражным ботом</p>
          <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>💡 Инструкция:</strong> Запустите бота кнопкой "Запустить" для начала мониторинга арбитражных возможностей.
              Переключите режим торговли между "Симуляция" (безопасное тестирование) и "Реальная" (торговля реальными средствами).
              Бот автоматически ищет разницу цен на DEX и выполняет прибыльные сделки с учетом настроенных лимитов риска.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={botStatus?.isRunning ? "default" : "secondary"} className="text-sm px-3 py-1" data-testid="badge-bot-status">
            {botStatus?.isRunning ? "● Бот Активен" : "○ Бот Остановлен"}
          </Badge>
        </div>
      </div>

      {/* Расширенная панель управления */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Управление ботом с расширенными функциями */}
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                🤖 Bot Control Panel
                {config?.enableRealTrading && (
                  <Badge variant="destructive" className="text-xs animate-pulse">
                    LIVE
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={botStatus?.isRunning ? "default" : "secondary"} className="text-xs animate-pulse" data-testid="badge-bot-status">
                  {botStatus?.isRunning ? "● ACTIVE" : "○ STOPPED"}
                </Badge>
                {botStatus?.isRunning && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {Math.floor((Date.now() - new Date(botStatus.lastActivityAt || Date.now()).getTime()) / 1000)}s ago
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Status Alerts */}
            {botStatus?.isPaused && (
              <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive font-medium">{botStatus.pauseReason || "Бот на паузе"}</span>
              </div>
            )}

            {/* Pre-flight Check Indicators */}
            {!botStatus?.isRunning && (
              <div className="p-3 rounded-lg bg-muted/50 border border-primary/20">
                <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Pre-flight Check
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Private Key</span>
                    <span className={config?.privateKey ? "text-green-600" : "text-red-600"}>
                      {config?.privateKey ? "✓ Set" : "✗ Missing"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">1inch API Key</span>
                    <span className={config?.oneinchApiKey ? "text-green-600" : "text-red-600"}>
                      {config?.oneinchApiKey ? "✓ Set" : "✗ Missing"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Contract Address</span>
                    <span className={config?.flashLoanContract ? "text-green-600" : "text-red-600"}>
                      {config?.flashLoanContract ? "✓ Set" : "✗ Missing"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">MATIC Balance</span>
                    <span className={Number(maticBalance) > 1 ? "text-green-600" : "text-yellow-600"}>
                      {Number(maticBalance).toFixed(2)} MATIC
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-muted">
                <div className="text-muted-foreground">Scan Rate</div>
                <div className="font-mono font-bold">{botStatus?.scanRate || 0}/min</div>
              </div>
              <div className="p-2 rounded bg-muted">
                <div className="text-muted-foreground">Success Rate</div>
                <div className="font-mono font-bold text-green-600">{botStatus?.successRate || 0}%</div>
              </div>
              <div className="p-2 rounded bg-muted">
                <div className="text-muted-foreground">Uptime</div>
                <div className="font-mono font-bold">
                  {botStatus?.isRunning ? Math.floor((Date.now() - new Date(botStatus.startedAt || Date.now()).getTime()) / 60000) + 'm' : '0m'}
                </div>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={botStatus?.isRunning || startBotMutation.isPending}
                onClick={() => startBotMutation.mutate()}
                data-testid="button-start-bot"
              >
                <Play className="mr-2 h-4 w-4" />
                {startBotMutation.isPending ? "Starting..." : "Start Bot"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={!botStatus?.isRunning || stopBotMutation.isPending}
                onClick={() => stopBotMutation.mutate()}
                data-testid="button-stop-bot"
              >
                <Square className="mr-2 h-4 w-4" />
                {stopBotMutation.isPending ? "Stopping..." : "Stop Bot"}
              </Button>
            </div>

            {/* Advanced Controls */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Auto-restart on error</span>
                <Switch
                  checked={config?.autoRestart || false}
                  onCheckedChange={(checked) => {
                    toggleModeMutation.mutate({ autoRestart: checked });
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Emergency stop</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    stopBotMutation.mutate();
                    toast({ title: "🚨 Emergency Stop Activated", variant: "destructive" });
                  }}
                >
                  Kill Switch
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Режим торговли */}
        <Card className={tradingMode === "real" ? "border-destructive" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Режим Торговли</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 rounded-lg border"
                 style={{
                   backgroundColor: tradingMode === "real"
                     ? "hsl(var(--destructive) / 0.05)"
                     : "hsl(var(--muted))"
                 }}>
              <div className="flex items-center gap-2">
                <Badge
                  variant={tradingMode === "simulation" ? "secondary" : "destructive"}
                  className="text-xs"
                  data-testid="badge-trading-mode"
                >
                  {tradingMode === "simulation" ? "⚙️ Симуляция" : "💰 Реальная"}
                </Badge>
                {tradingMode === "real" && (
                  <AlertTriangle className="h-3 w-3 text-destructive animate-pulse" />
                )}
              </div>
              <Switch
                id="trading-mode"
                checked={config?.enableRealTrading || false}
                onCheckedChange={handleToggleRealTrading}
                disabled={toggleModeMutation.isPending}
                data-testid="switch-trading-mode"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {tradingMode === "simulation"
                ? "Безопасный режим без реальных транзакций"
                : "⚠️ Используются реальные средства!"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Статус реальной торговли */}
      <RealTradingStatus />

      {/* Панель состояния торговли */}
      <TradingHealthDashboard />

      {/* PowerShell-style Live Event Log */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              <CardTitle>Live Event Log</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {terminalLogs.length} events
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  id="auto-scroll"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="auto-scroll" className="text-muted-foreground cursor-pointer">
                  Auto-scroll
                </label>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadLogs}
                className="h-7"
              >
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTerminalLogs([])}
                className="h-7"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Input
              placeholder="Filter logs... (e.g., 'error', 'success', 'trade')"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-8 text-xs"
              icon={<Search className="h-3 w-3" />}
            />
            <div
              ref={terminalRef}
              className="bg-black rounded-lg p-4 h-[400px] overflow-y-auto font-mono text-xs"
              style={{
                background: 'linear-gradient(to bottom, #0a0a0a, #1a1a1a)',
                scrollbarWidth: 'thin',
                scrollbarColor: '#333 #0a0a0a'
              }}
            >
              {filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-green-500/50">
                  <Terminal className="h-8 w-8 mr-2" />
                  <span>Waiting for events...</span>
                </div>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className="mb-1 hover:bg-white/5 px-2 py-1 rounded transition-colors"
                    style={{
                      color: log.includes('❌') ? '#ef4444' :
                             log.includes('✅') ? '#22c55e' :
                             log.includes('⚠️') ? '#f59e0b' :
                             log.includes('ℹ️') ? '#3b82f6' : '#10b981'
                    }}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classic Activity Feed (компактная версия) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed limit={10} showTitle={false} compact={true} />
        </CardContent>
      </Card>

      {/* Ключевые метрики с трендами */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <MetricCard
            key={index}
            title={metric.title}
            value={metric.value}
            trend={metric.trend}
            icon={<metric.icon className={`h-4 w-4 ${metric.color}`} />}
          />
        ))}
        <MetricCard
          title="MATIC Balance"
          value={`${maticBalance.toFixed(4)} MATIC`}
          icon={<DollarSign className="h-4 w-4 text-teal-500" />}
        />
      </div>

      {/* Компактные графики */}
      {chartData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Прибыль vs Gas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="profit" fill="hsl(var(--chart-1))" name="Прибыль ($)" />
                  <Bar dataKey="gas" fill="hsl(var(--chart-4))" name="Gas ($)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Чистая Прибыль
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    name="Чистая ($)"
                    dot={{ fill: 'hsl(var(--chart-2))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Возможности и позиции */}
      <PotentialOpportunitiesPanel />
      <OpenPositionsPanel />

      {/* Дополнительные панели */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PerformanceAnalytics />
        <TelegramMessagesPanel />
      </div>

      <AlertDialog open={showRealTradingDialog} onOpenChange={setShowRealTradingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Включить Реальную Торговлю?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p className="font-medium">
                Вы собираетесь включить режим реальной торговли. Это означает:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Бот будет выполнять реальные транзакции</li>
                <li>Будут использованы реальные средства из вашего кошелька</li>
                <li>Вы можете потерять средства при неудачных сделках</li>
                <li>Убедитесь, что все настройки проверены</li>
              </ul>
              <p className="text-destructive font-medium text-sm">
                ⚠️ Рекомендуется сначала протестировать на небольших суммах!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-real-mode">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEnableRealTrading}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-real-mode"
            >
              Включить Реальную Торговлю
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}