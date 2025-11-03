
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertTriangle, CheckCircle2, Wifi, WifiOff, Fuel, Wallet, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthMetrics {
  rpcStatus: 'healthy' | 'degraded' | 'down';
  gasPrice: number;
  blockNumber: number;
  walletBalance: string;
  approvalStatus: { [token: string]: boolean };
  contractStatus: 'deployed' | 'not_found' | 'error';
  lastTradeAge: number;
  errorRate: number;
  profitability: number;
}

export function TradingHealthDashboard() {
  const { data: metrics, isLoading } = useQuery<HealthMetrics>({
    queryKey: ["/api/health/metrics"],
    refetchInterval: 10000,
  });

  if (isLoading || !metrics) {
    return null;
  }

  const overallHealth = 
    metrics.rpcStatus === 'healthy' && 
    metrics.errorRate < 5 && 
    metrics.profitability > 40;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Здоровье системы
          </CardTitle>
          <Badge variant={overallHealth ? "default" : "destructive"}>
            {overallHealth ? "Отлично" : "Требует внимания"}
          </Badge>
        </div>
        <CardDescription>Мониторинг критических компонентов торговли</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* RPC Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {metrics.rpcStatus === 'healthy' ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium">RPC Подключение</span>
          </div>
          <Badge variant={metrics.rpcStatus === 'healthy' ? 'default' : 'destructive'}>
            {metrics.rpcStatus === 'healthy' ? 'Активно' : 'Недоступно'}
          </Badge>
        </div>

        {/* Gas Price */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Цена газа</span>
            </div>
            <span className="text-sm text-muted-foreground">{metrics.gasPrice.toFixed(1)} Gwei</span>
          </div>
          <Progress 
            value={Math.min((metrics.gasPrice / 200) * 100, 100)} 
            className={cn(
              metrics.gasPrice > 150 && "bg-red-200",
              metrics.gasPrice <= 150 && "bg-green-200"
            )}
          />
        </div>

        {/* Wallet Balance */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium">Баланс кошелька</span>
          </div>
          <span className={cn(
            "text-sm font-mono",
            parseFloat(metrics.walletBalance) < 0.1 && "text-red-500",
            parseFloat(metrics.walletBalance) >= 0.1 && "text-green-500"
          )}>
            {parseFloat(metrics.walletBalance).toFixed(4)} MATIC
          </span>
        </div>

        {/* Error Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Частота ошибок</span>
            </div>
            <span className="text-sm text-muted-foreground">{metrics.errorRate}/мин</span>
          </div>
          <Progress 
            value={Math.min((metrics.errorRate / 20) * 100, 100)} 
            className={cn(
              metrics.errorRate > 10 && "bg-red-200",
              metrics.errorRate <= 10 && "bg-green-200"
            )}
          />
        </div>

        {/* Profitability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Прибыльность</span>
            </div>
            <span className="text-sm text-muted-foreground">{metrics.profitability.toFixed(1)}%</span>
          </div>
          <Progress 
            value={metrics.profitability} 
            className="bg-green-200"
          />
        </div>

        {/* Contract Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium">Смарт-контракт</span>
          </div>
          <Badge variant={metrics.contractStatus === 'deployed' ? 'default' : 'secondary'}>
            {metrics.contractStatus === 'deployed' ? 'Развернут' : 'Не найден'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
