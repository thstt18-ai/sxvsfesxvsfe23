import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownUp, TrendingUp, RefreshCw, AlertCircle, Play, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlashLoanPanel } from "@/components/flash-loan-panel";
import { TradeLiveLog } from "@/components/trade-live-log";
import type { BotConfig } from "@shared/schema";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

interface SwapQuote {
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  dex: string;
}

interface TokenPrice {
  address: string;
  symbol: string;
  priceUsd: number;
  priceChange24h: number;
}

export default function Trade() {
  const { toast } = useToast();
  const [fromToken, setFromToken] = useState<string>("");
  const [toToken, setToToken] = useState<string>("");
  const [fromAmount, setFromAmount] = useState<string>("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);

  // Fetch supported tokens
  const { data: tokens, isLoading: tokensLoading } = useQuery<Token[]>({
    queryKey: ["/api/dex/tokens"],
  });

  // Fetch token prices
  const { data: prices } = useQuery<TokenPrice[]>({
    queryKey: ["/api/dex/prices"],
    queryFn: async () => {
      if (!tokens || tokens.length === 0) return [];
      const addresses = tokens.map(t => t.address).join(',');
      const response = await fetch(`/api/dex/prices?addresses=${addresses}`);
      if (!response.ok) throw new Error("Failed to fetch prices");
      return response.json();
    },
    enabled: !!tokens && tokens.length > 0,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch arbitrage opportunities
  const { data: opportunities, isLoading: opportunitiesLoading } = useQuery({
    queryKey: ["/api/dex/arbitrage-opportunities"],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Get quote mutation
  const getQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
        throw new Error("Заполните все поля");
      }

      const response = await fetch(
        `/api/dex/quote?src=${fromToken}&dst=${toToken}&amount=${fromAmount}`
      );
      if (!response.ok) throw new Error("Failed to get quote");
      return response.json();
    },
    onSuccess: (data) => {
      setQuote(data);
      toast({
        title: "✅ Котировка получена",
        description: `${data.toAmount} ${data.toToken.symbol} через ${data.dex}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Execute swap mutation
  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error("Сначала получите котировку");

      return await apiRequest("POST", "/api/dex/swap", {
        src: fromToken,
        dst: toToken,
        amount: fromAmount,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrage/transactions"] });
      toast({
        title: "✅ Swap выполнен (DEMO)",
        description: `TX: ${data.txHash.slice(0, 10)}...`,
      });
      
      // Reset form
      setFromAmount("");
      setQuote(null);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка swap",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGetQuote = () => {
    if (!fromToken || !toToken || !fromAmount) {
      toast({
        title: "Ошибка",
        description: "Заполните все поля перед получением котировки",
        variant: "destructive"
      });
      return;
    }
    
    if (parseFloat(fromAmount) <= 0) {
      toast({
        title: "Ошибка",
        description: "Сумма должна быть больше 0",
        variant: "destructive"
      });
      return;
    }
    
    getQuoteMutation.mutate();
  };

  const handleSwap = () => {
    if (!quote) {
      toast({
        title: "Ошибка",
        description: "Сначала получите котировку",
        variant: "destructive"
      });
      return;
    }
    
    swapMutation.mutate();
  };

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuote(null);
  };

  const getTokenPrice = (address: string): TokenPrice | undefined => {
    return prices?.find(p => p.address.toLowerCase() === address.toLowerCase());
  };

  // Fetch bot config to check trading mode
  const { data: botConfig } = useQuery<BotConfig>({
    queryKey: ["/api/bot/config"],
  });

  const { data: botStatus } = useQuery({
    queryKey: ["/api/bot/status"],
    refetchInterval: 5000,
  });

  const startBotMutation = useMutation({
    mutationFn: async (isReal: boolean) => {
      // Update config first
      await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enableRealTrading: isReal,
          useSimulation: !isReal,
        }),
      });
      
      // Then start bot
      const response = await fetch("/api/bot/start", { method: "POST" });
      if (!response.ok) throw new Error("Failed to start bot");
      return response.json();
    },
    onSuccess: (_, isReal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bot/config"] });
      toast({
        title: "✅ Бот запущен",
        description: `Режим: ${isReal ? 'РЕАЛЬНАЯ ТОРГОВЛЯ' : 'DEMO (Симуляция)'}`,
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось запустить бота",
        variant: "destructive",
      });
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
      toast({ title: "✅ Бот остановлен" });
    },
  });

  const isRunning = botStatus?.isRunning || false;
  const isRealTrading = botConfig?.enableRealTrading && !botConfig?.useSimulation;

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Торговля Токенами
          </h1>
          <div className="flex gap-2">
            <Button
              onClick={() => startBotMutation.mutate(false)}
              disabled={isRunning || startBotMutation.isPending}
              variant="outline"
              className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
            >
              <Play className="h-4 w-4 mr-2" />
              DEMO Режим
            </Button>
            <Button
              onClick={() => startBotMutation.mutate(true)}
              disabled={isRunning || startBotMutation.isPending}
              variant="default"
              className="bg-green-600 hover:bg-green-700"
            >
              <Zap className="h-4 w-4 mr-2" />
              РЕАЛЬНАЯ Торговля
            </Button>
            <Button
              onClick={() => stopBotMutation.mutate()}
              disabled={!isRunning || stopBotMutation.isPending}
              variant="destructive"
            >
              СТОП
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground">DEX Swap, Arbitrage & Flash Loans</p>
          {isRunning && (
            <Badge variant={isRealTrading ? "destructive" : "default"} className="animate-pulse">
              {isRealTrading ? "🔴 LIVE TRADING" : "🟢 DEMO MODE"}
            </Badge>
          )}
        </div>
        <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
          <p className="text-xs text-muted-foreground">
            <strong>💡 Инструкция:</strong> Используйте DEX Swap для обмена токенов по лучшей цене через агрегаторы. 
            Flash Loans позволяют брать большие суммы без залога для арбитража (займ и возврат в одной транзакции). 
            Система автоматически находит арбитражные возможности между QuickSwap, SushiSwap, Uniswap V3, Balancer, DODO и KyberSwap.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-primary/10">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Поддержка DEX</div>
              <div className="text-sm font-bold">6 платформ</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">MEV Protection</div>
              <div className="text-sm font-bold text-green-600">✓ Flashbots</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Flash Loans</div>
              <div className="text-sm font-bold text-blue-600">Aave V3</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="swap" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="swap" data-testid="tab-swap">
            DEX Swap & Arbitrage
          </TabsTrigger>
          <TabsTrigger value="flashloan" data-testid="tab-flashloan">
            Flash Loans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="swap" className="space-y-6">
      {/* Live Trading Log */}
      <TradeLiveLog />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Swap Card */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Swap Токены</CardTitle>
              <CardDescription>Обмен через лучшую цену от агрегаторов</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tokensLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <>
                  {/* From Token */}
                  <div className="space-y-2">
                    <Label>Из токена</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={fromToken} onValueChange={setFromToken}>
                        <SelectTrigger data-testid="select-from-token">
                          <SelectValue placeholder="Выберите токен" />
                        </SelectTrigger>
                        <SelectContent>
                          {tokens?.map((token) => (
                            <SelectItem key={token.address} value={token.address}>
                              {token.symbol} - {token.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={fromAmount}
                        onChange={(e) => {
                          setFromAmount(e.target.value);
                          setQuote(null);
                        }}
                        data-testid="input-from-amount"
                      />
                    </div>
                    {fromToken && getTokenPrice(fromToken) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          ${getTokenPrice(fromToken)?.priceUsd.toFixed(2)} USD
                        </span>
                        <Badge
                          variant={
                            (getTokenPrice(fromToken)?.priceChange24h || 0) >= 0
                              ? "default"
                              : "destructive"
                          }
                          className="text-xs"
                        >
                          {(getTokenPrice(fromToken)?.priceChange24h || 0) >= 0 ? "+" : ""}
                          {getTokenPrice(fromToken)?.priceChange24h.toFixed(2)}%
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Switch Button */}
                  <div className="flex justify-center">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={switchTokens}
                      disabled={!fromToken || !toToken}
                      data-testid="button-switch-tokens"
                    >
                      <ArrowDownUp className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* To Token */}
                  <div className="space-y-2">
                    <Label>В токен</Label>
                    <Select value={toToken} onValueChange={setToToken}>
                      <SelectTrigger data-testid="select-to-token">
                        <SelectValue placeholder="Выберите токен" />
                      </SelectTrigger>
                      <SelectContent>
                        {tokens?.map((token) => (
                          <SelectItem key={token.address} value={token.address}>
                            {token.symbol} - {token.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {toToken && getTokenPrice(toToken) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          ${getTokenPrice(toToken)?.priceUsd.toFixed(2)} USD
                        </span>
                        <Badge
                          variant={
                            (getTokenPrice(toToken)?.priceChange24h || 0) >= 0
                              ? "default"
                              : "destructive"
                          }
                          className="text-xs"
                        >
                          {(getTokenPrice(toToken)?.priceChange24h || 0) >= 0 ? "+" : ""}
                          {getTokenPrice(toToken)?.priceChange24h.toFixed(2)}%
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Quote Display */}
                  {quote && (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Получите</span>
                          <span className="font-mono font-bold" data-testid="text-quote-amount">
                            {parseFloat(quote.toAmount).toFixed(6)} {quote.toToken.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">DEX</span>
                          <Badge variant="outline" data-testid="badge-dex">
                            {quote.dex}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Gas (оценка)</span>
                          <span className="font-mono">{quote.estimatedGas}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleGetQuote}
                      disabled={
                        !fromToken ||
                        !toToken ||
                        !fromAmount ||
                        parseFloat(fromAmount) <= 0 ||
                        getQuoteMutation.isPending
                      }
                      data-testid="button-get-quote"
                    >
                      {getQuoteMutation.isPending && (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Получить котировку
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleSwap}
                      disabled={!quote || swapMutation.isPending}
                      variant="default"
                      data-testid="button-execute-swap"
                    >
                      {swapMutation.isPending && (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Выполнить Swap (DEMO)
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 text-xs text-muted-foreground border-l-2 border-primary/20 pl-3 py-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p>
                      DEMO режим: Swap операции симулируются локально. В production версии
                      потребуется подтверждение транзакции через MetaMask.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Arbitrage Opportunities */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Арбитражные Возможности</CardTitle>
              <CardDescription className="text-xs">
                Live обновление каждые 15 сек
              </CardDescription>
            </CardHeader>
            <CardContent>
              {opportunitiesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : opportunities && opportunities.length > 0 ? (
                <div className="space-y-3">
                  {opportunities.map((opp: any, index: number) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border bg-card space-y-2"
                      data-testid={`opportunity-${index}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{opp.tokenPair}</p>
                        <Badge variant="default" className="text-xs">
                          +{opp.profitPercent}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>Buy:</span>
                          <span className="font-mono">{opp.buyDex}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sell:</span>
                          <span className="font-mono">{opp.sellDex}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Profit:</span>
                          <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                            ${opp.estimatedProfit}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет выгодных возможностей
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">💡 О торговле</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p>• 1inch агрегирует цены с нескольких DEX</p>
              <p>• QuickSwap - ведущий DEX на Polygon</p>
              <p>• Всегда проверяйте slippage и gas</p>
              <p>• В DEMO режиме транзакции симулируются</p>
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="flashloan">
          <FlashLoanPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
