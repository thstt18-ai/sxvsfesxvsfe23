
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { BotConfig } from "@shared/schema";

export function RealTradingStatus() {
  const { data: config } = useQuery<BotConfig>({
    queryKey: ["/api/bot/config"],
  });

  const isRealTrading = config?.enableRealTrading && !config?.useSimulation;

  const checks = [
    {
      name: "Private Key",
      status: !!config?.privateKey,
      critical: true,
    },
    {
      name: "1inch API Key",
      status: !!config?.oneinchApiKey,
      critical: true,
    },
    {
      name: "Flash Loan Contract",
      status: !!config?.flashLoanContract && config?.flashLoanContract !== '0x0000000000000000000000000000000000000000',
      critical: true,
    },
    {
      name: "RPC URL",
      status: !!(config?.networkMode === 'mainnet' ? config?.polygonRpcUrl : config?.polygonTestnetRpcUrl),
      critical: true,
    },
  ];

  const allCriticalPassed = checks.filter(c => c.critical).every(c => c.status);
  const readyForTrading = isRealTrading && allCriticalPassed;

  return (
    <Card className={isRealTrading ? "border-green-500" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isRealTrading ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Реальная Торговля
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Режим Симуляции
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {isRealTrading ? "Сделки выполняются на блокчейне" : "Тестовый режим без реальных транзакций"}
            </CardDescription>
          </div>
          {isRealTrading && (
            <div>
              {readyForTrading ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isRealTrading && (
          <>
            <Alert variant={readyForTrading ? "default" : "destructive"}>
              <AlertDescription>
                {readyForTrading ? (
                  <span className="text-green-600 font-medium">
                    ✅ Все критические проверки пройдены - готов к торговле
                  </span>
                ) : (
                  <span className="text-destructive font-medium">
                    ⚠️ Некоторые критические настройки отсутствуют
                  </span>
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              {checks.map((check) => (
                <div key={check.name} className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm font-medium">{check.name}</span>
                  <div className="flex items-center gap-2">
                    {check.critical && (
                      <Badge variant="outline" className="text-xs">
                        Критично
                      </Badge>
                    )}
                    {check.status ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!isRealTrading && (
          <Alert>
            <AlertDescription className="text-sm">
              💡 Включите реальную торговлю в Settings → Risk Management для выполнения сделок на блокчейне
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
