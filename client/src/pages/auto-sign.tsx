import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle2, AlertCircle, Loader2, Key, Package, FileSignature, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Step = 'check' | 'deploy' | 'sign' | 'finance' | 'complete';

interface FinanceChoice {
  type: 'keep' | 'return';
  amount: string;
}

export default function AutoSignPage() {
  const [currentStep, setCurrentStep] = useState<Step>('check');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showFinanceDialog, setShowFinanceDialog] = useState(false);
  const [financeChoice, setFinanceChoice] = useState<FinanceChoice>({
    type: 'keep',
    amount: ''
  });
  const [contractAddress, setContractAddress] = useState<string>('');
  const [transactionAmount, setTransactionAmount] = useState<string>('100');
  const [gasLimit, setGasLimit] = useState<string>('21000');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const steps = [
    { id: 'check', title: 'Проверка', icon: CheckCircle2 },
    { id: 'deploy', title: 'Автоподлой', icon: Package },
    { id: 'sign', title: 'Автоподпись', icon: FileSignature },
    { id: 'finance', title: 'Выбор получения', icon: Wallet },
  ];

  const startAutoSign = async () => {
    setLoading(true);
    setError(null);
    setCurrentStep('check');
    setProgress(10);
    addLog('🔍 Начинаем проверку системы...');
    addLog(`💰 Сумма транзакции: ${transactionAmount} USDT`);
    addLog(`⛽ Gas Limit: ${gasLimit}`);

    try {
      // Шаг 1: Проверка
      addLog('✅ Проверка зависимостей...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProgress(25);

      // Шаг 2: Автоподлой
      setCurrentStep('deploy');
      addLog('📦 Установка зависимостей...');
      
      const deployResponse = await fetch('/api/auto-sign/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!deployResponse.ok) {
        throw new Error('Ошибка при установке зависимостей');
      }

      const deployData = await deployResponse.json();
      addLog('✅ Зависимости установлены');
      setProgress(50);

      // Шаг 3: Автоподпись
      setCurrentStep('sign');
      addLog('🔐 Подписание транзакции через encrypted keystore...');
      
      const signResponse = await fetch('/api/auto-sign/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: transactionAmount,
          gasLimit: gasLimit
        })
      });

      if (!signResponse.ok) {
        throw new Error('Ошибка при подписании транзакции');
      }

      const signData = await signResponse.json();
      addLog(`✅ Транзакция подписана: ${signData.txHash?.substring(0, 10)}...`);
      
      if (signData.contractAddress) {
        setContractAddress(signData.contractAddress);
        addLog(`📜 Контракт развернут: ${signData.contractAddress}`);
      }
      
      setProgress(75);

      // Шаг 4: Выбор получения финансов
      setCurrentStep('finance');
      addLog('💰 Открываем окно выбора получения финансов...');
      setProgress(90);
      setShowFinanceDialog(true);
      setLoading(false);

    } catch (err: any) {
      setError(err.message);
      addLog(`❌ Ошибка: ${err.message}`);
      setLoading(false);
    }
  };

  const handleFinanceSubmit = async () => {
    if (!financeChoice.amount || parseFloat(financeChoice.amount) <= 0) {
      setError('Пожалуйста, введите корректную сумму');
      return;
    }

    setLoading(true);
    addLog(`💰 Обработка выбора: ${financeChoice.type === 'keep' ? 'Оставить на балансе' : 'Отправить обратно'}`);
    addLog(`💵 Сумма: ${financeChoice.amount}`);

    try {
      const response = await fetch('/api/auto-sign/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(financeChoice)
      });

      if (!response.ok) {
        throw new Error('Ошибка при обработке выбора финансов');
      }

      const data = await response.json();
      addLog(`✅ ${data.message}`);
      
      setShowFinanceDialog(false);
      setCurrentStep('complete');
      setProgress(100);
      addLog('🎉 Процесс автоподписи завершен!');
    } catch (err: any) {
      setError(err.message);
      addLog(`❌ Ошибка: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFinanceCancel = async () => {
    setLoading(true);
    addLog('❌ Отказ от обработки, возврат средств на баланс кошелька...');

    try {
      const response = await fetch('/api/auto-sign/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'return', amount: financeChoice.amount || '0' })
      });

      if (!response.ok) {
        throw new Error('Ошибка при возврате средств');
      }

      const data = await response.json();
      addLog(`✅ ${data.message}`);
      
      setShowFinanceDialog(false);
      setCurrentStep('complete');
      setProgress(100);
      addLog('🎉 Средства возвращены на баланс кошелька');
    } catch (err: any) {
      setError(err.message);
      addLog(`❌ Ошибка: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Key className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Автоподпись + Автоподлой</h1>
          <p className="text-muted-foreground">
            Автоматическая подпись и деплой через encrypted keystore (без Ledger)
          </p>
        </div>
      </div>

      {/* Шаги процесса */}
      <Card>
        <CardHeader>
          <CardTitle>Процесс автоподписи</CardTitle>
          <CardDescription>
            Проверка → Автоподлой → Автоподпись → Выбор получения
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Прогресс бар */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Прогресс</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Индикаторы шагов */}
          <div className="grid grid-cols-4 gap-4">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = steps.findIndex(s => s.id === currentStep) > index;
              
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center p-4 rounded-lg border ${
                    isActive ? 'bg-primary/10 border-primary' :
                    isCompleted ? 'bg-green-500/10 border-green-500' :
                    'bg-muted border-muted'
                  }`}
                >
                  <StepIcon className={`h-6 w-6 mb-2 ${
                    isActive ? 'text-primary' :
                    isCompleted ? 'text-green-500' :
                    'text-muted-foreground'
                  }`} />
                  <span className="text-sm font-medium text-center">{step.title}</span>
                </div>
              );
            })}
          </div>

          {/* Настройки транзакции */}
          {currentStep === 'check' && !loading && progress === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="txAmount">Сумма транзакции (USDT)</Label>
                  <Input
                    id="txAmount"
                    type="number"
                    step="1"
                    min="1"
                    placeholder="100"
                    value={transactionAmount}
                    onChange={(e) => setTransactionAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Минимум: 1 USDT
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gasLimit">Gas Limit</Label>
                  <Input
                    id="gasLimit"
                    type="number"
                    step="1000"
                    min="21000"
                    placeholder="21000"
                    value={gasLimit}
                    onChange={(e) => setGasLimit(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Стандарт: 21000
                  </p>
                </div>
              </div>

              <Button
                onClick={startAutoSign}
                className="w-full"
                size="lg"
                disabled={!transactionAmount || parseFloat(transactionAmount) < 1}
              >
                <Key className="mr-2 h-5 w-5" />
                Запустить автоподпись
              </Button>
            </div>
          )}

          {/* Ошибки */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Статус загрузки */}
          {loading && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Обработка...</span>
            </div>
          )}

          {/* Результат */}
          {currentStep === 'complete' && (
            <Alert className="bg-green-500/10 border-green-500">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                ✅ Автоподпись успешно завершена!
                {contractAddress && (
                  <div className="mt-2 text-sm">
                    Контракт: <code className="bg-black/20 px-2 py-1 rounded">{contractAddress}</code>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Логи */}
      <Card>
        <CardHeader>
          <CardTitle>Логи выполнения</CardTitle>
          <CardDescription>
            Детальная информация о процессе (также сохраняется в packages/auto-sign/agent.log)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-black rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-muted-foreground">Логи появятся здесь...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-green-400 mb-1">{log}</div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Диалог выбора получения финансов */}
      <Dialog open={showFinanceDialog} onOpenChange={setShowFinanceDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Выбор получения финансов
            </DialogTitle>
            <DialogDescription>
              После успешной автоподписи выберите как хотите получить средства
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Выбор типа */}
            <RadioGroup
              value={financeChoice.type}
              onValueChange={(value) => setFinanceChoice({ ...financeChoice, type: value as 'keep' | 'return' })}
            >
              <div className="flex items-start space-x-2 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="keep" id="keep" className="mt-1" />
                <Label htmlFor="keep" className="flex-1 cursor-pointer">
                  <div className="font-semibold mb-1">Оставить на балансе</div>
                  <p className="text-sm text-muted-foreground">
                    Средства останутся на балансе контракта и будут доступны для торговли
                  </p>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="return" id="return" className="mt-1" />
                <Label htmlFor="return" className="flex-1 cursor-pointer">
                  <div className="font-semibold mb-1">Отправить обратно</div>
                  <p className="text-sm text-muted-foreground">
                    Средства будут возвращены на баланс вашего кошелька
                  </p>
                </Label>
              </div>
            </RadioGroup>

            {/* Ввод суммы */}
            <div className="space-y-2">
              <Label htmlFor="amount">Сумма (только цифры, &gt; 0)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={financeChoice.amount}
                onChange={(e) => setFinanceChoice({ ...financeChoice, amount: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleFinanceCancel}
              disabled={loading}
            >
              Отказаться
            </Button>
            <Button
              onClick={handleFinanceSubmit}
              disabled={loading || !financeChoice.amount}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Обработка...
                </>
              ) : (
                'Подтвердить'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Информация о функционале */}
      <Card>
        <CardHeader>
          <CardTitle>Возможности системы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Автоматическая установка зависимостей</div>
              <p className="text-sm text-muted-foreground">
                Все необходимые пакеты устанавливаются автоматически перед подписью
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Encrypted keystore (без Ledger)</div>
              <p className="text-sm text-muted-foreground">
                Используется зашифрованное хранилище ключей вместо аппаратного кошелька
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Meta-TX (EIP-2771 + EIP-2612)</div>
              <p className="text-sm text-muted-foreground">
                Gasless транзакции без approve и без MATIC на балансе
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Автоматическое логирование</div>
              <p className="text-sm text-muted-foreground">
                Все операции записываются в packages/auto-sign/agent.log
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
