
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, CheckCircle2, XCircle, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";

interface AuthorizationStatus {
  executorAddress: string;
  isAuthorized: boolean;
  contractOwner?: string;
  error?: string;
}

export function ContractAuthorizationManager() {
  const { toast } = useToast();

  const { data: status, isLoading, refetch } = useQuery<AuthorizationStatus>({
    queryKey: ["/api/contract/authorization-status"],
    refetchInterval: 10000, // Проверяем каждые 10 секунд
  });

  const authorizeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/contract/authorize-executor", {});
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "✅ Успешно!",
          description: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/contract/authorization-status"] });
      } else {
        toast({
          title: "Ошибка авторизации",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось авторизовать executor",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h4 className="font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Авторизация Контракта
        </h4>
        <div className="text-sm text-muted-foreground">Проверка статуса...</div>
      </div>
    );
  }

  if (status?.error) {
    const isContractNotDeployed = status.error.includes('CONTRACT_NOT_DEPLOYED');
    const isAbiMismatch = status.error.includes('CONTRACT_ABI_MISMATCH');
    
    return (
      <div className="space-y-2">
        <h4 className="font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Авторизация Контракта
        </h4>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            {status.error === 'CONTRACT_ADDRESS_MISSING' && (
              <>
                <div>Адрес контракта не настроен</div>
                <div className="text-xs">Перейдите в Settings → Bot Config и укажите адрес контракта ArbitrageExecutor</div>
              </>
            )}
            {status.error === 'RPC_URL_MISSING' && (
              <>
                <div>RPC URL не настроен</div>
                <div className="text-xs">Перейдите в Settings → Bot Config и укажите RPC URL для выбранной сети</div>
              </>
            )}
            {isContractNotDeployed && (
              <>
                <div>{status.error.split(': ')[1]}</div>
                <div className="text-xs mt-2 space-y-1">
                  <div>Возможные причины:</div>
                  <ul className="list-disc list-inside ml-2">
                    <li>Контракт не развернут на выбранной сети</li>
                    <li>Неправильный адрес контракта в настройках</li>
                    <li>Выбрана неправильная сеть (mainnet/testnet)</li>
                  </ul>
                  <div className="mt-2">Проверьте настройки в Settings → Bot Config</div>
                </div>
              </>
            )}
            {isAbiMismatch && (
              <>
                <div>{status.error.split(': ')[1]}</div>
                <div className="text-xs mt-2">
                  Контракт по указанному адресу найден, но не является контрактом ArbitrageExecutor. 
                  Проверьте адрес контракта в настройках.
                </div>
              </>
            )}
            {!status.error.includes('CONTRACT_ADDRESS_MISSING') && 
             !status.error.includes('RPC_URL_MISSING') && 
             !isContractNotDeployed && 
             !isAbiMismatch && (
              <div className="space-y-1">
                <div>{status.error}</div>
                <div className="text-xs mt-2">Проверьте подключение к сети и настройки контракта</div>
              </div>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Авторизация Контракта
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <div className="font-medium">Executor Address</div>
            <div className="text-xs text-muted-foreground font-mono">
              {status?.executorAddress}
            </div>
          </div>
          {status?.isAuthorized ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Авторизован
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Не авторизован
            </Badge>
          )}
        </div>

        {status?.contractOwner && (
          <div className="text-xs text-muted-foreground">
            Owner контракта: <span className="font-mono">{status.contractOwner}</span>
          </div>
        )}

        {!status?.isAuthorized && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Для выполнения реальных арбитражных сделок необходимо авторизовать ваш кошелек в смарт-контракте.
              Это одноразовая операция, требующая оплаты газа (~0.01 MATIC).
            </AlertDescription>
          </Alert>
        )}

        {!status?.isAuthorized && (
          <Button
            onClick={() => authorizeMutation.mutate()}
            disabled={authorizeMutation.isPending}
            className="w-full"
          >
            <Shield className="mr-2 h-4 w-4" />
            {authorizeMutation.isPending ? "Авторизация..." : "Авторизовать Executor"}
          </Button>
        )}

        {status?.isAuthorized && (
          <div className="flex items-start gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-green-500">Executor авторизован!</p>
              <p>Вы можете запускать бота в режиме реальной торговли.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
