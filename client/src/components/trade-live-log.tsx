
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Download, Trash2, Search } from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  metadata?: any;
}

export function TradeLiveLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'activity_log' && data.data) {
          const log = data.data;
          const newEntry: LogEntry = {
            timestamp: new Date(log.createdAt).toLocaleTimeString('ru-RU'),
            level: log.level,
            message: log.message,
            metadata: log.metadata
          };
          setLogs(prev => [...prev, newEntry].slice(-200));
        }
      } catch (error) {
        console.error('Error parsing log:', error);
      }
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log =>
    log.message.toLowerCase().includes(filter.toLowerCase())
  );

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      default: return 'text-blue-400';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  const downloadLogs = () => {
    const text = filteredLogs.map(log => 
      `[${log.timestamp}] ${getLevelIcon(log.level)} ${log.message}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-black/90 border-green-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
            <Terminal className="h-5 w-5" />
            Trading Log (PowerShell)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={autoScroll ? "default" : "secondary"} className="text-xs">
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-6 text-xs"
            >
              Toggle
            </Button>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск в логах..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 bg-black/50 border-green-500/30 text-green-400 font-mono text-xs"
            />
          </div>
          <Button size="sm" variant="outline" onClick={downloadLogs} className="border-green-500/30">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLogs([])} className="border-red-500/30">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] p-4 font-mono text-xs" ref={scrollRef}>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Terminal className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Ожидание событий...</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log, index) => (
                <div key={index} className={`${getLevelColor(log.level)}`}>
                  <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                  {getLevelIcon(log.level)} {log.message}
                  {log.metadata && (
                    <div className="text-gray-600 text-[10px] ml-16">
                      {JSON.stringify(log.metadata, null, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
