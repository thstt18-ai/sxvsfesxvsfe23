
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorLogsDetailed } from "@/components/error-logs-detailed";
import { ActivityFeed } from "@/components/activity-feed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, Activity, Terminal, Search, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityLog {
  id: number;
  userId: string;
  type: string;
  level: string;
  message: string;
  metadata?: any;
  createdAt: string;
}

export default function LogsPage() {
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: logs } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
    queryFn: async () => {
      const response = await fetch("/api/activity-logs?limit=500");
      if (!response.ok) throw new Error("Failed to fetch activity logs");
      return response.json();
    },
    refetchInterval: 5000,
  });

  // Convert logs to terminal format
  useEffect(() => {
    if (logs) {
      const formatted = logs.map(log => {
        const timestamp = new Date(log.createdAt).toLocaleString('ru-RU');
        const levelIcon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : log.level === 'success' ? '✅' : 'ℹ️';
        const metadataStr = log.metadata ? ` | ${JSON.stringify(log.metadata)}` : '';
        return `[${timestamp}] ${levelIcon} [${log.type.toUpperCase()}] ${log.message}${metadataStr}`;
      });
      setTerminalLogs(formatted);
    }
  }, [logs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs, autoScroll]);

  // WebSocket real-time updates
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
          const metadataStr = log.metadata ? ` | ${JSON.stringify(log.metadata)}` : '';
          const newLine = `[${timestamp}] ${levelIcon} [${log.type.toUpperCase()}] ${log.message}${metadataStr}`;
          setTerminalLogs(prev => [...prev, newLine].slice(-500));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    return () => ws.close();
  }, []);

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
  };

  const clearLogs = () => {
    setTerminalLogs([]);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Логи системы</h1>
        <p className="text-muted-foreground">
          Детальный просмотр всех действий, ошибок и событий торговой системы
        </p>
        <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>💡 Инструкция:</strong> Терминал показывает real-time логи работы системы. 
            Используйте поиск для фильтрации, кнопки для скачивания или очистки логов. 
            Auto-scroll автоматически прокручивает к новым записям. Вкладки позволяют просмотреть все логи, только ошибки или активность.
          </p>
        </div>
      </div>

      <Tabs defaultValue="terminal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="terminal" className="gap-2">
            <Terminal className="h-4 w-4" />
            Терминал
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <FileText className="h-4 w-4" />
            Все логи
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Ошибки
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Активность
          </TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="h-5 w-5" />
                    Командная строка логов
                  </CardTitle>
                  <CardDescription>Real-time системные логи в формате терминала</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    {filteredLogs.length} записей
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск в логах... (type, message, error, etc.)"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="pl-8 font-mono"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={downloadLogs}
                  title="Скачать логи"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={clearLogs}
                  title="Очистить терминал"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant={autoScroll ? "default" : "outline"}
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  {autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
                </Button>
              </div>

              <div
                ref={terminalRef}
                className={cn(
                  "bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-[600px] overflow-auto",
                  "scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-900"
                )}
                style={{
                  fontFamily: "'Courier New', monospace",
                  lineHeight: "1.5",
                }}
              >
                {filteredLogs.length === 0 ? (
                  <div className="text-gray-500">
                    <p>$ Waiting for logs...</p>
                    <p className="animate-pulse">_</p>
                  </div>
                ) : (
                  filteredLogs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        "hover:bg-gray-900 px-2 py-0.5 rounded transition-colors",
                        log.includes('❌') && "text-red-400",
                        log.includes('⚠️') && "text-yellow-400",
                        log.includes('✅') && "text-green-400",
                        log.includes('ℹ️') && "text-blue-400"
                      )}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <ActivityFeed />
            <ErrorLogsDetailed />
          </div>
        </TabsContent>

        <TabsContent value="errors">
          <ErrorLogsDetailed />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}
