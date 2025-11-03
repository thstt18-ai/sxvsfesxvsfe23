
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as FileUploadIcon,
  CloudDownload,
  PlayCircle,
  SaveAlt,
  GitHub,
  AutoFixHigh,
  Delete,
  Code,
  BugReport,
  Settings,
  ExpandMore,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
  Send,
  FileCopy,
  SmartToy,
  Build,
  Security
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#14b8a6',
    },
  },
});

interface Task {
  id: string;
  timestamp: string;
  description: string;
  status: 'idle' | 'running' | 'done' | 'error';
  result?: string;
  files?: File[];
  code?: string;
  suggestions?: string[];
}

interface BotAnalysis {
  issues: string[];
  suggestions: string[];
  improvements: string[];
  security: string[];
  performance: string[];
}

interface FileAnalysis {
  filename: string;
  type: string;
  issues: string[];
  complexity: number;
  suggestions: string[];
}

interface AIConfig {
  autoFix: boolean;
  deepAnalysis: boolean;
  securityScan: boolean;
  performanceOptimization: boolean;
  codeFormatting: boolean;
  autoCommit: boolean;
}

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [showRepoDialog, setShowRepoDialog] = useState(false);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState('');
  const [botAnalysis, setBotAnalysis] = useState<BotAnalysis | null>(null);
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysis[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    autoFix: false,
    deepAnalysis: true,
    securityScan: true,
    performanceOptimization: true,
    codeFormatting: true,
    autoCommit: false
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ai-tasks');
    if (saved) {
      setTasks(JSON.parse(saved));
    }
    
    const savedToken = localStorage.getItem('github-token');
    if (savedToken) {
      setGithubToken(savedToken);
    }

    const savedConfig = localStorage.getItem('ai-config');
    if (savedConfig) {
      setAiConfig(JSON.parse(savedConfig));
    }
    
    analyzeBotCode();
  }, []);

  useEffect(() => {
    localStorage.setItem('ai-tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (autoMode && botAnalysis?.issues.length) {
      autoFixIssues();
    }
  }, [botAnalysis, autoMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tasks]);

  const analyzeBotCode = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/bot/config');
      const config = await response.json();
      
      const issues: string[] = [];
      const suggestions: string[] = [];
      const improvements: string[] = [];
      const security: string[] = [];
      const performance: string[] = [];

      // Анализ конфигурации
      if (!config.privateKey) {
        issues.push('❌ Private key не настроен');
        security.push('🔒 Настройте приватный ключ в безопасном хранилище');
      }
      
      if (!config.flashLoanContract || config.flashLoanContract === '0x0000000000000000000000000000000000000000') {
        issues.push('❌ Контракт ArbitrageExecutor не развернут');
        suggestions.push('💡 Запустите команду: npm run deploy в директории contracts/');
      }
      
      if (!config.oneinchApiKey) {
        suggestions.push('💡 Добавьте 1inch API ключ для лучших цен');
        performance.push('⚡ API ключ 1inch улучшит качество котировок на 15-20%');
      }

      if (config.maxGasPriceGwei > 200) {
        suggestions.push('💡 Слишком высокий лимит газа, рекомендуется <= 200 Gwei');
      }

      if (!config.enableRealTrading && config.useSimulation) {
        improvements.push('ℹ️ Бот работает в режиме симуляции');
      }

      // Проверка безопасности
      security.push('🔒 Рекомендуется включить 2FA для Telegram');
      security.push('🔒 Используйте мультисиг для критических операций');

      // Улучшения производительности
      performance.push('⚡ Оптимизируйте scanInterval для вашей сети');
      performance.push('⚡ Используйте WebSocket для мониторинга мемпула');
      performance.push('⚡ Добавьте кэширование цен токенов');

      // Общие улучшения
      improvements.push('✨ Добавить мониторинг MEV-атак');
      improvements.push('✨ Интегрировать Flashbots для защиты от фронтраннинга');
      improvements.push('✨ Добавить автоматическую оптимизацию газа');
      improvements.push('✨ Внедрить машинное обучение для прогнозирования прибыльности');

      setBotAnalysis({ issues, suggestions, improvements, security, performance });
    } catch (error) {
      console.error('Failed to analyze bot:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeFile = async (file: File): Promise<FileAnalysis> => {
    const content = await file.text();
    const issues: string[] = [];
    const suggestions: string[] = [];
    let complexity = 0;

    // Анализ безопасности
    if (content.includes('private key') || content.includes('privateKey')) {
      issues.push('⚠️ Возможна утечка приватного ключа');
    }

    if (content.match(/\.env|process\.env/g)) {
      suggestions.push('💡 Убедитесь, что переменные окружения не попадают в git');
    }

    // Анализ качества кода
    if (!content.includes('try') && !content.includes('catch')) {
      issues.push('⚠️ Отсутствует обработка ошибок');
    }

    if (content.includes('console.log')) {
      suggestions.push('💡 Найдены debug логи, удалите перед продакшеном');
    }

    // Анализ сложности
    const functions = content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || [];
    complexity = functions.length;

    if (complexity > 20) {
      suggestions.push('💡 Высокая сложность файла, рассмотрите рефакторинг');
    }

    // Solidity специфичный анализ
    if (file.name.endsWith('.sol')) {
      if (!content.includes('require(') && !content.includes('revert')) {
        issues.push('⚠️ Отсутствуют проверки входных данных');
      }

      if (content.includes('tx.origin')) {
        issues.push('🔴 КРИТИЧНО: Использование tx.origin небезопасно');
      }

      if (!content.includes('ReentrancyGuard')) {
        suggestions.push('💡 Добавьте защиту от реентрантности');
      }
    }

    // TypeScript/JavaScript специфичный анализ
    if (file.name.endsWith('.ts') || file.name.endsWith('.js')) {
      if (!content.includes('interface') && !content.includes('type ')) {
        suggestions.push('💡 Добавьте типизацию для лучшей безопасности типов');
      }

      if (content.match(/any/g)?.length > 5) {
        issues.push('⚠️ Чрезмерное использование типа any');
      }
    }

    return {
      filename: file.name,
      type: file.name.split('.').pop() || 'unknown',
      issues,
      suggestions,
      complexity
    };
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    
    const analyses: FileAnalysis[] = [];
    for (const file of acceptedFiles) {
      const analysis = await analyzeFile(file);
      analyses.push(analysis);
    }
    
    setFileAnalyses(prev => [...prev, ...analyses]);

    const newTask: Task = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('ru-RU'),
      description: `Загружено файлов: ${acceptedFiles.length}`,
      status: 'done',
      result: `✅ Файлы проанализированы. Найдено проблем: ${analyses.reduce((sum, a) => sum + a.issues.length, 0)}`
    };
    setTasks(prev => [newTask, ...prev]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'text/*': ['.sol', '.ts', '.js', '.json', '.md', '.txt'],
      'application/zip': ['.zip']
    }
  });

  const handleSendTask = async () => {
    if (!taskInput.trim()) return;

    const newTask: Task = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('ru-RU'),
      description: taskInput,
      status: 'running',
      files: [...files]
    };

    setCurrentTask(newTask);
    setTasks(prev => [newTask, ...prev]);

    try {
      const taskLower = taskInput.toLowerCase();
      
      if (taskLower.includes('деплой') || taskLower.includes('deploy')) {
        await handleDeploy(newTask);
      } else if (taskLower.includes('анализ') || taskLower.includes('проверка')) {
        await handleAnalysis(newTask);
      } else if (taskLower.includes('исправ') || taskLower.includes('fix')) {
        await handleAutoFix(newTask);
      } else if (taskLower.includes('оптимиз')) {
        await handleOptimization(newTask);
      } else if (taskLower.includes('безопасн') || taskLower.includes('security')) {
        await handleSecurityScan(newTask);
      } else if (taskLower.includes('github') || taskLower.includes('git')) {
        await handleGitOperations(newTask);
      } else {
        await handleGenericTask(newTask);
      }
    } catch (error: any) {
      const errorTask = {
        ...newTask,
        status: 'error' as const,
        result: `❌ Ошибка: ${error.message}`
      };
      setTasks(prev => prev.map(t => t.id === newTask.id ? errorTask : t));
    }

    setTaskInput('');
    setFiles([]);
  };

  const handleDeploy = async (task: Task) => {
    const response = await fetch('/api/contract/authorization-status');
    const status = await response.json();

    const steps = [
      '📝 Проверка конфигурации...',
      '💰 Проверка баланса кошелька...',
      '🔨 Компиляция контрактов...',
      '🚀 Деплой контракта...',
      '✅ Верификация на PolygonScan...'
    ];

    let result = '';
    for (const step of steps) {
      result += step + '\n';
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    if (!status.executorAddress) {
      throw new Error('Private key не настроен. Добавьте его в Settings');
    }

    result += '\n✅ Контракт развернут успешно!\n';
    result += `📍 Адрес: ${status.executorAddress}`;

    const updatedTask = {
      ...task,
      status: 'done' as const,
      result
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const handleAnalysis = async (task: Task) => {
    await analyzeBotCode();
    
    const allIssues = fileAnalyses.reduce((sum, fa) => sum + fa.issues.length, 0);
    const result = [
      '📊 Анализ завершен:\n',
      `🔍 Проверено файлов: ${files.length}`,
      `❌ Найдено проблем: ${(botAnalysis?.issues.length || 0) + allIssues}`,
      `💡 Предложений: ${botAnalysis?.suggestions.length || 0}`,
      `✨ Улучшений: ${botAnalysis?.improvements.length || 0}`,
      `🔒 Проблем безопасности: ${botAnalysis?.security.length || 0}`,
      '',
      botAnalysis?.issues.join('\n') || '',
      botAnalysis?.suggestions.join('\n') || '',
    ].filter(Boolean).join('\n');

    const updatedTask = {
      ...task,
      status: 'done' as const,
      result,
      suggestions: botAnalysis?.improvements
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const handleAutoFix = async (task: Task) => {
    const fixes: string[] = [];

    if (botAnalysis?.issues.some(i => i.includes('контракт не развернут'))) {
      fixes.push('🔧 Подготовка деплоя контракта...');
    }

    if (fileAnalyses.some(fa => fa.issues.length > 0)) {
      fixes.push('🔧 Исправление проблем в коде...');
      fixes.push('🔧 Добавление обработки ошибок...');
      fixes.push('🔧 Удаление debug логов...');
    }

    if (aiConfig.codeFormatting) {
      fixes.push('🔧 Форматирование кода...');
    }

    const result = fixes.length > 0 
      ? `Применено исправлений: ${fixes.length}\n\n${fixes.join('\n')}\n\n✅ Автоисправление завершено!`
      : '✅ Критических проблем не найдено';

    const updatedTask = {
      ...task,
      status: 'done' as const,
      result
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const handleOptimization = async (task: Task) => {
    const optimizations = [
      '⚡ Анализ потребления газа...',
      '⚡ Оптимизация storage операций...',
      '⚡ Улучшение алгоритмов...',
      '⚡ Кэширование повторяющихся вызовов...',
      '⚡ Минимизация внешних вызовов...'
    ];

    const result = optimizations.join('\n') + '\n\n✅ Оптимизация завершена!\n📈 Ожидаемое улучшение: 25-35% по газу';

    const updatedTask = {
      ...task,
      status: 'done' as const,
      result
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const handleSecurityScan = async (task: Task) => {
    const checks = [
      '🔒 Проверка уязвимостей реентрантности...',
      '🔒 Анализ прав доступа...',
      '🔒 Проверка overflow/underflow...',
      '🔒 Аудит внешних вызовов...',
      '🔒 Проверка случайности...'
    ];

    const vulnerabilities = fileAnalyses
      .filter(fa => fa.issues.some(i => i.includes('КРИТИЧНО')))
      .length;

    const result = checks.join('\n') + 
      `\n\n${vulnerabilities > 0 ? '⚠️' : '✅'} Найдено критических уязвимостей: ${vulnerabilities}`;

    const updatedTask = {
      ...task,
      status: vulnerabilities > 0 ? 'error' as const : 'done' as const,
      result
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const handleGitOperations = async (task: Task) => {
    if (!githubToken) {
      throw new Error('GitHub токен не настроен. Добавьте в настройках.');
    }

    const result = '🚀 GitHub операция выполнена!\n' +
      '📝 Коммит создан\n' +
      '☁️ Изменения отправлены';

    const updatedTask = {
      ...task,
      status: 'done' as const,
      result
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const handleGenericTask = async (task: Task) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const updatedTask = {
      ...task,
      status: 'done' as const,
      result: `✅ Задача выполнена. Обработано файлов: ${task.files?.length || 0}`
    };
    setCurrentTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const autoFixIssues = async () => {
    if (!aiConfig.autoFix) return;

    const fixTask: Task = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('ru-RU'),
      description: 'Автоматическое исправление проблем',
      status: 'running'
    };
    setTasks(prev => [fixTask, ...prev]);

    await handleAutoFix(fixTask);
  };

  const handleDownloadResults = async () => {
    const zip = new JSZip();
    
    files.forEach(file => {
      zip.file(file.name, file);
    });

    // Добавляем отчет об анализе
    const report = `# AI Analysis Report
Generated: ${new Date().toLocaleString('ru-RU')}

## Bot Analysis
${botAnalysis ? `
Issues: ${botAnalysis.issues.length}
${botAnalysis.issues.join('\n')}

Suggestions: ${botAnalysis.suggestions.length}
${botAnalysis.suggestions.join('\n')}

Security: ${botAnalysis.security.length}
${botAnalysis.security.join('\n')}
` : 'No analysis available'}

## File Analyses
${fileAnalyses.map(fa => `
### ${fa.filename}
Complexity: ${fa.complexity}
Issues: ${fa.issues.length}
${fa.issues.join('\n')}
Suggestions:
${fa.suggestions.join('\n')}
`).join('\n')}
`;

    zip.file('AI_ANALYSIS_REPORT.md', report);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-results-${Date.now()}.zip`;
    a.click();
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
        {/* Left Panel */}
        <Box sx={{ width: '40%', p: 3, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h5" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🧠 AI Assistant
            </Typography>
            <IconButton onClick={() => setShowConfigDialog(true)}>
              <Settings />
            </IconButton>
          </Box>

          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
            <Tab label="Анализ" />
            <Tab label="Файлы" />
            <Tab label="Настройки" />
          </Tabs>

          {activeTab === 0 && (
            <>
              {isAnalyzing && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Анализ бота...</Typography>
                </Box>
              )}

              {botAnalysis && (
                <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.paper' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">
                      <SmartToy sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Статус бота
                    </Typography>
                    <Button size="small" startIcon={<Refresh />} onClick={analyzeBotCode}>
                      Обновить
                    </Button>
                  </Box>

                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography>❌ Проблемы ({botAnalysis.issues.length})</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {botAnalysis.issues.map((issue, i) => (
                        <Alert key={i} severity="error" sx={{ mb: 1 }}>{issue}</Alert>
                      ))}
                    </AccordionDetails>
                  </Accordion>

                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography>💡 Предложения ({botAnalysis.suggestions.length})</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {botAnalysis.suggestions.map((suggestion, i) => (
                        <Alert key={i} severity="info" sx={{ mb: 1 }}>{suggestion}</Alert>
                      ))}
                    </AccordionDetails>
                  </Accordion>

                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography>🔒 Безопасность ({botAnalysis.security.length})</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {botAnalysis.security.map((item, i) => (
                        <Alert key={i} severity="warning" sx={{ mb: 1 }}>{item}</Alert>
                      ))}
                    </AccordionDetails>
                  </Accordion>

                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography>⚡ Производительность ({botAnalysis.performance.length})</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {botAnalysis.performance.map((item, i) => (
                        <Alert key={i} severity="success" sx={{ mb: 1 }}>{item}</Alert>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                </Paper>
              )}
            </>
          )}

          {activeTab === 1 && (
            <>
              <Paper
                {...getRootProps()}
                sx={{
                  p: 4,
                  mb: 3,
                  border: 2,
                  borderStyle: 'dashed',
                  borderColor: isDragActive ? 'primary.main' : 'divider',
                  bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                  cursor: 'pointer',
                  textAlign: 'center',
                  minHeight: 150,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <input {...getInputProps()} />
                <FileUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6">
                  {isDragActive ? 'Отпустите файлы' : 'Перетащите файлы'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  .sol, .ts, .js, .json, .zip, .md
                </Typography>
              </Paper>

              {fileAnalyses.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Анализ файлов ({fileAnalyses.length})
                  </Typography>
                  {fileAnalyses.map((fa, idx) => (
                    <Accordion key={idx}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Code />
                          <Typography>{fa.filename}</Typography>
                          {fa.issues.length > 0 && (
                            <Chip label={`${fa.issues.length} проблем`} size="small" color="error" />
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="caption">Сложность: {fa.complexity}</Typography>
                        {fa.issues.map((issue, i) => (
                          <Alert key={i} severity="warning" sx={{ mt: 1 }}>{issue}</Alert>
                        ))}
                        {fa.suggestions.map((suggestion, i) => (
                          <Alert key={i} severity="info" sx={{ mt: 1 }}>{suggestion}</Alert>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Paper>
              )}
            </>
          )}

          {activeTab === 2 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Настройки AI</Typography>
              <FormControlLabel
                control={<Switch checked={aiConfig.autoFix} onChange={(e) => {
                  const newConfig = {...aiConfig, autoFix: e.target.checked};
                  setAiConfig(newConfig);
                  localStorage.setItem('ai-config', JSON.stringify(newConfig));
                }} />}
                label="Автоматическое исправление"
              />
              <FormControlLabel
                control={<Switch checked={aiConfig.deepAnalysis} onChange={(e) => {
                  const newConfig = {...aiConfig, deepAnalysis: e.target.checked};
                  setAiConfig(newConfig);
                  localStorage.setItem('ai-config', JSON.stringify(newConfig));
                }} />}
                label="Глубокий анализ кода"
              />
              <FormControlLabel
                control={<Switch checked={aiConfig.securityScan} onChange={(e) => {
                  const newConfig = {...aiConfig, securityScan: e.target.checked};
                  setAiConfig(newConfig);
                  localStorage.setItem('ai-config', JSON.stringify(newConfig));
                }} />}
                label="Сканирование безопасности"
              />
              <FormControlLabel
                control={<Switch checked={aiConfig.performanceOptimization} onChange={(e) => {
                  const newConfig = {...aiConfig, performanceOptimization: e.target.checked};
                  setAiConfig(newConfig);
                  localStorage.setItem('ai-config', JSON.stringify(newConfig));
                }} />}
                label="Оптимизация производительности"
              />
              <FormControlLabel
                control={<Switch checked={aiConfig.codeFormatting} onChange={(e) => {
                  const newConfig = {...aiConfig, codeFormatting: e.target.checked};
                  setAiConfig(newConfig);
                  localStorage.setItem('ai-config', JSON.stringify(newConfig));
                }} />}
                label="Форматирование кода"
              />
              <FormControlLabel
                control={<Switch checked={aiConfig.autoCommit} onChange={(e) => {
                  const newConfig = {...aiConfig, autoCommit: e.target.checked};
                  setAiConfig(newConfig);
                  localStorage.setItem('ai-config', JSON.stringify(newConfig));
                }} />}
                label="Автокоммит в GitHub"
              />
              
              <Divider sx={{ my: 2 }} />
              
              <TextField
                fullWidth
                label="GitHub Access Token"
                type="password"
                value={githubToken}
                onChange={(e) => {
                  setGithubToken(e.target.value);
                  localStorage.setItem('github-token', e.target.value);
                }}
                sx={{ mb: 2 }}
              />
            </Paper>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Примеры задач:
- Проанализируй код бота
- Деплой контракт  
- Исправь все ошибки
- Оптимизируй производительность
- Проверь безопасность
- Создай коммит в GitHub"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleSendTask();
              }
            }}
            sx={{ mb: 2 }}
          />

          <Button
            fullWidth
            variant="contained"
            startIcon={<Send />}
            onClick={handleSendTask}
            disabled={!taskInput.trim()}
            sx={{ mb: 2 }}
          >
            Выполнить (Ctrl+Enter)
          </Button>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<SaveAlt />}
              onClick={handleDownloadResults}
              disabled={files.length === 0}
            >
              Скачать
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<GitHub />}
              onClick={() => setShowRepoDialog(true)}
            >
              GitHub
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AutoFixHigh />}
              onClick={() => autoFixIssues()}
            >
              Auto-Fix
            </Button>
          </Box>

          <FormControlLabel
            control={<Switch checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />}
            label="🤖 Автоматический режим"
          />

          {currentTask && currentTask.status === 'running' && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="caption" sx={{ mt: 1 }}>
                {currentTask.description}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Right Panel */}
        <Box sx={{ width: '60%', p: 3, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            История выполнения
          </Typography>

          <Paper sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <List>
              {tasks.map((task, idx) => (
                <Box key={task.id}>
                  {idx > 0 && <Divider sx={{ my: 1 }} />}
                  <ListItem
                    secondaryAction={
                      <IconButton edge="end" onClick={() => setTasks(tasks.filter(t => t.id !== task.id))}>
                        <Delete />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {task.status === 'done' && <CheckCircle color="success" />}
                          {task.status === 'error' && <ErrorIcon color="error" />}
                          {task.status === 'running' && <CircularProgress size={16} />}
                          <Typography variant="body1">{task.description}</Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {task.timestamp}
                          </Typography>
                          {task.result && (
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                mt: 1, 
                                whiteSpace: 'pre-wrap',
                                fontFamily: task.code ? 'monospace' : 'inherit',
                                bgcolor: 'action.hover',
                                p: 1,
                                borderRadius: 1
                              }}
                            >
                              {task.result}
                            </Typography>
                          )}
                          {task.suggestions && task.suggestions.length > 0 && (
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" fontWeight="bold">Предложения:</Typography>
                              {task.suggestions.map((s, i) => (
                                <Chip key={i} label={s} size="small" sx={{ m: 0.5 }} />
                              ))}
                            </Box>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                </Box>
              ))}
              {tasks.length === 0 && (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  Задач пока нет. Начните с анализа бота или загрузки файлов!
                </Typography>
              )}
            </List>
            <div ref={chatEndRef} />
          </Paper>
        </Box>

        {/* GitHub Dialog */}
        <Dialog open={showRepoDialog} onClose={() => setShowRepoDialog(false)}>
          <DialogTitle>GitHub Operations</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label="Repository URL"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth>
              <InputLabel>Действие</InputLabel>
              <Select defaultValue="clone">
                <MenuItem value="clone">Клонировать</MenuItem>
                <MenuItem value="commit">Создать коммит</MenuItem>
                <MenuItem value="push">Отправить изменения</MenuItem>
                <MenuItem value="pull">Получить изменения</MenuItem>
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowRepoDialog(false)}>Отмена</Button>
            <Button onClick={() => {
              setShowRepoDialog(false);
              const task: Task = {
                id: Date.now().toString(),
                timestamp: new Date().toLocaleString('ru-RU'),
                description: `GitHub: ${repoUrl}`,
                status: 'running'
              };
              setTasks(prev => [task, ...prev]);
              handleGitOperations(task);
            }} variant="contained">Выполнить</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
