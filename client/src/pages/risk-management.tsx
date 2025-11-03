import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, AlertTriangle, CheckCircle2, XCircle, Activity,
  TrendingDown, DollarSign, Zap, AlertCircle
} from "lucide-react";
import type { 
  BotConfig, 
  RiskLimitsTracking, 
  CircuitBreakerEvent 
} from "@shared/schema";

export default function RiskManagement() {
  const { data: config, isLoading: configLoading } = useQuery<BotConfig>({
    queryKey: ["/api/bot/config"],
  });

  const { data: riskTracking, isLoading: riskLoading } = useQuery<RiskLimitsTracking>({
    queryKey: ["/api/risk/tracking"],
    refetchInterval: 5000,
  });

  const { data: circuitBreakerEvents } = useQuery<CircuitBreakerEvent[]>({
    queryKey: ["/api/risk/circuit-breaker-events"],
  });

  if (configLoading || riskLoading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl space-y-6">
        <Skeleton className="h-12 w-96" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const dailyLossLimit = parseFloat(config?.dailyLossLimit || "500");
  const maxSingleLoss = parseFloat(config?.maxSingleLossUsd || "100");
  const maxLoanUsd = parseFloat(config?.maxLoanUsd || "50000");

  const dailyLossUsed = parseFloat(riskTracking?.dailyLossUsd || "0");
  const dailyLossUtilization = parseFloat(riskTracking?.dailyLossUtilization || "0");

  const isHighRisk = dailyLossUtilization > 80;
  const isMediumRisk = dailyLossUtilization > 50 && dailyLossUtilization <= 80;

  const unresolvedEvents = circuitBreakerEvents?.filter(e => !e.resolved) || [];
  const criticalEvents = unresolvedEvents.filter(e => e.severity === "critical");

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Risk Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Мониторинг лимитов, защита от убытков и управление рисками
          </p>
          <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>💡 Инструкция:</strong> Отслеживайте использование дневных лимитов убытков, максимальный размер позиции, 
              события Circuit Breaker (автоматические остановки при критических ситуациях). 
              Система автоматически останавливает торговлю при превышении лимитов для защиты капитала.
            </p>
          </div>
        </div>
        {config?.autoPauseEnabled && (
          <Badge variant="outline" className="gap-2" data-testid="badge-auto-pause-status">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Auto-Pause Enabled
          </Badge>
        )}
      </div>

      {/* Critical Alerts */}
      {criticalEvents.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Критические события ({criticalEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {criticalEvents.slice(0, 3).map((event) => (
              <div 
                key={event.id} 
                className="flex items-start gap-3 p-3 rounded-md bg-background"
                data-testid={`circuit-breaker-event-${event.id}`}
              >
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{event.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(event.createdAt).toLocaleString('ru-RU')}
                  </p>
                </div>
                <Badge variant="destructive" data-testid={`badge-severity-${event.severity}`}>
                  {event.severity}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Overview Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-daily-loss-limit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Daily Loss Limit
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold">
              ${dailyLossUsed.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              из ${dailyLossLimit.toFixed(2)} лимита
            </p>
            <Progress 
              value={dailyLossUtilization} 
              className="mt-3 h-2"
              data-testid="progress-daily-loss"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {dailyLossUtilization.toFixed(1)}% использовано
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-max-position-size">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Max Position Size
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold">
              ${maxLoanUsd.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Максимальный размер сделки
            </p>
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm">Активно</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-max-single-loss">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Max Single Loss
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold">
              ${maxSingleLoss.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Лимит на одну сделку
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span className="text-sm">Защита активна</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-circuit-breaker-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Circuit Breaker
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {unresolvedEvents.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Активных событий
            </p>
            <div className="mt-3">
              {unresolvedEvents.length === 0 ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Все в порядке</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm">Требует внимания</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed info */}
      <Tabs defaultValue="limits" className="space-y-4">
        <TabsList>
          <TabsTrigger value="limits" data-testid="tab-limits">
            <Activity className="h-4 w-4 mr-2" />
            Активные Лимиты
          </TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Circuit Breaker Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="limits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Детальный статус лимитов</CardTitle>
              <CardDescription>
                Текущее использование всех установленных лимитов
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Daily Loss Limit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Daily Loss Limit</p>
                    <p className="text-xs text-muted-foreground">
                      Дневной лимит убытков
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold">
                      ${dailyLossUsed.toFixed(2)} / ${dailyLossLimit.toFixed(2)}
                    </p>
                    <Badge 
                      variant={isHighRisk ? "destructive" : isMediumRisk ? "secondary" : "outline"}
                      className="mt-1"
                    >
                      {dailyLossUtilization.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
                <Progress value={dailyLossUtilization} className="h-2" />
              </div>

              <Separator />

              {/* Max Position Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Max Position Size</p>
                    <p className="text-xs text-muted-foreground">
                      Максимальный размер одной позиции
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold">
                      ${maxLoanUsd.toLocaleString()}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Активно
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Max Single Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Max Single Loss</p>
                    <p className="text-xs text-muted-foreground">
                      Максимальный убыток на одну сделку
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold">
                      ${maxSingleLoss.toFixed(2)}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Активно
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Slippage Protection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Slippage Protection</p>
                    <p className="text-xs text-muted-foreground">
                      Максимальное проскальзывание цены
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold">
                      {config?.staticSlippagePercent}%
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Активно
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Gas Price Limit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Max Gas Price</p>
                    <p className="text-xs text-muted-foreground">
                      Максимальная цена gas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold">
                      {config?.maxGasPriceGwei} Gwei
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Активно
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Circuit Breaker Events</CardTitle>
              <CardDescription>
                История автоматических остановок и критических событий
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!circuitBreakerEvents || circuitBreakerEvents.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Нет активных circuit breaker событий
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {circuitBreakerEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`event-${event.id}`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {event.severity === "critical" ? (
                          <XCircle className="h-6 w-6 text-destructive" />
                        ) : event.severity === "warning" ? (
                          <AlertTriangle className="h-6 w-6 text-amber-600" />
                        ) : (
                          <AlertCircle className="h-6 w-6 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{event.description}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {event.eventType.replace(/_/g, " ")}
                            </p>
                          </div>
                          <Badge 
                            variant={event.resolved ? "outline" : event.severity === "critical" ? "destructive" : "secondary"}
                            data-testid={`badge-event-status-${event.id}`}
                          >
                            {event.resolved ? "Resolved" : event.severity}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono">
                          {event.triggerValue && (
                            <span className="text-muted-foreground">
                              Trigger: ${parseFloat(event.triggerValue).toFixed(2)}
                            </span>
                          )}
                          {event.thresholdValue && (
                            <span className="text-muted-foreground">
                              Threshold: ${parseFloat(event.thresholdValue).toFixed(2)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString('ru-RU')}
                          </p>
                          {event.autoPaused && (
                            <Badge variant="outline" className="text-xs">
                              Auto-Paused
                            </Badge>
                          )}
                        </div>

                        {event.resolved && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">
                              Resolved {event.resolvedAt ? new Date(event.resolvedAt).toLocaleString('ru-RU') : ''} 
                              {event.resolvedBy && ` by ${event.resolvedBy}`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
