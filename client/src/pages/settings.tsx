import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ExternalLink, AlertTriangle, CheckCircle2, Network, Zap, Shield, Bell, DollarSign, Info, AlertCircle, Package } from "lucide-react";
import { TokenWhitelistManager } from "@/components/token-whitelist-manager";
import { WebhookManager } from "@/components/webhook-manager";
import { ContractAuthorizationManager } from "@/components/contract-authorization-manager";
import { EmergencyStop } from "@/components/emergency-stop";
import type { BotConfig } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

function TestTelegramButton({ savedConfig }: { savedConfig?: BotConfig }) {
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);

  const testTelegram = async () => {
    if (!savedConfig?.telegramBotToken || !savedConfig?.telegramChatId) {
      toast({
        title: "Настройки не сохранены",
        description: "Сначала сохраните Bot Token и Chat ID",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    try {
      const response = await apiRequest("POST", "/api/telegram/test", {});

      if (response.success) {
        toast({
          title: "✅ Telegram подключен!",
          description: `Бот: @${response.botUsername}. Проверьте сообщение в чате.`,
        });
      } else {
        toast({
          title: "Ошибка подключения",
          description: response.error || "Не удалось подключиться к Telegram",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось проверить Telegram",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Button
      onClick={testTelegram}
      disabled={isTesting}
      variant="outline"
      className="w-full"
      data-testid="button-test-telegram"
    >
      <Bell className="mr-2 h-4 w-4" />
      {isTesting ? "Проверка..." : "Проверить Telegram"}
    </Button>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Partial<BotConfig>>({});
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const installScrollRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { data: savedConfig, isLoading } = useQuery<BotConfig>({
    queryKey: ["/api/bot/config"],
  });

  const [selectedNetwork, setSelectedNetwork] = useState<'polygon' | 'amoy'>('amoy');

  useEffect(() => {
    loadSettings();
    loadTelegramStatus();
  }, []);

  // Улучшенный автоскроллинг для логов установки
  useEffect(() => {
    if (installScrollRef.current && scrollAreaRef.current) {
      // Прокручиваем контейнер к последнему элементу
      const scrollArea = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [installLogs]);

  const loadSettings = () => {
    if (savedConfig) {
      setConfig(savedConfig);
    }
  };

  const loadTelegramStatus = async () => {
    try {
      const response = await fetch("/api/telegram/status", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setTelegramEnabled(data.enabled);
        setTelegramBotToken(data.botToken || "");
        setTelegramChatId(data.chatId || "");
      }
    } catch (error) {
      console.error("Failed to load Telegram status:", error);
    }
  };

  const toggleTelegram = async (enabled: boolean) => {
    try {
      const response = await fetch("/api/telegram/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setTelegramEnabled(enabled);
        toast({
          title: enabled ? "Telegram включен" : "Telegram выключен",
          description: enabled
            ? "Модуль Telegram активирован"
            : "Модуль Telegram деактивирован",
        });
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось изменить настройки Telegram",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось изменить настройки Telegram",
        variant: "destructive",
      });
    }
  };

  const saveTelegramConfig = async () => {
    try {
      const response = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          telegramBotToken,
          telegramChatId,
        }),
      });

      if (response.ok) {
        toast({
          title: "✅ Настройки Telegram сохранены",
          description: "Параметры Telegram успешно обновлены",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/bot/config"] });
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось сохранить настройки Telegram",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сохранить настройки Telegram",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    saveMutation.mutate(config);
    if (telegramEnabled) {
      saveTelegramConfig();
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<BotConfig>) => {
      return await apiRequest("POST", "/api/bot/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/config"] });
      toast({
        title: "✅ Сохранено",
        description: "Настройки успешно обновлены",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>
          <p className="text-muted-foreground">Конфигурация арбитражного бота</p>
          <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>💡 Инструкция:</strong> Настройте RPC-подключения, API ключи (1inch, PolygonScan),
              параметры торговли (минимальная прибыль, slippage), лимиты рисков и интеграции (Telegram, Ledger, Safe).
              Все изменения сохраняются автоматически. Для реальной торговли обязательно укажите Private Key и 1inch API ключ.
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          data-testid="button-save-settings"
        >
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>

      <Tabs defaultValue="network" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="network" data-testid="tab-network">
            <Network className="h-4 w-4 mr-2" />
            Сеть
          </TabsTrigger>
          <TabsTrigger value="trading" data-testid="tab-trading">
            <Zap className="h-4 w-4 mr-2" />
            Торговля
          </TabsTrigger>
          <TabsTrigger value="safe" data-testid="tab-safe">
            <Shield className="h-4 w-4 mr-2" />
            Safe & Ledger
          </TabsTrigger>
          <TabsTrigger value="telegram" data-testid="tab-telegram">
            <Bell className="h-4 w-4 mr-2" />
            Telegram
          </TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">
            <DollarSign className="h-4 w-4 mr-2" />
            Риски
          </TabsTrigger>
          <TabsTrigger value="env" data-testid="tab-env">
            <Info className="h-4 w-4 mr-2" />
            Переменные
          </TabsTrigger>
        </TabsList>

        <TabsContent value="network" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Сеть и RPC</CardTitle>
              <CardDescription>Настройки подключения к блокчейну Polygon</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="network-mode">Режим Сети</Label>
                <select
                  id="network-mode"
                  className="w-full h-10 px-3 rounded-md border bg-background"
                  value={config.networkMode || "testnet"}
                  onChange={(e) => setConfig({ ...config, networkMode: e.target.value })}
                  data-testid="select-network-mode"
                >
                  <option value="testnet">Testnet (Amoy)</option>
                  <option value="mainnet">Mainnet (Polygon)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="polygon-rpc">Polygon RPC URL</Label>
                <Input
                  id="polygon-rpc"
                  placeholder="https://polygon-rpc.com"
                  value={config.polygonRpcUrl || ""}
                  onChange={(e) => setConfig({ ...config, polygonRpcUrl: e.target.value })}
                  data-testid="input-polygon-rpc"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="testnet-rpc">Testnet RPC URL</Label>
                <Input
                  id="testnet-rpc"
                  placeholder="https://rpc-amoy.polygon.technology"
                  value={config.polygonTestnetRpcUrl || ""}
                  onChange={(e) => setConfig({ ...config, polygonTestnetRpcUrl: e.target.value })}
                  data-testid="input-testnet-rpc"
                />
                <Alert className="mt-2">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2 text-xs">
                      <p className="font-medium text-primary">✅ Рекомендуется настроить через Secrets:</p>
                      <p>Tools → Secrets → POLYGON_TESTNET_RPC_URL → <code className="bg-muted px-1 py-0.5 rounded">https://rpc-amoy.polygon.technology</code></p>
                      <div className="mt-2">
                        <p className="font-medium">Другие бесплатные RPC:</p>
                        <div className="pl-3 space-y-0.5 mt-1">
                          <p>• Testnet: <code className="bg-muted px-1 py-0.5 rounded">https://rpc-amoy.polygon.technology</code></p>
                          <p>• Mainnet: <code className="bg-muted px-1 py-0.5 rounded">https://polygon-rpc.com</code></p>
                          <p>• Mainnet: <code className="bg-muted px-1 py-0.5 rounded">https://polygon-bor-rpc.publicnode.com</code></p>
                        </div>
                      </div>
                      <p className="mt-2 text-destructive font-medium">⚠️ НЕ используйте rpc.ankr.com/polygon_amoy (требует API ключ!)</p>
                      <p className="mt-1">
                        Больше на{' '}
                        <a href="https://chainlist.org/chain/80002" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Chainlist <ExternalLink className="inline h-3 w-3" />
                        </a>
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="flash-loan-contract" className="flex items-center gap-2">
                  Flash Loan Contract - Aave Pool Address
                  {!config.flashLoanContract && (
                    <Badge variant="destructive" className="text-xs">
                      Требуется
                    </Badge>
                  )}
                </Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      id="flashLoanContract"
                      value={config.flashLoanContract || ""}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setConfig({ ...config, flashLoanContract: newValue });
                        saveMutation.mutate({ ...config, flashLoanContract: newValue });
                      }}
                      placeholder="0x... (адрес ArbitrageExecutor контракта)"
                      data-testid="input-flashloan-contract"
                      className="flex-1"
                    />
                  </div>
                  <div className="space-y-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setInstallDialogOpen(true);
                        setInstallLogs([]);
                        setIsInstalling(true);

                        const addLog = (msg: string) => {
                          setInstallLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
                        };

                        addLog("🔍 Проверка зависимостей...");

                        try {
                          const verifyResponse = await fetch('/api/contracts/verify-deps', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                          });

                          if (!verifyResponse.ok) {
                            throw new Error(`HTTP ${verifyResponse.status}: ${verifyResponse.statusText}`);
                          }

                          const verifyContentType = verifyResponse.headers.get('content-type');
                          if (!verifyContentType || !verifyContentType.includes('application/json')) {
                            throw new Error('Сервер вернул не JSON ответ (возможно HTML страницу ошибки)');
                          }

                          const verifyData = await verifyResponse.json();

                          if (verifyData.success) {
                            addLog("✅ Все зависимости уже установлены");
                            setIsInstalling(false);
                            return;
                          }

                          addLog("⚠️ Требуется установка зависимостей");
                          if (verifyData.details) {
                            addLog(`ℹ️ ${verifyData.details}`);
                          }
                          addLog("📦 Начинаем установку Hardhat, OpenZeppelin и других пакетов...");
                          addLog("⏳ Это может занять 2-3 минуты, пожалуйста подождите.");

                          // Используем потоковую передачу для логов
                          const installResponse = await fetch('/api/contracts/install-deps', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                          });

                          if (!installResponse.ok) {
                            throw new Error(`HTTP ${installResponse.status}: ${installResponse.statusText}`);
                          }

                          const installContentType = installResponse.headers.get('content-type');

                          if (!installContentType || !installContentType.includes('text/event-stream')) {
                            addLog("⚠️ Сервер не поддерживает потоковую передачу, переключаемся на простой режим...");

                            // Используем простой метод установки
                            const simpleResponse = await fetch('/api/contracts/install-deps-simple', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' }
                            });

                            const result = await simpleResponse.json();

                            if (result.error) {
                              throw new Error(result.error);
                            }

                            if (result.stdout) {
                              result.stdout.split('\n').forEach((line: string) => {
                                if (line.trim()) addLog(line);
                              });
                            }

                            addLog(result.message || "✅ Установка завершена");
                            setIsInstalling(false);
                            return;
                          }

                          const reader = installResponse.body?.getReader();
                          const decoder = new TextDecoder();

                          if (!reader) {
                            throw new Error('Не удалось получить reader для потока');
                          }

                          let buffer = '';

                          while (true) {
                            const { done, value } = await reader.read();

                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                              if (line.startsWith('data: ')) {
                                try {
                                  const data = JSON.parse(line.slice(6));
                                  if (data.log) {
                                    addLog(data.log);
                                  }
                                  if (data.success !== undefined) {
                                    if (data.success) {
                                      addLog("✅ Установка завершена успешно!");
                                    } else {
                                      addLog(`❌ Ошибка: ${data.error || 'Неизвестная ошибка'}`);
                                    }
                                  }
                                } catch (e) {
                                  console.error('Ошибка парсинга SSE:', e, 'line:', line);
                                  addLog(`⚠️ Ошибка парсинга: ${line.slice(0, 100)}...`);
                                }
                              }
                            }
                          }

                        } catch (error: any) {
                          console.error('Полная ошибка установки:', error);

                          if (error.message.includes('not valid JSON')) {
                            addLog(`❌ ОШИБКА: Сервер вернул HTML вместо JSON`);
                            addLog(`ℹ️ Возможные причины:`);
                            addLog(`   1. API маршрут не найден (проверьте server/routes/contracts.ts)`);
                            addLog(`   2. Сервер перезапускается`);
                            addLog(`   3. Ошибка на стороне сервера`);
                            addLog(`💡 Попробуйте перезапустить приложение (Stop → Run)`);
                          } else if (error.message.includes('Failed to fetch')) {
                            addLog(`❌ ОШИБКА: Не удалось подключиться к серверу`);
                            addLog(`💡 Проверьте, что сервер запущен`);
                          } else {
                            addLog(`❌ ОШИБКА УСТАНОВКИ:`);
                            addLog(error.message);
                          }

                          if (error.stack) {
                            console.error('Stack trace:', error.stack);
                          }
                        } finally {
                          setIsInstalling(false);
                        }
                      }}
                      disabled={isInstalling}
                    >
                      {isInstalling ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                          Установка...
                        </>
                      ) : (
                        <>
                          <Package className="h-4 w-4 mr-2" />
                          📦 Проверить / Установить зависимости
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={async () => {
                        if (!config.privateKey) {
                          toast({
                            title: "❌ Private Key не установлен",
                            description: "Сначала настройте Private Key ниже в разделе API Keys",
                            variant: "destructive",
                          });
                          return;
                        }

                        const deployToast = toast({
                          title: "🚀 Запуск автодеплоя контракта...",
                          description: `Развертывание ArbitrageExecutor в ${config.networkMode === 'mainnet' ? 'Polygon Mainnet' : 'Amoy Testnet'}`,
                          duration: 120000,
                        });

                        try {
                          const response = await fetch('/api/contracts/auto-deploy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              network: config.networkMode === 'mainnet' ? 'polygon' : 'amoy',
                              privateKey: config.privateKey,
                              aavePoolAddress: config.networkMode === 'mainnet'
                                ? '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb'
                                : '0x0496275d34753A48320CA58103d5220d394FF77F'
                            })
                          });

                          const data = await response.json();

                          if (!response.ok) {
                            throw new Error(data.error || 'Ошибка деплоя');
                          }

                          deployToast.dismiss();

                          // Автоматически сохраняем адрес контракта
                          if (data.proxyAddress) {
                            const updatedConfig = { ...config, flashLoanContract: data.proxyAddress };
                            setConfig(updatedConfig);

                            // Принудительно сохраняем в БД
                            await apiRequest("POST", "/api/bot/config", updatedConfig);
                            queryClient.invalidateQueries({ queryKey: ["/api/bot/config"] });

                            toast({
                              title: "✅ Контракт успешно развернут и настроен!",
                              description: `Адрес автоматически сохранен: ${data.proxyAddress?.substring(0, 10)}...${data.proxyAddress?.substring(data.proxyAddress.length - 8)}`,
                            });
                          } else {
                            toast({
                              title: "⚠️ Контракт развернут, но адрес не получен",
                              description: "Проверьте логи деплоя",
                              variant: "destructive",
                            });
                          }
                        } catch (error: any) {
                          deployToast.dismiss();
                          toast({
                            title: "❌ Ошибка деплоя",
                            description: error.message,
                            variant: "destructive",
                          });
                        }
                      }}
                      className="w-full"
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      {config.networkMode === 'mainnet' ? '🔴 Автодеплой Mainnet' : '🟢 Автодеплой Testnet'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Адрес развернутого ArbitrageExecutor контракта (НЕ Aave Pool!).
                    Нажмите кнопку "Автодеплой" выше для автоматического развертывания.
                  </p>
                  {!config.flashLoanContract && (
                    <Alert className="border-destructive/50">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <AlertDescription>
                        <div className="text-xs space-y-2">
                          <p className="font-medium text-destructive">⚠️ Контракт не развернут!</p>
                          <p>Для начала работы необходимо развернуть ArbitrageExecutor контракт:</p>
                          <div className="mt-2 space-y-2">
                            <div className="p-2 bg-green-500/10 border border-green-500/20 rounded">
                              <p className="font-medium text-green-600">✅ Автоматический деплой (рекомендуется):</p>
                              <ol className="mt-1 pl-4 space-y-1 text-xs">
                                <li>1. Нажмите "📦 Проверить / Установить зависимости" (только первый раз)</li>
                                <li>2. Настройте Private Key ниже в разделе "API Keys"</li>
                                <li>3. Нажмите кнопку "{config.networkMode === 'mainnet' ? '🔴 Автодеплой Mainnet' : '🟢 Автодеплой Testnet'}"</li>
                                <li>4. Дождитесь завершения (60-120 сек)</li>
                                <li>5. Адрес контракта появится автоматически!</li>
                              </ol>
                            </div>
                            <div className="p-2 bg-muted rounded">
                              <p className="font-medium">📝 Или ручной деплой через терминал:</p>
                              <code className="block mt-1 p-2 bg-background rounded text-xs">
                                cd contracts<br/>
                                npm install --legacy-peer-deps<br/>
                                npm run deploy:aave:{config.networkMode === 'mainnet' ? 'polygon' : 'amoy'}
                              </code>
                              <p className="mt-1 text-xs">После деплоя скопируйте Proxy Address и вставьте выше</p>
                            </div>
                          </div>
                          <Alert className="mt-2 border-amber-500/50 bg-amber-500/10">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <AlertDescription className="text-xs">
                              <p className="font-medium">Текущая сеть: <code>{config.networkMode === 'mainnet' ? 'Polygon Mainnet' : 'Polygon Amoy Testnet'}</code></p>
                              <p className="mt-1">Aave V3 Pool автоматически выбирается для текущей сети</p>
                            </AlertDescription>
                          </Alert>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  {config.flashLoanContract && config.flashLoanContract !== '0x0000000000000000000000000000000000000000' && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertDescription>
                        <p className="text-xs text-green-600">✅ Контракт настроен: {config.flashLoanContract.substring(0, 10)}...{config.flashLoanContract.substring(config.flashLoanContract.length - 8)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {config.flashLoanContract === '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
                            ? '🔵 Aave V3 Pool (официальный адрес)'
                            : '🟢 Custom контракт'}
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>

              <Separator />

              <ContractAuthorizationManager />

              <Separator />

              <h4 className="font-medium">API Keys</h4>

              <div className="space-y-2">
                <Label htmlFor="privateKey" className="flex items-center gap-2">
                  Private Key (для реальной торговли)
                  {!config.privateKey && (
                    <Badge variant="destructive" className="text-xs">
                      Требуется для реальной торговли
                    </Badge>
                  )}
                </Label>
                <Input
                  id="privateKey"
                  placeholder="0x... (64 символа после 0x)"
                  type="password"
                  value={config.privateKey || ""}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    setConfig({ ...config, privateKey: value });
                  }}
                  data-testid="input-private-key"
                />
                <p className="text-xs text-muted-foreground">
                  Формат: 0x + 64 символа (hex). Используется только для подписания реальных транзакций.
                </p>
                {config.privateKey && config.privateKey.length > 0 && (
                  <p className={`text-xs ${
                    config.privateKey.startsWith('0x') && config.privateKey.length === 66
                      ? 'text-green-500'
                      : 'text-destructive'
                  }`}>
                    {config.privateKey.startsWith('0x') && config.privateKey.length === 66
                      ? '✓ Формат корректный'
                      : '✗ Неверный формат (должно быть 0x + 64 символа)'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="use-flashbots" className="flex items-center gap-2">
                  Flashbots Protection
                  <Badge variant="outline" className="text-xs">
                    MEV защита
                  </Badge>
                </Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="use-flashbots"
                    checked={config.useFlashbots || false}
                    onChange={(e) => setConfig({ ...config, useFlashbots: e.target.checked })}
                    className="h-4 w-4"
                    data-testid="checkbox-use-flashbots"
                  />
                  <span className="text-sm text-muted-foreground">
                    Отправлять транзакции через Flashbots RPC для защиты от frontrunning
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="polygonscan-api-key" className="flex items-center gap-2">
                  PolygonScan API Key
                  <Badge variant="outline" className="text-xs">
                    Для верификации контрактов
                  </Badge>
                </Label>
                <Input
                  id="polygonscan-api-key"
                  placeholder="Введите ваш PolygonScan API ключ"
                  type="password"
                  value={config.polygonscanApiKey || ''}
                  onChange={(e) => setConfig({ ...config, polygonscanApiKey: e.target.value })}
                  data-testid="input-polygonscan-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  {config.polygonscanApiKey ? (
                    <span className="text-green-600">✅ API ключ настроен</span>
                  ) : (
                    <span>Необходим для верификации смарт-контрактов.</span>
                  )}
                  {' '}Получите бесплатный ключ на{' '}
                  <a
                    href="https://polygonscan.com/myapikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    polygonscan.com/myapikey
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wallet-address" className="flex items-center gap-2">
                  Адрес Кошелька (для проверки баланса)
                  <Badge variant="outline" className="text-xs">
                    Опционально
                  </Badge>
                </Label>
                <Input
                  id="wallet-address"
                  placeholder="0x... (адрес кошелька для проверки баланса)"
                  value={config.walletAddress || ""}
                  onChange={(e) => setConfig({ ...config, walletAddress: e.target.value })}
                  data-testid="input-wallet-address"
                />
                <p className="text-xs text-muted-foreground">
                  Укажите адрес кошелька для проверки баланса MATIC и USDC.
                  Если не указан, используется адрес из приватного ключа.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="oneinch-api-key" className="flex items-center gap-2">
                  1inch API Key
                  {!config.oneinchApiKey && (
                    <Badge variant="destructive" className="text-xs">
                      Требуется для реальной торговли
                    </Badge>
                  )}
                </Label>
                <Input
                  id="oneinch-api-key"
                  placeholder="Введите ваш 1inch API ключ"
                  type="password"
                  value={config.oneinchApiKey || ''}
                  onChange={(e) => setConfig({ ...config, oneinchApiKey: e.target.value })}
                  data-testid="input-oneinch-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  {!config.oneinchApiKey ? (
                    <span className="text-destructive font-medium">
                      ⚠️ ОБЯЗАТЕЛЬНО для реальной торговли!
                    </span>
                  ) : (
                    <span className="text-green-600">✅ API ключ настроен</span>
                  )}
                  {' '}Получите бесплатный ключ на{' '}
                  <a
                    href="https://portal.1inch.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    portal.1inch.dev
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gecko-terminal-enabled">GeckoTerminal API (Бесплатно)</Label>
                  <Switch
                    id="gecko-terminal-enabled"
                    checked={config.geckoTerminalEnabled !== false}
                    onCheckedChange={(checked) => setConfig({ ...config, geckoTerminalEnabled: checked })}
                    data-testid="switch-gecko-terminal"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  GeckoTerminal API - бесплатный, без регистрации. 30 запросов/мин.
                </p>
              </div>

              <Separator />

              <h4 className="font-medium">Rate Limits</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="oneinch-rate">1inch Rate Limit</Label>
                  <Input
                    id="oneinch-rate"
                    type="number"
                    value={config.oneinchRateLimit || 150}
                    onChange={(e) => setConfig({ ...config, oneinchRateLimit: parseInt(e.target.value) || 150 })}
                    data-testid="input-oneinch-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gecko-rate">GeckoTerminal Limit</Label>
                  <Input
                    id="gecko-rate"
                    type="number"
                    value={config.geckoTerminalRateLimit || 30}
                    onChange={(e) => setConfig({ ...config, geckoTerminalRateLimit: parseInt(e.target.value) || 30 })}
                    data-testid="input-gecko-rate"
                  />
                  <p className="text-xs text-muted-foreground">Рекомендуется: 30 запросов/мин</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quickswap-rate">QuickSwap Rate Limit</Label>
                  <Input
                    id="quickswap-rate"
                    type="number"
                    value={config.quickswapRateLimit || 1000}
                    onChange={(e) => setConfig({ ...config, quickswapRateLimit: parseInt(e.target.value) || 1000 })}
                    data-testid="input-quickswap-rate"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trading" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Торговые Параметры</CardTitle>
              <CardDescription>Настройки стратегии и прибыльности</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min-profit">Мин. Прибыль (%)</Label>
                  <Input
                    id="min-profit"
                    type="number"
                    step="0.01"
                    value={config.minProfitPercent || ""}
                    onChange={(e) => setConfig({ ...config, minProfitPercent: e.target.value })}
                    data-testid="input-min-profit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-net-profit">Мин. Чистая Прибыль (%)</Label>
                  <Input
                    id="min-net-profit"
                    type="number"
                    step="0.01"
                    value={config.minNetProfitPercent || ""}
                    onChange={(e) => setConfig({ ...config, minNetProfitPercent: e.target.value })}
                    data-testid="input-min-net-profit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-net-profit-usd">Мин. Чистая Прибыль ($)</Label>
                  <Input
                    id="min-net-profit-usd"
                    type="number"
                    step="0.01"
                    value={config.minNetProfitUsd || ""}
                    onChange={(e) => setConfig({ ...config, minNetProfitUsd: e.target.value })}
                    data-testid="input-min-net-profit-usd"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="flash-loan-amount">Сумма Flash Loan (USDC)</Label>
                  <Input
                    id="flash-loan-amount"
                    type="number"
                    value={config.flashLoanAmount || ""}
                    onChange={(e) => setConfig({ ...config, flashLoanAmount: parseInt(e.target.value) || 0 })}
                    data-testid="input-flash-loan-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scan-interval">Интервал Сканирования (сек)</Label>
                  <Input
                    id="scan-interval"
                    type="number"
                    value={config.scanInterval || 30}
                    onChange={(e) => setConfig({ ...config, scanInterval: parseInt(e.target.value) || 30 })}
                    data-testid="input-scan-interval"
                  />
                </div>
              </div>

              <Separator />

              <h4 className="font-medium">Gas Настройки</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-gas">Макс. Gas Price (Gwei)</Label>
                  <Input
                    id="max-gas"
                    type="number"
                    value={config.maxGasPriceGwei || ""}
                    onChange={(e) => setConfig({ ...config, maxGasPriceGwei: parseInt(e.target.value) || 0 })}
                    data-testid="input-max-gas"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority-fee">Priority Fee (Gwei)</Label>
                  <Input
                    id="priority-fee"
                    type="number"
                    step="0.1"
                    value={config.priorityFeeGwei || ""}
                    onChange={(e) => setConfig({ ...config, priorityFeeGwei: e.target.value })}
                    data-testid="input-priority-fee"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base-fee-multiplier">Base Fee Multiplier</Label>
                  <Input
                    id="base-fee-multiplier"
                    type="number"
                    step="0.001"
                    value={config.baseFeeMultiplier || ""}
                    onChange={(e) => setConfig({ ...config, baseFeeMultiplier: e.target.value })}
                    data-testid="input-base-fee-multiplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-gas-limit">Макс. Gas Limit</Label>
                  <Input
                    id="max-gas-limit"
                    type="number"
                    value={config.maxGasLimit || 1500000}
                    onChange={(e) => setConfig({ ...config, maxGasLimit: parseInt(e.target.value) || 1500000 })}
                    data-testid="input-max-gas-limit"
                  />
                </div>
              </div>

              <Separator />

              <h4 className="font-medium">Дополнительные Параметры</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="liquidity-multiplier">Liquidity Multiplier</Label>
                  <Input
                    id="liquidity-multiplier"
                    type="number"
                    value={config.liquidityMultiplier || 5}
                    onChange={(e) => setConfig({ ...config, liquidityMultiplier: parseInt(e.target.value) || 5 })}
                    data-testid="input-liquidity-multiplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dex-reserve-multiplier">DEX Reserve Multiplier</Label>
                  <Input
                    id="dex-reserve-multiplier"
                    type="number"
                    value={config.dexReserveMultiplier || 10}
                    onChange={(e) => setConfig({ ...config, dexReserveMultiplier: parseInt(e.target.value) || 10 })}
                    data-testid="input-dex-reserve-multiplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="static-slippage">Static Slippage (%)</Label>
                  <Input
                    id="static-slippage"
                    type="number"
                    step="0.01"
                    value={config.staticSlippagePercent || ""}
                    onChange={(e) => setConfig({ ...config, staticSlippagePercent: e.target.value })}
                    data-testid="input-static-slippage"
                  />
                </div>
              </div>

              <Separator />

              <h4 className="font-medium">Retry & Timeout</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-retry">Макс. Попыток Retry</Label>
                  <Input
                    id="max-retry"
                    type="number"
                    value={config.maxRetryAttempts || 3}
                    onChange={(e) => setConfig({ ...config, maxRetryAttempts: parseInt(e.target.value) || 3 })}
                    data-testid="input-max-retry"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retry-delay">Задержка Retry (сек)</Label>
                  <Input
                    id="retry-delay"
                    type="number"
                    value={config.retryDelaySeconds || 5}
                    onChange={(e) => setConfig({ ...config, retryDelaySeconds: parseInt(e.target.value) || 5 })}
                    data-testid="input-retry-delay"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safe" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gnosis Safe Multisig</CardTitle>
              <CardDescription>Настройки мультиподписи</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="safe-address">Адрес Safe</Label>
                <Input
                  id="safe-address"
                  placeholder="0x..."
                  value={config.gnosisSafeAddress || ""}
                  onChange={(e) => setConfig({ ...config, gnosisSafeAddress: e.target.value })}
                  className="font-mono text-sm"
                  data-testid="input-safe-address"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Автоматическая Подпись</Label>
                  <p className="text-sm text-muted-foreground">
                    Автоматически подписывать транзакции
                  </p>
                </div>
                <Switch
                  checked={config.safeAutoSignEnabled || false}
                  onCheckedChange={(checked) => setConfig({ ...config, safeAutoSignEnabled: checked })}
                  data-testid="switch-safe-auto-sign"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="safe-retry-interval">Интервал Проверки (мин)</Label>
                  <Input
                    id="safe-retry-interval"
                    type="number"
                    value={config.safeRetryIntervalMinutes || 30}
                    onChange={(e) => setConfig({ ...config, safeRetryIntervalMinutes: parseInt(e.target.value) || 30 })}
                    data-testid="input-safe-retry-interval"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="safe-max-pending">Макс. Ожидание (часы)</Label>
                  <Input
                    id="safe-max-pending"
                    type="number"
                    value={config.safeMaxPendingHours || 24}
                    onChange={(e) => setConfig({ ...config, safeMaxPendingHours: parseInt(e.target.value) || 24 })}
                    data-testid="input-safe-max-pending"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ledger Hardware Wallet</CardTitle>
              <CardDescription>Настройки аппаратного кошелька</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Включить Ledger</Label>
                  <p className="text-sm text-muted-foreground">
                    Использовать Ledger для подписи
                  </p>
                </div>
                <Switch
                  checked={config.ledgerEnabled || false}
                  onCheckedChange={(checked) => setConfig({ ...config, ledgerEnabled: checked })}
                  data-testid="switch-ledger-enabled"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ledger-timeout">Timeout (секунды)</Label>
                  <Input
                    id="ledger-timeout"
                    type="number"
                    value={config.ledgerTimeoutSeconds || 10}
                    onChange={(e) => setConfig({ ...config, ledgerTimeoutSeconds: parseInt(e.target.value) || 10 })}
                    data-testid="input-ledger-timeout"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ledger-low-battery">Низкий Заряд (%)</Label>
                  <Input
                    id="ledger-low-battery"
                    type="number"
                    value={config.ledgerLowBatteryThreshold || 20}
                    onChange={(e) => setConfig({ ...config, ledgerLowBatteryThreshold: parseInt(e.target.value) || 20 })}
                    data-testid="input-ledger-low-battery"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ledger-critical-battery">Критический Заряд (%)</Label>
                  <Input
                    id="ledger-critical-battery"
                    type="number"
                    value={config.ledgerCriticalBatteryThreshold || 10}
                    onChange={(e) => setConfig({ ...config, ledgerCriticalBatteryThreshold: parseInt(e.target.value) || 10 })}
                    data-testid="input-ledger-critical-battery"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ledger-derivation">Derivation Path</Label>
                <Input
                  id="ledger-derivation"
                  placeholder="44'/60'/0'/0/0"
                  value={config.ledgerDerivationPath || ""}
                  onChange={(e) => setConfig({ ...config, ledgerDerivationPath: e.target.value })}
                  className="font-mono text-sm"
                  data-testid="input-ledger-derivation"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Telegram QR Fallback</Label>
                  <p className="text-sm text-muted-foreground">
                    Отправлять QR при timeout
                  </p>
                </div>
                <Switch
                  checked={config.ledgerTelegramFallback || false}
                  onCheckedChange={(checked) => setConfig({ ...config, ledgerTelegramFallback: checked })}
                  data-testid="switch-ledger-telegram-fallback"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Проверка Батареи</Label>
                  <p className="text-sm text-muted-foreground">
                    Проверять заряд перед подписью
                  </p>
                </div>
                <Switch
                  checked={config.ledgerBatteryCheckEnabled || false}
                  onCheckedChange={(checked) => setConfig({ ...config, ledgerBatteryCheckEnabled: checked })}
                  data-testid="switch-ledger-battery-check"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Отклонять при Критическом Заряде</Label>
                  <p className="text-sm text-muted-foreground">
                    Блокировать подпись при критически низком заряде
                  </p>
                </div>
                <Switch
                  checked={config.ledgerRejectOnCriticalBattery || false}
                  onCheckedChange={(checked) => setConfig({ ...config, ledgerRejectOnCriticalBattery: checked })}
                  data-testid="switch-ledger-reject-critical"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Использовать для Safe Signer 2</Label>
                  <p className="text-sm text-muted-foreground">
                    Ledger как второй подписант Safe
                  </p>
                </div>
                <Switch
                  checked={config.useLedgerForSafeSigner2 || false}
                  onCheckedChange={(checked) => setConfig({ ...config, useLedgerForSafeSigner2: checked })}
                  data-testid="switch-ledger-safe-signer2"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telegram" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Telegram модуль</CardTitle>
              <CardDescription>
                Включите Telegram для получения уведомлений о торговых операциях
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="telegram-enabled" className="flex flex-col space-y-1">
                  <span>Включить Telegram</span>
                  <span className="font-normal text-sm text-muted-foreground">
                    Активировать интеграцию с Telegram ботом
                  </span>
                </Label>
                <Switch
                  id="telegram-enabled"
                  checked={telegramEnabled}
                  onCheckedChange={toggleTelegram}
                />
              </div>
            </CardContent>
          </Card>

          {telegramEnabled && (
            <Card>
              <CardHeader>
                <CardTitle>Настройки Telegram</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="telegram-token">Bot Token</Label>
                  <Input
                    id="telegram-token"
                    type="password"
                    placeholder="••••••••:••••••••••••••••••••••••"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    className="font-mono"
                    data-testid="input-telegram-token"
                  />
                  <p className="text-xs text-muted-foreground">
                    Создайте бота через{" "}
                    <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      @BotFather <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-chat-id">Chat ID</Label>
                  <Input
                    id="telegram-chat-id"
                    placeholder="123456789 или -1001234567890 для групп"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className="font-mono"
                    data-testid="input-telegram-chat-id"
                  />
                  <p className="text-xs text-muted-foreground">
                    Личный чат: получите ID через{" "}
                    <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      @userinfobot <ExternalLink className="inline h-3 w-3" />
                    </a>
                    {" "}• Группы: ID начинается с минуса (-)
                  </p>
                </div>

                <TestTelegramButton savedConfig={{ ...savedConfig, telegramBotToken, telegramChatId }} />

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="telegram-profit-threshold">Порог Уведомлений о Прибыли ($)</Label>
                  <Input
                    id="telegram-profit-threshold"
                    type="number"
                    step="0.01"
                    value={config.telegramProfitThresholdUsd || ""}
                    onChange={(e) => setConfig({ ...config, telegramProfitThresholdUsd: e.target.value })}
                    data-testid="input-telegram-profit-threshold"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-failed-interval">Интервал Сводки Ошибок (мин)</Label>
                  <Input
                    id="telegram-failed-interval"
                    type="number"
                    value={config.telegramFailedTxSummaryIntervalMinutes || 30}
                    onChange={(e) => setConfig({ ...config, telegramFailedTxSummaryIntervalMinutes: parseInt(e.target.value) || 30 })}
                    data-testid="input-telegram-failed-interval"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Webhook Management */}
          <WebhookManager />
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Управление Рисками
              </CardTitle>
              <CardDescription>Критические настройки безопасности и лимиты</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-loan-usd">Макс. Loan ($)</Label>
                  <Input
                    id="max-loan-usd"
                    type="number"
                    value={config.maxLoanUsd || 50000}
                    onChange={(e) => setConfig({ ...config, maxLoanUsd: parseInt(e.target.value) || 50000 })}
                    data-testid="input-max-loan-usd"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-loss-limit">Дневной Лимит Убытков ($)</Label>
                  <Input
                    id="daily-loss-limit"
                    type="number"
                    step="0.01"
                    value={config.dailyLossLimit || ""}
                    onChange={(e) => setConfig({ ...config, dailyLossLimit: e.target.value })}
                    data-testid="input-daily-loss-limit"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-single-loss">Макс. Убыток за Сделку ($)</Label>
                  <Input
                    id="max-single-loss"
                    type="number"
                    step="0.01"
                    value={config.maxSingleLossUsd || ""}
                    onChange={(e) => setConfig({ ...config, maxSingleLossUsd: e.target.value })}
                    data-testid="input-max-single-loss"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergency-pause-drawdown">Аварийная Пауза Просадка (%)</Label>
                  <Input
                    id="emergency-pause-drawdown"
                    type="number"
                    step="0.01"
                    value={config.emergencyPauseDrawdownPercent || ""}
                    onChange={(e) => setConfig({ ...config, emergencyPauseDrawdownPercent: e.target.value })}
                    data-testid="input-emergency-pause-drawdown"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="insurance-wallet">Адрес Страхового Кошелька</Label>
                <Input
                  id="insurance-wallet"
                  placeholder="0x..."
                  value={config.insuranceWalletAddress || ""}
                  onChange={(e) => setConfig({ ...config, insuranceWalletAddress: e.target.value })}
                  className="font-mono text-sm"
                  data-testid="input-insurance-wallet"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance-percent">Процент в Страховой Фонд (%)</Label>
                <Input
                  id="insurance-percent"
                  type="number"
                  step="0.01"
                  value={config.insuranceFundPercent || ""}
                  onChange={(e) => setConfig({ ...config, insuranceFundPercent: e.target.value })}
                  data-testid="input-insurance-percent"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Автоматическая Пауза</Label>
                  <p className="text-sm text-muted-foreground">
                    Остановить бот при просадке
                  </p>
                </div>
                <Switch
                  checked={config.autoPauseEnabled || false}
                  onCheckedChange={(checked) => setConfig({ ...config, autoPauseEnabled: checked })}
                  data-testid="switch-auto-pause"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Режим Симуляции</Label>
                  <p className="text-sm text-muted-foreground">
                    Работа без реальных транзакций
                  </p>
                </div>
                <Switch
                  checked={config.useSimulation || false}
                  onCheckedChange={(checked) => setConfig({ ...config, useSimulation: checked, enableRealTrading: !checked })}
                  data-testid="switch-use-simulation"
                />
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5">
                  <Label className={config.enableRealTrading ? "text-green-600 font-bold" : "text-muted-foreground"}>
                    {config.enableRealTrading ? "✅ Реальная Торговля АКТИВНА" : "Реальная Торговля"}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {config.enableRealTrading
                      ? "🚀 Сделки выполняются на блокчейне с реальными средствами"
                      : "⚠️ Включить выполнение реальных сделок"
                    }
                  </p>
                  {config.enableRealTrading &&
                   <p className="text-xs text-muted-foreground mt-2">
                      ✅ Для реальной торговли убедитесь: 1) Private Key настроен 2) MATIC баланс &gt; 0.5 3) 1inch API ключ добавлен 4) Контракт развернут
                      </p>
                    }
                </div>
                <Switch
                  checked={config.enableRealTrading || false}
                  onCheckedChange={(checked) => setConfig({ ...config, enableRealTrading: checked, useSimulation: !checked })}
                  data-testid="switch-real-trading"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-destructive font-bold">🚨 Emergency Controls</Label>
                <p className="text-sm text-muted-foreground">
                  Немедленная остановка всех торговых операций
                </p>
                <EmergencyStop />
              </div>
            </CardContent>
          </Card>

          {/* Token Whitelist Management */}
          <TokenWhitelistManager />
        </TabsContent>

        <TabsContent value="env" className="space-y-6">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                ВАЖНО: Настройка RPC URL
              </CardTitle>
              <CardDescription>
                Для устранения ошибки "Unauthorized: You must authenticate your request" выполните следующие шаги
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-primary/50 bg-primary/5">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <div className="space-y-3">
                    <p className="font-bold text-primary">📋 Пошаговая инструкция:</p>
                    <ol className="list-decimal list-inside text-sm space-y-2 ml-2">
                      <li>Откройте <strong>Tools → Secrets</strong> (или нажмите 🔒 на левой панели)</li>
                      <li>Найдите переменную <code className="bg-muted px-2 py-0.5 rounded">POLYGON_TESTNET_RPC_URL</code></li>
                      <li>Если она есть - нажмите три точки → Edit, если нет - нажмите "New secret"</li>
                      <li>Установите значение: <code className="bg-muted px-2 py-0.5 rounded text-primary">https://rpc-amoy.polygon.technology</code></li>
                      <li>Нажмите "Add new secret" (или "Save")</li>
                      <li>Остановите приложение (Stop) и запустите снова (Run)</li>
                    </ol>
                    <p className="text-xs text-muted-foreground mt-3">
                      ⚠️ <strong>НЕ используйте</strong> rpc.ankr.com/polygon_amoy - этот RPC требует API ключ!
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Все Переменные Окружения
              </CardTitle>
              <CardDescription>
                Полный список переменных для работы бота. Все хранятся в Secrets (Tools → Secrets)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">🔒 Для безопасности добавьте эти переменные в Secrets (не в код!)</p>
                    <p className="text-xs">Tools → Secrets → Add Secret</p>
                  </div>
                </AlertDescription>
              </Alert>

              <Separator />

              <div className="space-y-6">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <h4 className="font-bold text-red-900 dark:text-red-100 mb-3">🔑 ОБЯЗАТЕЛЬНЫЕ для реальной торговли:</h4>

                  <div className="space-y-4">
                    <div className="bg-background/50 rounded p-3 border">
                      <div className="flex items-start gap-2 mb-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">PRIVATE_KEY</code>
                      </div>
                      <div className="text-sm space-y-1 pl-2">
                        <p>📌 <strong>Что:</strong> Приватный ключ вашего кошелька MetaMask/Trust Wallet</p>
                        <p>📋 <strong>Формат:</strong> Начинается с <code>0x</code>, всего 66 символов</p>
                        <p>🔍 <strong>Как получить:</strong></p>
                        <ol className="list-decimal list-inside pl-4 space-y-1">
                          <li>Откройте MetaMask</li>
                          <li>Нажмите на три точки → Account details</li>
                          <li>Export Private Key → введите пароль</li>
                          <li>Скопируйте ключ</li>
                        </ol>
                        <p className="text-red-600 font-bold mt-2">⚠️ КРИТИЧНО: Никогда не публикуйте! Только в Secrets!</p>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="bg-background/50 rounded p-3 border">
                  <div className="flex items-start gap-2 mb-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">ONEINCH_API_KEY</code>
                  </div>
                  <div className="text-sm space-y-1 pl-2">
                    <p>📌 <strong>Что:</strong> API ключ для 1inch DEX Aggregator</p>
                    <p>🔍 <strong>Как получить:</strong></p>
                    <ol className="list-decimal list-inside pl-4 space-y-1">
                      <li>Перейдите на <a href="https://portal.1inch.dev" target="_blank" className="text-primary underline">portal.1inch.dev</a></li>
                      <li>Войдите через кошелек или email</li>
                      <li>Создайте новый API Key</li>
                      <li>Скопируйте ключ</li>
                    </ol>
                  </div>
                </div>

                <div className="bg-background/50 rounded p-3 border">
                  <div className="flex items-start gap-2 mb-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">ARBITRAGE_CONTRACT</code>
                  </div>
                  <div className="text-sm space-y-1 pl-2">
                    <p>📌 <strong>Что:</strong> Адрес развернутого смарт-контракта ArbitrageExecutor</p>
                    <p>📋 <strong>Формат:</strong> <code>0x1234...5678</code> (40 символов после 0x)</p>
                    <p>🔍 <strong>Как получить:</strong></p>
                    <ol className="list-decimal list-inside pl-4 space-y-1">
                      <li>Разверните контракт: <code>cd contracts && npm run deploy:amoy</code></li>
                      <li>Скопируйте адрес из вывода</li>
                      <li>Добавьте его сюда в Secrets</li>
                    </ol>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3">📡 RPC и Сетевые Переменные:</h4>

                <div className="space-y-4">
                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">POLYGON_RPC_URL</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> RPC endpoint для подключения к Polygon Mainnet</p>
                      <p>📋 <strong>Формат:</strong> <code>https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY</code></p>
                      <p>🔍 <strong>Как получить (рекомендуется Alchemy):</strong></p>
                      <ol className="list-decimal list-inside pl-4 space-y-1">
                        <li>Зарегистрируйтесь на <a href="https://alchemy.com" target="_blank" className="text-primary underline">alchemy.com</a></li>
                        <li>Создайте новое приложение (Create App)</li>
                        <li>Выберите <strong>Polygon</strong> и <strong>Mainnet</strong></li>
                        <li>Скопируйте HTTPS URL</li>
                      </ol>
                      <p className="text-muted-foreground mt-2">💡 Альтернативы: Infura, QuickNode, Ankr</p>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">POLYGON_TESTNET_RPC_URL</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> RPC endpoint для Polygon Amoy Testnet (для тестирования)</p>
                      <p>📋 <strong>Формат:</strong> <code>https://rpc-amoy.polygon.technology</code></p>
                      <p>💡 <strong>Бесплатный вариант:</strong> <code>https://rpc-amoy.polygon.technology</code></p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <h4 className="font-bold text-yellow-900 dark:text-yellow-100 mb-3">🔧 Дополнительные Переменные (опционально):</h4>

                <div className="space-y-4">
                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">POLYGONSCAN_API_KEY</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> API ключ для PolygonScan</p>
                      <p>🔍 <strong>Как получить:</strong></p>
                      <ol className="list-decimal list-inside pl-4 space-y-1">
                        <li>Перейдите на <a href="https://polygonscan.com/myapikey" target="_blank" className="text-primary underline">polygonscan.com/myapikey</a></li>
                        <li>Зарегистрируйтесь и получите ключ</li>
                      </ol>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">TELEGRAM_BOT_TOKEN</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> Токен Telegram бота для уведомлений</p>
                      <p>🔍 <strong>Как получить:</strong></p>
                      <ol className="list-decimal list-inside pl-4 space-y-1">
                        <li>Найдите <a href="https://t.me/BotFather" target="_blank" className="text-primary underline">@BotFather</a> в Telegram</li>
                        <li>Создайте нового бота (команда <code>/newbot</code>)</li>
                        <li>Скопируйте полученный токен</li>
                      </ol>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">TELEGRAM_CHAT_ID</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> ID чата для отправки уведомлений</p>
                      <p>🔍 <strong>Как получить:</strong></p>
                      <ol className="list-decimal list-inside pl-4 space-y-1">
                        <li>Для личных сообщений: найдите <a href="https://t.me/userinfobot" target="_blank" className="text-primary underline">@userinfobot</a>, отправьте ему любое сообщение, ваш ID будет виден</li>
                        <li>Для групп: добавьте бота в группу, напишите в группу <code>/my_id @your_bot_username</code>. ID группы начинается с -100...</li>
                      </ol>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">GNOSIS_SAFE_ADDRESS</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> Адрес вашего Gnosis Safe мультиподписи</p>
                      <p>💡 <strong>Обычно уже настроено:</strong> Если вы используете Safe, этот адрес должен быть в Secrets</p>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">SAFE_SIGNER2_KEY</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Что:</strong> Приватный ключ второго подписанта для Safe</p>
                      <p>⚠️ <strong>Безопасность:</strong> Храните строго в Secrets!</p>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded p-3 border">
                    <div className="flex items-start gap-2 mb-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded font-mono font-bold">DATABASE_URL</code>
                    </div>
                    <div className="text-sm space-y-1 pl-2">
                      <p>📌 <strong>Зачем:</strong> PostgreSQL база данных (автоматически создается в Replit)</p>
                      <p>💡 <strong>Обычно уже настроено:</strong> Проверьте в Secrets, должен быть установлен автоматически</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3">✅ Чек-лист проверки Secrets:</h4>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>PRIVATE_KEY</code> - добавлен (66 символов, начинается с 0x)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>POLYGON_RPC_URL</code> - добавлен (Alchemy/Infura URL)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>POLYGON_TESTNET_RPC_URL</code> - добавлен (для тестов)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>ONEINCH_API_KEY</code> - добавлен (1inch Portal)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>ARBITRAGE_CONTRACT</code> - добавлен (после деплоя контракта)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>POLYGONSCAN_API_KEY</code> - добавлен (опционально)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>TELEGRAM_BOT_TOKEN</code> - добавлен (опционально)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>☐</span>
                    <span><code>TELEGRAM_CHAT_ID</code> - добавлен (опционально)</span>
                  </div>
                </div>
              </div>

              <Alert className="bg-green-500/10 border-green-500/50">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-bold text-green-900 dark:text-green-100">🎉 После добавления всех переменных:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Перезапустите приложение (Stop → Run)</li>
                      <li>Проверьте логи на наличие ошибок</li>
                      <li>Запустите деплой контракта: <code>cd contracts && npm run deploy:amoy</code></li>
                      <li>Добавьте адрес контракта в <code>ARBITRAGE_CONTRACT</code></li>
                    </ol>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auto-sign Tab */}
        <TabsContent value="autosign" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Автоматическая подпись транзакций</CardTitle>
              <CardDescription>
                Настройка автоматической подписи через encrypted keystore
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Автоподпись использует зашифрованное хранилище ключей. Ваш приватный ключ из основных настроек будет использован автоматически.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Статус автоподписи</p>
                    <p className="text-sm text-muted-foreground">
                      Использует encrypted keystore для безопасной подписи
                    </p>
                  </div>
                  <Badge variant="default">Активна</Badge>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Как это работает:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Приватный ключ шифруется и сохраняется в keystore</li>
                    <li>Транзакции подписываются автоматически без MetaMask</li>
                    <li>Используется для автоматической торговли</li>
                    <li>Безопасное хранилище с паролем</li>
                  </ul>
                </div>

                <Button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/auto-sign/deploy', { method: 'POST' });
                      const data = await response.json();

                      if (data.success) {
                        toast({
                          title: "✅ Успешно",
                          description: data.message,
                        });
                      } else {
                        toast({
                          title: "Ошибка",
                          description: data.message,
                          variant: "destructive"
                        });
                      }
                    } catch (error: any) {
                      toast({
                        title: "Ошибка",
                        description: error.message,
                        variant: "destructive"
                      });
                    }
                  }}
                  className="w-full"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Проверить зависимости автоподписи
                </Button>

                <Button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/auto-sign/sign', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: '100', gasLimit: '21000' })
                      });
                      const data = await response.json();

                      if (data.success) {
                        toast({
                          title: "✅ Транзакция подписана",
                          description: `TX: ${data.txHash}`,
                        });
                      } else {
                        toast({
                          title: "Ошибка",
                          description: data.message,
                          variant: "destructive"
                        });
                      }
                    } catch (error: any) {
                      toast({
                        title: "Ошибка",
                        description: error.message,
                        variant: "destructive"
                      });
                    }
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Тестовая подпись транзакции
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 sticky bottom-0 bg-background/95 backdrop-blur-sm py-4 border-t">
        <Button
          variant="outline"
          onClick={() => setConfig(savedConfig || {})}
          disabled={saveMutation.isPending}
          data-testid="button-reset-settings"
        >
          Сбросить
        </Button>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          data-testid="button-save-all-settings"
        >
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? "Сохранение..." : "Сохранить Все Настройки"}
        </Button>
      </div>

      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {isInstalling ? "Установка зависимостей..." : "Логи установки"}
            </DialogTitle>
            <DialogDescription>
              {isInstalling ? "Пожалуйста подождите, идет установка пакетов..." : "Процесс установки завершен"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea ref={scrollAreaRef} className="h-[500px] w-full rounded border bg-muted/50 p-4">
            <div className="font-mono text-xs space-y-1">
              {installLogs.length === 0 ? (
                <p className="text-muted-foreground">Ожидание логов...</p>
              ) : (
                installLogs.map((log, idx) => {
                  const isLast = idx === installLogs.length - 1;
                  const logType =
                    log.includes("✅") || log.includes("успешно") ? "success" :
                    log.includes("❌") || log.includes("Ошибка") ? "error" :
                    log.includes("⚠️") || log.includes("предупреждение") ? "warning" :
                    log.includes("🔍") || log.includes("📦") || log.includes("📥") ? "info" :
                    log.includes("💡") ? "suggestion" :
                    "default";

                  return (
                    <div
                      key={idx}
                      ref={isLast ? installScrollRef : null}
                      className={
                        logType === "success" ? "text-green-600 font-medium" :
                        logType === "error" ? "text-red-600 font-medium" :
                        logType === "warning" ? "text-yellow-600" :
                        logType === "info" ? "text-blue-600" :
                        logType === "suggestion" ? "text-purple-600 pl-4" :
                        "text-foreground"
                      }
                    >
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          {!isInstalling && (
            <div className="flex justify-end">
              <Button onClick={() => setInstallDialogOpen(false)}>
                Закрыть
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}