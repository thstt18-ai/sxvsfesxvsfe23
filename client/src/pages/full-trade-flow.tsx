
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TradeStep {
  id: number;
  name: string;
  description: string;
  action: () => Promise<{ success: boolean; message: string }>;
}

export default function FullTradeFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const { toast } = useToast();

  const steps: TradeStep[] = [
    {
      id: 0,
      name: 'Проверка обменов',
      description: 'Проверяем price-impact, gas, slippage и возможность обмена',
      action: async () => {
        try {
          const response = await fetch('/api/trade/check-swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          
          if (!response.ok) {
            const error = await response.json();
            return { success: false, message: error.message || 'Проверка не пройдена' };
          }
          
          const data = await response.json();
          return { 
            success: true, 
            message: `Проверка пройдена успешно. Price impact: ${data.priceImpact}%` 
          };
        } catch (error) {
          return { success: false, message: 'Ошибка проверки обмена' };
        }
      }
    },
    {
      id: 1,
      name: 'Развёртка контракта',
      description: 'Вызываем Router.swapExactTokensForTokens для подготовки обмена',
      action: async () => {
        try {
          const response = await fetch('/api/trade/prepare-swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          
          if (!response.ok) {
            const error = await response.json();
            return { success: false, message: error.message || 'Ошибка развёртки' };
          }
          
          return { success: true, message: 'Контракт успешно подготовлен' };
        } catch (error) {
          return { success: false, message: 'Ошибка вызова контракта' };
        }
      }
    },
    {
      id: 2,
      name: 'Подписание транзакции',
      description: 'Подписываем через encrypted keystore (без Ledger)',
      action: async () => {
        try {
          const response = await fetch('/api/trade/sign-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          
          if (!response.ok) {
            const error = await response.json();
            return { success: false, message: error.message || 'Ошибка подписания' };
          }
          
          return { success: true, message: 'Транзакция успешно подписана' };
        } catch (error) {
          return { success: false, message: 'Ошибка подписания транзакции' };
        }
      }
    },
    {
      id: 3,
      name: 'Отправка транзакции',
      description: 'Отправляем подписанную транзакцию в сеть',
      action: async () => {
        try {
          const response = await fetch('/api/trade/send-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          
          if (!response.ok) {
            const error = await response.json();
            return { success: false, message: error.message || 'Ошибка отправки' };
          }
          
          const data = await response.json();
          return { 
            success: true, 
            message: `Транзакция отправлена: ${data.txHash}` 
          };
        } catch (error) {
          return { success: false, message: 'Ошибка отправки транзакции' };
        }
      }
    },
    {
      id: 4,
      name: 'Заработок',
      description: 'Возвращаем токены на баланс кошелька (100%) + лог прибыли',
      action: async () => {
        try {
          const response = await fetch('/api/trade/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          
          if (!response.ok) {
            const error = await response.json();
            return { success: false, message: error.message || 'Ошибка финализации' };
          }
          
          const data = await response.json();
          return { 
            success: true, 
            message: `Прибыль: $${data.profit}. Баланс обновлён (100%)` 
          };
        } catch (error) {
          return { success: false, message: 'Ошибка возврата средств' };
        }
      }
    }
  ];

  const handleConfirm = async () => {
    setLoading(true);
    setResult(null);

    try {
      const stepResult = await steps[currentStep].action();
      
      if (stepResult.success) {
        setResult({ type: 'success', message: stepResult.message });
        toast({
          title: 'Успешно',
          description: stepResult.message
        });

        if (currentStep < steps.length - 1) {
          setTimeout(() => {
            setCurrentStep(currentStep + 1);
            setResult(null);
          }, 2000);
        } else {
          toast({
            title: 'Торговля завершена',
            description: 'Все средства возвращены на ваш кошелёк'
          });
        }
      } else {
        setResult({ type: 'error', message: stepResult.message });
        toast({
          title: 'Ошибка',
          description: stepResult.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      setResult({ type: 'error', message: 'Непредвиденная ошибка' });
      toast({
        title: 'Ошибка',
        description: 'Непредвиденная ошибка при выполнении шага',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/trade/return-to-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (response.ok) {
        setResult({ 
          type: 'info', 
          message: 'Отменено. Все средства возвращены на баланс кошелька (100%)' 
        });
        toast({
          title: 'Операция отменена',
          description: 'Все средства возвращены на ваш кошелёк'
        });
        
        setTimeout(() => {
          setCurrentStep(0);
          setResult(null);
        }, 3000);
      } else {
        throw new Error('Ошибка возврата средств');
      }
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Ошибка при возврате средств',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const step = steps[currentStep];

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Zap className="h-8 w-8 text-yellow-500" />
            <div>
              <CardTitle className="text-2xl">Этапы реальной торговли</CardTitle>
              <CardDescription>
                Пошаговое выполнение с подтверждением каждого действия
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Progress indicator */}
          <div className="flex justify-between items-center">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-semibold
                  ${idx === currentStep ? 'bg-primary text-primary-foreground' : 
                    idx < currentStep ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}
                `}>
                  {idx < currentStep ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`h-1 w-12 mx-2 ${idx < currentStep ? 'bg-green-500' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Current step */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">
                Шаг {currentStep + 1}: {step.name}
              </h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>

            {/* Result message */}
            {result && (
              <Alert variant={result.type === 'error' ? 'destructive' : 'default'}>
                {result.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
                {result.type === 'error' && <XCircle className="h-4 w-4" />}
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="flex gap-4">
              <Button
                onClick={handleConfirm}
                disabled={loading || (result?.type === 'success' && currentStep === steps.length - 1)}
                className="flex-1"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {currentStep === steps.length - 1 && result?.type === 'success' 
                  ? 'Завершено' 
                  : 'Подтвердить'}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
                className="flex-1"
              >
                Отказаться
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
