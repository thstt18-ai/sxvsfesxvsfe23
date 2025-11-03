import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  XCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ActivityLog {
  id: number;
  userId: string;
  type: string;
  level: string;
  message: string;
  metadata?: any;
  createdAt: string;
}

export function ErrorLogsDetailed() {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  const { data: logs, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
    queryFn: async () => {
      const response = await fetch("/api/activity-logs?limit=200");
      if (!response.ok) throw new Error("Failed to fetch activity logs");
      return response.json();
    },
    refetchInterval: 10000,
  });

  const errorLogs = logs?.filter(l => l.level === 'error' || l.level === 'warning') || [];
  const criticalErrors = errorLogs.filter(l => l.level === 'error');
  const warnings = errorLogs.filter(l => l.level === 'warning');

  const toggleExpanded = (logId: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const getRecommendation = (log: ActivityLog): string => {
    const metadata = log.metadata;

    if (metadata?.recommendation) {
      return metadata.recommendation;
    }

    // BigNumberish ошибки
    if (log.message.includes('BigNumberish') || log.message.includes('toAmount') || log.message.includes('некорректн')) {
      return '🔧 Ошибка обработки числовых значений:\n' +
        '1. Проверьте, что токены имеют корректные decimals\n' +
        '2. Убедитесь, что RPC возвращает корректные данные\n' +
        '3. Попробуйте уменьшить сумму flash loan\n' +
        '4. Проверьте, что 1inch API ключ настроен корректно\n' +
        '5. Если используете testnet - убедитесь что RPC URL корректен';
    }

    if (metadata?.errorType === 'simulation_token_validation') {
      return '✅ Это НОРМАЛЬНО для симуляции на тестовой сети.\n' +
        'Токены используют mock-данные. Продолжайте работу - ошибки нет!\n\n' +
        'Для реальной торговли:\n' +
        '1. Переключитесь на mainnet в Settings\n' +
        '2. Убедитесь что enableRealTrading = true только после полной готовности';
    }

    if (metadata?.error === 'private_key_not_configured') {
      return 'Добавьте PRIVATE_KEY в Secrets или в Settings → Safe & Ledger';
    }

    if (metadata?.step === '4_gas_too_high') {
      return `Увеличьте maxGasPriceGwei в Settings или дождитесь снижения цены газа`;
    }

    if (log.message.includes('Token validation') && metadata?.mode === 'simulation') {
      return '✅ В режиме симуляции это предупреждение можно игнорировать.\n' +
        'На тестовой сети токены могут не иметь реальных контрактов.\n' +
        'Бот использует mock-данные для демонстрации функционала.';
    }

    if (log.message.includes('MATIC') || log.message.includes('balance')) {
      if (metadata?.mode === 'simulation') {
        return 'В режиме симуляции баланс MATIC не критичен - транзакции не отправляются.\n' +
          'Для реальной торговли потребуется пополнить кошелек.';
      }
      return 'Пополните кошелек MATIC для оплаты комиссий (минимум 0.1 MATIC)';
    }

    if (log.message.includes('Telegram')) {
      return 'Проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в Settings';
    }

    return 'Проверьте логи и настройки. При повторении обратитесь к документации';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Логи Ошибок
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Логи Ошибок
            </CardTitle>
            <CardDescription>Детальный анализ с рекомендациями</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {criticalErrors.length}
            </Badge>
            <Badge variant="secondary" className="bg-yellow-500/20">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {warnings.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {errorLogs.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500/50" />
            <p className="text-lg font-medium">Ошибок нет! 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">Бот работает без проблем</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-2">
              {errorLogs.map((log) => {
                const isExpanded = expandedLogs.has(log.id);
                const recommendation = getRecommendation(log);
                const isError = log.level === 'error';

                return (
                  <Collapsible 
                    key={log.id} 
                    open={isExpanded} 
                    onOpenChange={() => toggleExpanded(log.id)}
                  >
                    <div className={cn(
                      "border rounded-lg transition-colors",
                      isError 
                        ? "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20" 
                        : "border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/20"
                    )}>
                      <div className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {isError ? (
                              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge 
                                variant={isError ? "destructive" : "secondary"} 
                                className={cn(
                                  "text-xs font-mono",
                                  !isError && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                                )}
                              >
                                {isError ? 'ERROR' : 'WARNING'}
                              </Badge>
                              <span className="text-xs text-muted-foreground font-mono">
                                {new Date(log.createdAt).toLocaleString('ru-RU', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>

                            <p className="text-sm font-medium mb-2 line-clamp-2">{log.message}</p>

                            <CollapsibleTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-xs gap-1 -ml-2"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="h-3 w-3" />
                                    Скрыть
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="h-3 w-3" />
                                    Подробности
                                  </>
                                )}
                              </Button>
                            </CollapsibleTrigger>

                            <CollapsibleContent className="mt-2 space-y-2">
                              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
                                <div className="flex items-start gap-2">
                                  <Lightbulb className="h-3 w-3 text-blue-500 flex-shrink-0 mt-0.5" />
                                  <div className="text-xs">
                                    <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">
                                      Решение:
                                    </p>
                                    <p className="text-blue-600 dark:text-blue-300">
                                      {recommendation}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div className="bg-muted/50 rounded p-2">
                                  <div className="flex items-center gap-1 mb-1">
                                    <Info className="h-3 w-3 text-muted-foreground" />
                                    <p className="text-xs font-medium text-muted-foreground">
                                      Технические детали
                                    </p>
                                  </div>
                                  <pre className="text-xs font-mono overflow-x-auto max-h-32">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </CollapsibleContent>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}