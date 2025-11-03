
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Download, FileText, Play, Square, Settings, MessageSquare, HelpCircle, FileDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function AdvancedTrading() {
  const { toast } = useToast();
  const [activeStrategy, setActiveStrategy] = useState<string | null>(null);

  // Fetch performance metrics
  const { data: metrics } = useQuery({
    queryKey: ["/api/analytics/performance"],
    refetchInterval: 10000,
  });

  // Mock data for charts
  const equityCurve = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    equity: 10000 + Math.random() * 2000,
    pnl: (Math.random() - 0.5) * 500,
    gas: Math.random() * 10,
  }));

  const strategies = [
    { id: 'grid', name: 'Grid Trading', icon: '📊', description: 'Автоматическая торговля в диапазоне' },
    { id: 'twap', name: 'TWAP', icon: '⏱️', description: 'Time-Weighted Average Price' },
    { id: 'momentum', name: 'Momentum', icon: '🚀', description: 'Следование за трендом' },
    { id: 'delta-neutral', name: 'Delta Neutral', icon: '⚖️', description: 'Нейтральная по дельте' },
  ];

  const startStrategyMutation = useMutation({
    mutationFn: async (strategyId: string) => {
      const response = await fetch("/api/strategy/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: strategyId }),
      });
      if (!response.ok) throw new Error("Failed to start strategy");
      return response.json();
    },
    onSuccess: (_, strategyId) => {
      setActiveStrategy(strategyId);
      toast({ title: "✅ Стратегия запущена" });
      queryClient.invalidateQueries({ queryKey: ["/api/strategy/status"] });
    },
  });

  const stopStrategyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/strategy/stop", { method: "POST" });
      if (!response.ok) throw new Error("Failed to stop strategy");
      return response.json();
    },
    onSuccess: () => {
      setActiveStrategy(null);
      toast({ title: "⏹️ Стратегия остановлена" });
      queryClient.invalidateQueries({ queryKey: ["/api/strategy/status"] });
    },
  });

  const exportPDF = () => {
    toast({ title: "📄 Экспорт в PDF", description: "Генерация отчёта..." });
    // Implementation would use jsPDF or similar
  };

  const exportCSV = () => {
    const csvContent = equityCurve.map(row => `${row.day},${row.equity},${row.pnl},${row.gas}`).join('\n');
    const blob = new Blob([`Day,Equity,PnL,Gas\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast({ title: "✅ CSV экспортирован" });
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="text-4xl">📈</div>
        <div>
          <h1 className="text-3xl font-bold">Дальнейшая Торговля</h1>
          <p className="text-muted-foreground">Расширенные стратегии и аналитика</p>
        </div>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="analytics">📊 Аналитика</TabsTrigger>
          <TabsTrigger value="strategies">🎯 Стратегии</TabsTrigger>
          <TabsTrigger value="reports">📄 Отчёты</TabsTrigger>
          <TabsTrigger value="support">💬 Поддержка</TabsTrigger>
        </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Win Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics?.[0]?.winRate || 0}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sharpe Ratio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics?.[0]?.sharpeRatio || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Net PnL</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${metrics?.[0]?.netProfitUsd || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Equity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$10,000</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Gas Spent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${metrics?.[0]?.totalGasCostUsd || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PnL Curve</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button onClick={exportPDF} className="gap-2">
              <FileText className="h-4 w-4" />
              Экспорт в PDF
            </Button>
            <Button onClick={exportCSV} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Экспорт в CSV
            </Button>
          </div>
        </TabsContent>

        {/* Strategies Tab */}
        <TabsContent value="strategies" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {strategies.map((strategy) => (
              <Card key={strategy.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{strategy.icon}</span>
                      <div>
                        <CardTitle>{strategy.name}</CardTitle>
                        <CardDescription>{strategy.description}</CardDescription>
                      </div>
                    </div>
                    {activeStrategy === strategy.id && (
                      <Badge variant="default">Активна</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {activeStrategy === strategy.id ? (
                      <Button
                        variant="destructive"
                        onClick={() => stopStrategyMutation.mutate()}
                        disabled={stopStrategyMutation.isPending}
                        className="gap-2"
                      >
                        <Square className="h-4 w-4" />
                        Остановить
                      </Button>
                    ) : (
                      <Button
                        onClick={() => startStrategyMutation.mutate(strategy.id)}
                        disabled={startStrategyMutation.isPending || activeStrategy !== null}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Запустить
                      </Button>
                    )}
                    <Button variant="outline" className="gap-2">
                      <Settings className="h-4 w-4" />
                      Настройки
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ежедневные Отчёты</CardTitle>
              <CardDescription>Скачайте отчёты за выбранный период</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {Array.from({ length: 7 }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    return (
                      <div key={i} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <p className="font-medium">{date.toLocaleDateString('ru-RU')}</p>
                          <p className="text-sm text-muted-foreground">
                            Trades: {Math.floor(Math.random() * 50)}, PnL: ${(Math.random() * 200).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={exportPDF}>
                            <FileText className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          <Button size="sm" variant="outline" onClick={exportCSV}>
                            <FileDown className="h-4 w-4 mr-1" />
                            CSV
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Support Tab */}
        <TabsContent value="support" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  FAQ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    <div>
                      <p className="font-medium">❓ Как запустить стратегию?</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Перейдите во вкладку "Стратегии" и нажмите "Запустить" на выбранной стратегии.
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">❓ Что такое Meta-TX?</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Meta-транзакции (EIP-2771 + EIP-2612) позволяют торговать без MATIC на балансе.
                        Релейер оплачивает gas за вас.
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">❓ Безопасен ли encrypted keystore?</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Да! Ваш приватный ключ хранится в зашифрованном виде и никогда не покидает сервер.
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Чат Поддержки
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <ScrollArea className="h-[300px] border rounded p-3">
                    <div className="space-y-2">
                      <div className="bg-muted p-2 rounded">
                        <p className="text-sm">👋 Здравствуйте! Чем могу помочь?</p>
                      </div>
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Введите сообщение..."
                      className="flex-1 px-3 py-2 border rounded"
                    />
                    <Button>Отправить</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
