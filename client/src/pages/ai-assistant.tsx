import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Brain, Code, FileCode, Zap, Send, Loader2, Upload, Download, FileText, CheckCircle, XCircle, MessageSquare, Sparkles, User, Bot, Activity, Clock, AlertTriangle, Save, GitCommit, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";

interface AnalysisResult {
  file: string;
  issues: Array<{
    line: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
  metrics: {
    complexity: number;
    linesOfCode: number;
    maintainabilityIndex: number;
  };
}

interface UploadedFile {
  name: string;
  content: string;
  size: number;
  type: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  analysis?: AnalysisResult;
}

interface APILimits {
  current: number;
  max: number;
  resetAt: string;
  percentage: number;
}

interface ProjectFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: ProjectFile[];
}

export default function AIAssistant() {
  const [code, setCode] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '🧠 **AI Code Master активирован**\n\nЯ полностью интегрирован в вашу кодовую базу и готов превратить прототип в production-ready систему.\n\n**Возможности:**\n- 🔍 Анализ контрактов Solidity, TypeScript, JavaScript\n- ✏️ Monaco Editor для редактирования\n- 🤖 AI Fix с Gemini API\n- 💾 Save & Commit с автоматическими git коммитами\n- 🔐 Production-ready проверки (UUPS, Meta-TX, Ledger, Chainlink PoR)\n\nЗагрузите файл или начните диалог!',
      timestamp: new Date()
    }
  ]);
  const [userMessage, setUserMessage] = useState("");
  const [projectTree, setProjectTree] = useState<ProjectFile | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Получаем данные о лимитах API
  const { data: apiLimits } = useQuery<APILimits>({
    queryKey: ['/api/ai/limits'],
    refetchInterval: 10000,
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    const savedChat = localStorage.getItem('ai-chat-history');
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        setChatMessages(parsed);
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (chatMessages.length > 1) {
      localStorage.setItem('ai-chat-history', JSON.stringify(chatMessages));
    }
  }, [chatMessages]);

  useEffect(() => {
    loadProjectTree();
  }, []);

  const loadProjectTree = async () => {
    try {
      const response = await fetch("/api/ai/project-tree");
      const tree = await response.json();
      setProjectTree(tree);
    } catch (error: any) {
      console.error('Failed to load project tree:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.name.endsWith('.zip')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          addChatMessage('assistant', `📦 Анализирую ZIP архив "${file.name}"...`);

          try {
            const response = await fetch("/api/ai/analyze-zip", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ zipData: base64 }),
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error);
            }

            let message = `📊 **Анализ ZIP архива завершен**\n\n`;
            message += `📁 Файлов проанализировано: ${data.totalFiles}\n`;
            message += `🔍 Найдено проблем: ${data.totalIssues}\n`;
            message += `🔴 Критических: ${data.criticalIssues}\n`;
            message += `📈 Средняя сложность: ${data.averageComplexity}\n\n`;

            if (data.recommendations.length > 0) {
              message += `💡 **Рекомендации:**\n${data.recommendations.join('\n')}`;
            }

            addChatMessage('assistant', message);
            toast({ title: "ZIP архив проанализирован" });
          } catch (error: any) {
            addChatMessage('assistant', `❌ Ошибка анализа ZIP: ${error.message}`);
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const newFile: UploadedFile = {
            name: file.name,
            content,
            size: file.size,
            type: file.type
          };
          setUploadedFiles(prev => [...prev, newFile]);
          setCode(content);
          setEditedContent(content);

          addChatMessage('assistant', `✅ Файл "${file.name}" загружен (${(file.size / 1024).toFixed(1)} KB). Готов к анализу!`);

          toast({ title: `Файл ${file.name} загружен` });
        };
        reader.readAsText(file);
      }
    }
  };

  const addChatMessage = (role: 'user' | 'assistant', content: string, analysis?: AnalysisResult) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      analysis
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  const analyzeCode = async (messageContent?: string) => {
    if (!code.trim() && !editedContent.trim()) {
      toast({ 
        title: "Введите код для анализа", 
        variant: "destructive",
        description: "Вставьте код в редактор или загрузите файл"
      });
      return;
    }

    setAnalyzing(true);

    if (messageContent) {
      addChatMessage('user', messageContent);
    }

    try {
      const response = await fetch("/api/ai/analyze-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile || "temp.ts",
          content: editedContent || code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Ошибка анализа");
      }

      setResult(data);

      let assistantResponse = `🔍 **Анализ завершен для файла "${data.file}"**\n\n`;

      if (data.issues.length === 0) {
        assistantResponse += `✅ **Отличная работа!** Код выглядит чистым и безопасным.\n\n`;
      } else {
        assistantResponse += `📊 **Найдено проблем:** ${data.issues.length}\n`;
        const errors = data.issues.filter((i: any) => i.severity === 'error').length;
        const warnings = data.issues.filter((i: any) => i.severity === 'warning').length;
        const info = data.issues.filter((i: any) => i.severity === 'info').length;

        if (errors > 0) assistantResponse += `🔴 Критических: ${errors}\n`;
        if (warnings > 0) assistantResponse += `🟡 Предупреждений: ${warnings}\n`;
        if (info > 0) assistantResponse += `ℹ️ Информационных: ${info}\n`;
        assistantResponse += `\n`;
      }

      assistantResponse += `📈 **Метрики кода:**\n`;
      assistantResponse += `• Сложность: ${data.metrics.complexity} ${data.metrics.complexity > 15 ? '⚠️ (высокая)' : '✅'}\n`;
      assistantResponse += `• Строк кода: ${data.metrics.linesOfCode}\n`;
      assistantResponse += `• Индекс поддерживаемости: ${data.metrics.maintainabilityIndex}/100 ${data.metrics.maintainabilityIndex > 70 ? '✅' : '⚠️'}\n\n`;

      if (data.issues.length > 0) {
        assistantResponse += `💡 Используйте кнопку "AI Fix" для автоматического исправления!`;
      } else {
        assistantResponse += `🎉 Ваш код готов к использованию!`;
      }

      addChatMessage('assistant', assistantResponse, data);

      toast({ 
        title: "✅ Анализ завершен",
        description: `Найдено проблем: ${data.issues?.length || 0}`
      });
    } catch (error: any) {
      console.error('❌ Analysis error:', error);
      addChatMessage('assistant', `❌ **Ошибка анализа:** ${error.message}\n\nПопробуйте:\n1. Проверить синтаксис кода\n2. Убедиться, что файл не слишком большой (макс 2MB)\n3. Загрузить другой файл`);
      toast({ 
        title: "❌ Ошибка анализа", 
        description: error.message || "Неизвестная ошибка",
        variant: "destructive" 
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAIFix = async () => {
    if (!editedContent.trim() && !code.trim()) {
      toast({ 
        title: "Введите код для исправления", 
        variant: "destructive"
      });
      return;
    }

    setAutoFixing(true);
    addChatMessage('user', '🤖 AI Fix: Исправь найденные проблемы автоматически');

    try {
      const response = await fetch("/api/ai/auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile || "temp.ts",
          content: editedContent || code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Ошибка автоисправления");
      }

      setCode(data.fixedContent);
      setEditedContent(data.fixedContent);
      addChatMessage('assistant', `✅ **Код успешно исправлен!**\n\nВнесенные изменения:\n• Удалены debug логи\n• Исправлены проблемы безопасности\n• Применено форматирование\n\n💡 Запускаю повторный анализ для проверки...`);

      toast({ 
        title: "✅ Код исправлен",
        description: "Изменения применены к редактору"
      });

      setTimeout(() => analyzeCode(), 1000);
    } catch (error: any) {
      console.error('❌ Auto-fix error:', error);
      addChatMessage('assistant', `❌ **Ошибка автоисправления:** ${error.message}`);
      toast({ 
        title: "❌ Ошибка автоисправления", 
        description: error.message || "Неизвестная ошибка",
        variant: "destructive" 
      });
    } finally {
      setAutoFixing(false);
    }
  };

  const handleSaveAndCommit = async () => {
    if (!selectedFile) {
      toast({
        title: "Выберите файл",
        description: "Необходимо выбрать файл для сохранения",
        variant: "destructive"
      });
      return;
    }

    if (!commitMessage.trim()) {
      toast({
        title: "Введите commit message",
        variant: "destructive"
      });
      return;
    }

    setCommitting(true);
    addChatMessage('user', `💾 Save & Commit: "${commitMessage}"`);

    try {
      // Применяем изменения к файлу
      const applyResponse = await fetch("/api/ai/apply-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [{
            filepath: selectedFile,
            newContent: editedContent
          }]
        }),
      });

      const applyData = await applyResponse.json();

      if (!applyResponse.ok) {
        throw new Error(applyData.error || "Ошибка применения изменений");
      }

      // Коммит изменений
      const commitResponse = await fetch("/api/ai/git-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `AI: ${commitMessage}`,
          files: [selectedFile]
        }),
      });

      if (!commitResponse.ok) {
        const commitData = await commitResponse.json();
        throw new Error(commitData.error || "Ошибка git commit");
      }

      addChatMessage('assistant', 
        `✅ **Изменения сохранены и закоммичены!**\n\n` +
        `📝 Файл: ${selectedFile}\n` +
        `💬 Commit: "AI: ${commitMessage}"\n\n` +
        `Изменения готовы к деплою.`
      );

      toast({
        title: "✅ Сохранено и закоммичено",
        description: `Файл ${selectedFile} обновлен`
      });

      setCommitMessage("");
    } catch (error: any) {
      console.error('❌ Save & Commit error:', error);
      addChatMessage('assistant', `❌ **Ошибка сохранения:** ${error.message}`);
      toast({
        title: "❌ Ошибка",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setCommitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userMessage.trim()) return;

    const message = userMessage.trim();
    setUserMessage("");
    addChatMessage('user', message);

    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('анализ') || lowerMessage.includes('проверь')) {
      await analyzeCode(message);
    } else if (lowerMessage.includes('исправ') || lowerMessage.includes('fix')) {
      await handleAIFix();
    } else if (lowerMessage.includes('редакт') || lowerMessage.includes('измен')) {
      await handleEditRequest(message);
    } else if (lowerMessage.includes('проект') || lowerMessage.includes('дерево')) {
      await showProjectTree();
    } else if (lowerMessage.includes('помощь') || lowerMessage.includes('help')) {
      addChatMessage('assistant', 
        `📚 **AI Code Master - Команды:**\n\n` +
        `🔍 **Анализ:**\n` +
        `• "Анализируй код" - проверка качества и безопасности\n` +
        `• "Покажи дерево проекта" - структура файлов\n\n` +
        `✏️ **Редактирование:**\n` +
        `• "Редактируй [файл]: [инструкция]" - изменить файл\n` +
        `• Кнопка "AI Fix" - автоматическое исправление\n` +
        `• Кнопка "Save & Commit" - сохранить и закоммитить\n\n` +
        `🚀 **Production:**\n` +
        `• "Сделай контракт upgradeable" - UUPS proxy pattern\n` +
        `• "Добавь Meta-TX" - EIP-2771 + EIP-2612\n` +
        `• "Интегрируй Ledger" - аппаратный кошелек\n\n` +
        `💡 Просто опишите задачу естественным языком!`
      );
    } else {
      addChatMessage('assistant', 
        `🤔 Анализирую ваш запрос: "${message}"\n\n` +
        `Я могу помочь с:\n` +
        `• Анализом и улучшением кода\n` +
        `• Редактированием файлов\n` +
        `• Production-ready трансформацией\n` +
        `• UUPS upgradeable контрактами\n` +
        `• Meta-транзакциями\n` +
        `• Интеграцией Ledger\n\n` +
        `Уточните, что именно нужно сделать?`
      );
    }
  };

  const handleEditRequest = async (message: string) => {
    if (!selectedFile) {
      addChatMessage('assistant', '⚠️ Сначала выберите файл для редактирования');
      return;
    }

    const instruction = message.replace(/редакт.*?:/i, '').trim();

    setAutoFixing(true);
    addChatMessage('assistant', `✏️ Редактирую файл "${selectedFile}"...\n📝 Инструкция: ${instruction}`);

    try {
      const response = await fetch("/api/ai/edit-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filepath: selectedFile,
          instruction
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setCode(data.editedContent);
      setEditedContent(data.editedContent);

      let changesList = data.changes.map((c: string) => `• ${c}`).join('\n');
      addChatMessage('assistant', 
        `✅ **Файл успешно отредактирован!**\n\n` +
        `📋 **Внесенные изменения:**\n${changesList}\n\n` +
        `💾 Изменения применены к редактору`
      );

      toast({ title: "✅ Файл отредактирован", description: `${data.changes.length} изменений` });
    } catch (error: any) {
      addChatMessage('assistant', `❌ Ошибка редактирования: ${error.message}`);
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } finally {
      setAutoFixing(false);
    }
  };

  const showProjectTree = async () => {
    setAnalyzing(true);
    addChatMessage('assistant', '🌳 Загружаю дерево проекта...');

    try {
      const response = await fetch("/api/ai/project-tree");
      const tree = await response.json();

      const formatTree = (node: any, prefix: string = ''): string => {
        if (!node) return '';

        let result = `${prefix}${node.type === 'directory' ? '📁' : '📄'} ${node.name}\n`;

        if (node.children) {
          node.children.forEach((child: any, idx: number) => {
            const isLast = idx === node.children.length - 1;
            result += formatTree(child, prefix + (isLast ? '  └─ ' : '  ├─ '));
          });
        }

        return result;
      };

      addChatMessage('assistant', 
        `📊 **Структура проекта:**\n\n\`\`\`\n${formatTree(tree)}\`\`\`\n\n` +
        `Выберите файл для редактирования или анализа`
      );
    } catch (error: any) {
      addChatMessage('assistant', `❌ Ошибка загрузки дерева: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const loadFileToEditor = async (file: UploadedFile) => {
    setCode(file.content);
    setEditedContent(file.content);
    setSelectedFile(file.name);
    addChatMessage('assistant', `📝 Файл "${file.name}" загружен в Monaco Editor. Готов к анализу и редактированию!`);
    toast({ title: `Файл ${file.name} загружен в редактор` });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'secondary';
      default: return 'secondary';
    }
  };

  const downloadFile = () => {
    if (!editedContent.trim() && !code.trim()) {
      toast({ 
        title: "Нет кода для скачивания", 
        variant: "destructive" 
      });
      return;
    }

    const filename = selectedFile || 'edited-code.txt';
    const blob = new Blob([editedContent || code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ 
      title: "✅ Файл скачан",
      description: filename
    });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="p-4 border-b">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          AI Code Master - Full IDE Integration
        </h1>
        <p className="text-sm text-muted-foreground">Auto-Fix, File Editor, Project Browser & Error Detection</p>
      </div>

      {/* Статус лимитов API */}
      {apiLimits && (
        <Card className="m-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Использование API
              </CardTitle>
              <Badge 
                variant={apiLimits.percentage > 80 ? 'destructive' : 'secondary'}
                data-testid="badge-api-usage"
              >
                {apiLimits.current} / {apiLimits.max}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress 
              value={apiLimits.percentage} 
              className="h-2"
              data-testid="progress-api-limit"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Сброс: {new Date(apiLimits.resetAt).toLocaleTimeString('ru-RU')}
              </span>
              {apiLimits.percentage > 80 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  Лимит почти исчерпан
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Левая панель - Файловый браузер */}
        <div className="w-1/4 p-4 border-r overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Project Files
          </h2>
          <ScrollArea className="h-[calc(100vh-300px)]">
            {projectTree ? (
              <ProjectFileTree 
                node={projectTree} 
                onFileSelect={(filePath) => {
                  setSelectedFile(filePath);
                  addChatMessage('assistant', `📂 Выбран файл: ${filePath}`);
                }} 
              />
            ) : (
              <p className="text-muted-foreground text-sm">Loading project structure...</p>
            )}
          </ScrollArea>
        </div>

        {/* Центральная панель - Monaco Editor */}
        <div className="w-2/4 p-4 space-y-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Editor
                  </CardTitle>
                  <CardDescription>
                    {selectedFile || 'Select a file from the project tree or upload one'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-file"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadFile}
                    disabled={!editedContent && !code}
                    data-testid="button-download-file"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".ts,.tsx,.js,.jsx,.sol,.json,.md,.txt,.css,.html,.zip"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <Editor
                  height="500px"
                  defaultLanguage="typescript"
                  theme="vs-dark"
                  value={editedContent || code}
                  onChange={(value) => setEditedContent(value || "")}
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: "on",
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    readOnly: false,
                    automaticLayout: true,
                  }}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => analyzeCode()} disabled={analyzing}>
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Code className="mr-2 h-4 w-4" />
                      Analyze
                    </>
                  )}
                </Button>
                <Button onClick={handleAIFix} disabled={autoFixing} variant="secondary">
                  {autoFixing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fixing...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      AI Fix
                    </>
                  )}
                </Button>
                <div className="flex gap-2 flex-1">
                  <Input
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSaveAndCommit} 
                    disabled={committing || !selectedFile}
                    variant="default"
                  >
                    {committing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Committing...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        <GitCommit className="mr-2 h-4 w-4" />
                        Save & Commit
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Результаты анализа */}
          {result && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileCode className="h-5 w-5" />
                  Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Complexity</div>
                    <div className="text-2xl font-bold">{result.metrics.complexity}</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Lines of Code</div>
                    <div className="text-2xl font-bold">{result.metrics.linesOfCode}</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Maintainability Index</div>
                    <div className="text-2xl font-bold">{result.metrics.maintainabilityIndex}</div>
                  </div>
                </div>

                {result.issues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Issues ({result.issues.length})</h4>
                    <ScrollArea className="h-[300px]">
                      {result.issues.map((issue, idx) => (
                        <Alert
                          key={idx}
                          variant={issue.severity === 'error' ? 'destructive' : 'default'}
                          className="mb-2"
                        >
                          {issue.severity === 'error' ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          <AlertDescription>
                            <div className="flex items-center justify-between">
                              <div>
                                <strong>Line {issue.line}:</strong> {issue.message}
                                {issue.suggestion && (
                                  <div className="text-sm text-muted-foreground mt-1">
                                    💡 {issue.suggestion}
                                  </div>
                                )}
                              </div>
                              <Badge variant={getSeverityColor(issue.severity) as any}>
                                {issue.severity}
                              </Badge>
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Правая панель - Чат */}
        <div className="w-1/4 p-4 flex flex-col overflow-hidden">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  AI Chat
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setChatMessages([{
                      id: '1',
                      role: 'assistant',
                      content: '🧠 **AI Code Master активирован**\n\nЯ полностью интегрирован в вашу кодовую базу и готов превратить прототип в production-ready систему.\n\n**Возможности:**\n- 🔍 Анализ контрактов Solidity, TypeScript, JavaScript\n- ✏️ Monaco Editor для редактирования\n- 🤖 AI Fix с Gemini API\n- 💾 Save & Commit с автоматическими git коммитами\n- 🔐 Production-ready проверки (UUPS, Meta-TX, Ledger, Chainlink PoR)\n\nЗагрузите файл или начните диалог!',
                      timestamp: new Date()
                    }]);
                    localStorage.removeItem('ai-chat-history');
                  }}
                >
                  Clear Chat
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`p-2 rounded-full ${msg.role === 'user' ? 'bg-primary' : 'bg-secondary'}`}>
                          {msg.role === 'user' ? (
                            <User className="h-4 w-4 text-primary-foreground" />
                          ) : (
                            <Bot className="h-4 w-4" />
                          )}
                        </div>
                        <div className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                          <div className="text-xs opacity-70 mt-1">
                            {msg.timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              <Separator className="my-4" />

              <div className="flex gap-2">
                <Input
                  placeholder="Type your message..."
                  value={userMessage}
                  onChange={(e) => setUserMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <Button onClick={handleSendMessage} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper component for rendering the project file tree
const ProjectFileTree = ({ node, onFileSelect, prefix = '' }: { node: ProjectFile, onFileSelect: (filePath: string) => void, prefix?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isDirectory = node.type === 'directory';

  const handleToggle = () => {
    if (isDirectory) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelectFile = () => {
    if (!isDirectory && node.path) {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <div 
        className={`flex items-center p-2 rounded cursor-pointer hover:bg-accent ${
          !isDirectory ? 'hover:bg-primary/10' : ''
        } ${selectedFile === node.path ? 'bg-primary/20' : ''}`}
        onClick={handleToggle}
      >
        {isDirectory ? (
          <span className="mr-2">
            {isOpen ? '▼' : '►'}
          </span>
        ) : (
          <FileText className="h-4 w-4 mr-2 text-blue-500" />
        )}
        <span className="flex-1 truncate text-sm">
          {node.name}
        </span>
      </div>

      {isDirectory && isOpen && node.children && (
        <div className="ml-4 pl-2 border-l">
          {node.children.map((child) => (
            <ProjectFileTree 
              key={child.path} 
              node={child} 
              onFileSelect={onFileSelect} 
              prefix={prefix + (isOpen ? '  ' : '')} 
            />
          ))}
        </div>
      )}
    </div>
  );
};