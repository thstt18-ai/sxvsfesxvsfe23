import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  TrendingUp, 
  BarChart3, 
  FileText, 
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  PlayCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface WalletBalance {
  eth: string;
  usdt: string;
  pol: string;
  address: string;
}

// Автообновление балансов каждые 30 секунд
const useAutoRefreshBalance = (connected: boolean, address: string, setBalance: any) => {
  useEffect(() => {
    if (!connected || !address) return;

    const refreshBalance = async () => {
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const chainIdNum = parseInt(chainId, 16);
        
        const response = await fetch(`/api/web3/wallet/${address}/balances?chainId=${chainIdNum}`);
        const data = await response.json();
        
        const usdcToken = data.tokens?.find((t: any) => t.symbol === 'USDC');
        const usdtToken = data.tokens?.find((t: any) => t.symbol === 'USDT');
        const polToken = data.tokens?.find((t: any) => t.symbol === 'POL' || t.symbol === 'MATIC');
        
        setBalance((prev: WalletBalance) => ({
          ...prev,
          eth: data.nativeBalanceFormatted || '0.0',
          usdt: usdtToken?.balanceFormatted || '0.0',
          pol: polToken?.balanceFormatted || data.nativeBalanceFormatted || '0.0'
        }));
      } catch (error) {
        console.error('Ошибка обновления баланса:', error);
      }
    };

    const interval = setInterval(refreshBalance, 30000);
    return () => clearInterval(interval);
  }, [connected, address, setBalance]);
};

type TradingStrategy = 'grid' | 'twap' | 'momentum' | 'delta-neutral';

export default function MetaMaskOfficePage() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState<WalletBalance>({
    eth: '0.0',
    usdt: '0.0',
    pol: '0.0',
    address: ''
  });
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy>('grid');
  const [tradeAmount, setTradeAmount] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [selectedPair, setSelectedPair] = useState<string>('ETH-USDT');
  const [tradeOpportunities, setTradeOpportunities] = useState<any[]>([]);

  // Автообновление балансов
  useAutoRefreshBalance(connected, balance.address, setBalance);

  // Автосканирование возможностей при выборе пары
  useEffect(() => {
    if (selectedPair) {
      scanPairOpportunities();
    }
  }, [selectedPair]);

  const [selectedNetwork, setSelectedNetwork] = useState<'polygon' | 'ethereum'>('polygon');

  const connectMetaMask = async () => {
    if (!window.ethereum) {
      setError('MetaMask не установлен. Пожалуйста, установите MetaMask.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      const address = accounts[0];
      
      // Получаем chainId
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      const chainIdNum = parseInt(chainId, 16);
      
      // Поддержка Polygon и Ethereum
      const supportedChains = [1, 137, 80002]; // Ethereum Mainnet, Polygon Mainnet, Amoy
      if (!supportedChains.includes(chainIdNum)) {
        setError('Переключитесь на Ethereum (1), Polygon Mainnet (137) или Amoy Testnet (80002)');
        setLoading(false);
        return;
      }
      
      // Определяем текущую сеть
      if (chainIdNum === 1) {
        setSelectedNetwork('ethereum');
      } else {
        setSelectedNetwork('polygon');
      }
      
      await updateBalances(address, chainIdNum);
      
      setConnected(true);
      
      // Автоматически сканируем возможности после подключения
      await scanOpportunities();
      
    } catch (err: any) {
      setError(`Ошибка подключения: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateBalances = async (address: string, chainIdNum: number) => {
    // Получаем нативный баланс (POL/MATIC или ETH)
    const nativeBalance = await window.ethereum.request({
      method: 'eth_getBalance',
      params: [address, 'latest']
    });
    const nativeBalanceFormatted = (parseInt(nativeBalance, 16) / 1e18).toFixed(4);
    
    // Адреса токенов для разных сетей
    let USDT_ADDRESS: string;
    let POL_ADDRESS: string;
    let WETH_ADDRESS: string;

    if (chainIdNum === 1) {
      // Ethereum Mainnet
      USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      POL_ADDRESS = '0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6'; // POL на Ethereum
      WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
    } else if (chainIdNum === 137) {
      // Polygon Mainnet
      USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
      POL_ADDRESS = '0x0000000000000000000000000000000000001010'; // Native POL
      WETH_ADDRESS = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
    } else {
      // Amoy Testnet
      USDT_ADDRESS = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
      POL_ADDRESS = '0x0000000000000000000000000000000000001010';
      WETH_ADDRESS = '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9';
    }
    
    console.log('Fetching balances for chain:', chainIdNum);
    console.log('USDT address:', USDT_ADDRESS);
    console.log('WETH address:', WETH_ADDRESS);
    
    // Получаем баланс USDT
    let usdtBalance = '0.0';
    try {
      const decimals = 6; // USDT всегда 6 decimals
      const usdtData = await window.ethereum.request({
        method: 'eth_call',
        params: [{
          to: USDT_ADDRESS,
          data: '0x70a08231000000000000000000000000' + address.slice(2)
        }, 'latest']
      });
      usdtBalance = (parseInt(usdtData, 16) / Math.pow(10, decimals)).toFixed(2);
    } catch (e) {
      console.error('Error fetching USDT balance:', e);
    }
    
    // Получаем баланс POL
    let polTokenBalance = '0.0';
    if (chainIdNum === 1) {
      // Для Ethereum - POL это ERC20 токен
      try {
        const polData = await window.ethereum.request({
          method: 'eth_call',
          params: [{
            to: POL_ADDRESS,
            data: '0x70a08231000000000000000000000000' + address.slice(2)
          }, 'latest']
        });
        polTokenBalance = (parseInt(polData, 16) / 1e18).toFixed(4);
      } catch (e) {
        console.error('Error fetching POL balance:', e);
      }
    }
    
    // Получаем баланс ETH/WETH
    let ethBalance = '0.0';
    try {
      if (chainIdNum === 1) {
        // На Ethereum получаем нативный ETH
        ethBalance = nativeBalanceFormatted;
      } else {
        // На Polygon получаем WETH
        const ethData = await window.ethereum.request({
          method: 'eth_call',
          params: [{
            to: WETH_ADDRESS,
            data: '0x70a08231000000000000000000000000' + address.slice(2)
          }, 'latest']
        });
        ethBalance = (parseInt(ethData, 16) / 1e18).toFixed(4);
      }
    } catch (e) {
      console.error('Error fetching ETH/WETH balance:', e);
    }
    
    setBalance({
      eth: ethBalance,
      usdt: usdtBalance,
      pol: chainIdNum === 1 ? polTokenBalance : nativeBalanceFormatted,
      address: address
    });
  };

  const disconnectMetaMask = () => {
    setConnected(false);
    setBalance({
      eth: '0.0',
      usdt: '0.0',
      pol: '0.0',
      address: ''
    });
  };

  // Сканирование арбитражных возможностей
  const scanOpportunities = async () => {
    setLoadingOpportunities(true);
    try {
      const response = await fetch('/api/scanner/opportunities');
      const data = await response.json();
      setOpportunities(data || []);
    } catch (err: any) {
      console.error('Ошибка сканирования возможностей:', err);
    } finally {
      setLoadingOpportunities(false);
    }
  };

  const startTrading = async () => {
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      setError('Введите корректную сумму для торговли');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/metamask/start-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: selectedStrategy,
          amount: tradeAmount,
          address: balance.address
        })
      });

      if (!response.ok) {
        throw new Error('Ошибка при запуске торговли');
      }

      const data = await response.json();
      
      toast({
        title: "✅ Торговля запущена",
        description: data.message,
      });
      
      // Обновляем возможности после запуска
      await scanOpportunities();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    try {
      const response = await fetch('/api/metamask/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: balance.address })
      });

      if (!response.ok) throw new Error('Ошибка экспорта');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trading-report-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const exportToCSV = async () => {
    try {
      const response = await fetch('/api/metamask/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: balance.address })
      });

      if (!response.ok) throw new Error('Ошибка экспорта');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trading-data-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const tradingPairs = [
    { 
      id: 'ETH-USDT', 
      name: 'ETH / USDT',
      description: 'Ethereum к USDT - высокая ликвидность',
      liquidity: 'Высокая'
    },
    { 
      id: 'ETH-POL', 
      name: 'ETH / POL (MATIC)',
      description: 'Ethereum к Polygon - оптимизированные комиссии',
      liquidity: 'Средняя'
    },
    { 
      id: 'POL-USDT', 
      name: 'POL / USDT',
      description: 'Polygon к USDT - низкие комиссии',
      liquidity: 'Высокая'
    }
  ];

  const strategies = [
    {
      id: 'grid' as TradingStrategy,
      name: 'Grid',
      description: 'Сетка ордеров на покупку и продажу с фиксированным шагом. Идеально для боковых трендов.'
    },
    {
      id: 'twap' as TradingStrategy,
      name: 'TWAP',
      description: 'Time-Weighted Average Price - равномерное распределение ордеров по времени.'
    },
    {
      id: 'momentum' as TradingStrategy,
      name: 'Momentum',
      description: 'Следование за трендом, покупка при росте и продажа при падении.'
    },
    {
      id: 'delta-neutral' as TradingStrategy,
      name: 'Delta-Neutral',
      description: 'Хеджирование позиций для минимизации рыночного риска.'
    }
  ];

  // Автоматический поиск возможностей для выбранной пары
  const scanPairOpportunities = async () => {
    try {
      const response = await fetch(`/api/scanner/pair-opportunities?pair=${selectedPair}`);
      const data = await response.json();
      setTradeOpportunities(data.opportunities || []);
    } catch (err) {
      console.error('Ошибка сканирования пары:', err);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">MetaMask Торговый Офис</h1>
          <p className="text-muted-foreground">
            ETH / USDT / USD-POL - Полный торговый функционал
          </p>
        </div>
      </div>

      {/* MetaMask Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            MetaMask Кошелек
          </CardTitle>
          <CardDescription>
            Подключите MetaMask для начала торговли
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!connected ? (
            <Button onClick={connectMetaMask} disabled={loading} className="w-full" size="lg">
              <Wallet className="mr-2 h-5 w-5" />
              {loading ? 'Подключение...' : 'Подключить MetaMask'}
            </Button>
          ) : (
            <div className="space-y-4">
              <Alert className="bg-green-500/10 border-green-500">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-500 flex items-center justify-between">
                  <span>Кошелек подключен: {balance.address.substring(0, 6)}...{balance.address.substring(38)}</span>
                  <Badge variant="outline" className="ml-2">
                    {selectedNetwork === 'ethereum' ? 'Ethereum' : 'Polygon'}
                  </Badge>
                </AlertDescription>
              </Alert>
              
              {/* Переключатель сети */}
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant={selectedNetwork === 'polygon' ? 'default' : 'outline'}
                  onClick={async () => {
                    try {
                      await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x89' }], // Polygon Mainnet
                      });
                      setSelectedNetwork('polygon');
                      await updateBalances(balance.address, 137);
                      toast({ title: "✅ Сеть изменена", description: "Переключено на Polygon Mainnet" });
                    } catch (error: any) {
                      if (error.code === 4902) {
                        toast({ title: "Ошибка", description: "Добавьте Polygon Mainnet в MetaMask", variant: "destructive" });
                      } else {
                        toast({ title: "Ошибка", description: error.message, variant: "destructive" });
                      }
                    }
                  }}
                >
                  Polygon
                </Button>
                <Button
                  size="sm"
                  variant={selectedNetwork === 'ethereum' ? 'default' : 'outline'}
                  onClick={async () => {
                    try {
                      await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x1' }], // Ethereum Mainnet
                      });
                      setSelectedNetwork('ethereum');
                      await updateBalances(balance.address, 1);
                      toast({ title: "✅ Сеть изменена", description: "Переключено на Ethereum Mainnet" });
                    } catch (error: any) {
                      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
                    }
                  }}
                >
                  Ethereum
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">ETH (WETH)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{balance.eth}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">USDT</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{balance.usdt}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">POL (MATIC)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{balance.pol}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button onClick={disconnectMetaMask} variant="outline" className="flex-1">
                  Отключить MetaMask
                </Button>
                <Button onClick={startTrading} variant="default" className="flex-1">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Начать торговлю с баланса
                </Button>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="balance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="balance">Баланс</TabsTrigger>
          <TabsTrigger value="trading">Торговля</TabsTrigger>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="reports">Отчёты</TabsTrigger>
          <TabsTrigger value="support">Поддержка</TabsTrigger>
        </TabsList>

        {/* Balance Tab */}
        <TabsContent value="balance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Управление балансом</CardTitle>
              <CardDescription>Пополнение и вывод средств через MetaMask</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="deposit-amount">Сумма для пополнения (USDC)</Label>
                  <Input
                    id="deposit-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={!connected}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    disabled={!connected} 
                    className="h-20 flex-col gap-2"
                    onClick={async () => {
                      try {
                        const amount = (document.getElementById('deposit-amount') as HTMLInputElement)?.value;
                        if (!amount || parseFloat(amount) <= 0) {
                          toast({
                            title: "Ошибка",
                            description: "Введите корректную сумму",
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        // Отправляем USDC на контракт (пример)
                        const tx = await window.ethereum.request({
                          method: 'eth_sendTransaction',
                          params: [{
                            from: balance.address,
                            to: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC на Polygon
                            value: '0x0',
                            data: '0x' // Здесь должна быть правильная кодировка transfer
                          }]
                        });
                        
                        toast({
                          title: "✅ Пополнение отправлено",
                          description: `TX: ${tx}`,
                        });
                      } catch (err: any) {
                        toast({
                          title: "Ошибка",
                          description: err.message,
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <Upload className="h-6 w-6" />
                    <span>Пополнить баланс</span>
                  </Button>

                  <Button 
                    disabled={!connected} 
                    variant="outline" 
                    className="h-20 flex-col gap-2"
                    onClick={async () => {
                      try {
                        const amount = (document.getElementById('deposit-amount') as HTMLInputElement)?.value;
                        if (!amount || parseFloat(amount) <= 0) {
                          toast({
                            title: "Ошибка",
                            description: "Введите корректную сумму",
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        const response = await fetch('/api/metamask/withdraw', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            address: balance.address,
                            amount,
                            token: 'USDC'
                          })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                          toast({
                            title: "✅ Вывод выполнен",
                            description: `TX: ${data.txHash}`,
                          });
                        } else {
                          throw new Error(data.message);
                        }
                      } catch (err: any) {
                        toast({
                          title: "Ошибка",
                          description: err.message,
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <Download className="h-6 w-6" />
                    <span>Вывести баланс</span>
                  </Button>
                </div>
              </div>
              
              {/* Межсетевые арбитражные возможности */}
              <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">🌐 Межсетевой арбитраж</CardTitle>
                    <Button size="sm" variant="outline" onClick={async () => {
                      setLoadingOpportunities(true);
                      try {
                        const response = await fetch('/api/cross-chain/opportunities');
                        const data = await response.json();
                        setOpportunities(data);
                      } catch (error) {
                        console.error('Error fetching cross-chain opportunities:', error);
                      } finally {
                        setLoadingOpportunities(false);
                      }
                    }} disabled={loadingOpportunities}>
                      <RefreshCw className={`h-3 w-3 mr-1 ${loadingOpportunities ? 'animate-spin' : ''}`} />
                      Сканировать
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingOpportunities ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Сканирование Polygon, BSC, Arbitrum, Avalanche...
                    </div>
                  ) : opportunities.length > 0 ? (
                    <div className="space-y-2">
                      {opportunities.slice(0, 3).map((opp: any, i: number) => (
                        <div key={i} className="p-3 border rounded-lg text-xs bg-card">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold">{opp.chainA?.token || opp.tokenIn?.symbol}</span>
                            <Badge variant="default" className="text-xs bg-purple-600">
                              ${opp.expectedProfitUsd?.toFixed(2) || opp.estimatedProfitUsd?.toFixed(2)}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground space-y-1">
                            <div className="flex items-center gap-1">
                              <span>📍 {opp.chainA?.name || opp.buyDex}</span>
                              <span>→</span>
                              <span>📍 {opp.chainB?.name || opp.sellDex}</span>
                            </div>
                            <div>⏱️ Bridge: {opp.bridgeTimeSec}s</div>
                            <div>⚠️ Риск: {opp.riskScore}/10</div>
                            <div className="text-green-600 dark:text-green-400 font-mono font-semibold">
                              Gas: ${opp.gasCostUsd?.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Нажмите "Сканировать" для поиска возможностей
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trading Tab */}
        <TabsContent value="trading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Настройка торговли</CardTitle>
              <CardDescription>Выберите валютную пару, стратегию и сумму для торговли</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Выбор торговой пары */}
              <div className="space-y-3">
                <Label>Выбор торговой пары</Label>
                {tradingPairs.map((pair) => (
                  <Card
                    key={pair.id}
                    className={`cursor-pointer transition-all ${
                      selectedPair === pair.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground/50'
                    }`}
                    onClick={() => {
                      setSelectedPair(pair.id);
                      scanPairOpportunities();
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-4 w-4 rounded-full border-2 ${
                          selectedPair === pair.id
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">{pair.name}</span>
                            <Badge variant="outline">{pair.liquidity}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {pair.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Возможности для выбранной пары */}
              {tradeOpportunities.length > 0 && (
                <Card className="bg-green-500/5 border-green-500/20">
                  <CardHeader>
                    <CardTitle className="text-sm">Возможные сделки для {selectedPair}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {tradeOpportunities.slice(0, 3).map((opp: any, i: number) => (
                      <div key={i} className="p-3 border rounded-lg bg-card">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-sm">{opp.type}</span>
                          <Badge variant="default" className="text-xs bg-green-600">
                            +{opp.profit}%
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <div>Точка входа: ${opp.entryPrice}</div>
                          <div>Точка выхода: ${opp.exitPrice}</div>
                          <div className="text-green-600 dark:text-green-400 font-semibold">
                            Прогноз прибыли: ${opp.estimatedProfit}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">Сумма для торговли</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  disabled={!connected}
                />
              </div>

              <div className="space-y-3">
                <Label>Выбор стратегии</Label>
                {strategies.map((strategy) => (
                  <Card
                    key={strategy.id}
                    className={`cursor-pointer transition-all ${
                      selectedStrategy === strategy.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setSelectedStrategy(strategy.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-4 w-4 rounded-full border-2 ${
                          selectedStrategy === strategy.id
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground'
                        }`} />
                        <div className="flex-1">
                          <div className="font-semibold mb-1">{strategy.name}</div>
                          <p className="text-sm text-muted-foreground">
                            {strategy.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={startTrading} disabled={!connected || loading} className="flex-1">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Подтвердить
                </Button>
                <Button variant="outline" className="flex-1">
                  <XCircle className="mr-2 h-4 w-4" />
                  Отказаться
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">67.5%</div>
                <p className="text-sm text-muted-foreground">Процент успешных сделок</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">1.82</div>
                <p className="text-sm text-muted-foreground">Соотношение риска/прибыли</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">PnL</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-500">+$2,450</div>
                <p className="text-sm text-muted-foreground">Общая прибыль/убыток</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Gas Spent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">$145.50</div>
                <p className="text-sm text-muted-foreground">Затраты на комиссии</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Экспорт данных</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button onClick={exportToPDF} disabled={!connected}>
                <FileText className="mr-2 h-4 w-4" />
                Экспорт в PDF
              </Button>
              <Button onClick={exportToCSV} variant="outline" disabled={!connected}>
                <FileText className="mr-2 h-4 w-4" />
                Экспорт в CSV
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ежедневные отчёты</CardTitle>
              <CardDescription>Скачайте отчёты о торговой активности</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {['Сегодня', 'Вчера', '2 дня назад', '3 дня назад'].map((day, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">{day}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(Date.now() - i * 24 * 60 * 60 * 1000).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      <Download className="mr-2 h-3 w-3" />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline">
                      <Download className="mr-2 h-3 w-3" />
                      CSV
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Features Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Staking */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">🌾 Built-in Staking</CardTitle>
                <CardDescription>Встроенный стейкинг LP-токенов</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>LP Token</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите LP токен" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eth-usdt">ETH-USDT LP</SelectItem>
                      <SelectItem value="eth-pol">ETH-POL LP</SelectItem>
                      <SelectItem value="pol-usdt">POL-USDT LP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Сумма для стейкинга</Label>
                  <Input type="number" placeholder="0.00" />
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <div className="text-xs text-muted-foreground">APR</div>
                  <div className="text-lg font-bold text-green-600">15.5%</div>
                </div>
                <Button className="w-full" disabled={!connected}>
                  Stake LP Tokens
                </Button>
              </CardContent>
            </Card>

            {/* Farming */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">🚜 Built-in Farming</CardTitle>
                <CardDescription>Встроенный farming LP-токенов</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Farming Pool</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите пул" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eth-usdt">ETH-USDT Farm</SelectItem>
                      <SelectItem value="eth-pol">ETH-POL Farm</SelectItem>
                      <SelectItem value="pol-usdt">POL-USDT Farm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Сумма для farming</Label>
                  <Input type="number" placeholder="0.00" />
                </div>
                <div className="p-3 bg-yellow-500/10 rounded-lg">
                  <div className="text-xs text-muted-foreground">APY</div>
                  <div className="text-lg font-bold text-yellow-600">22.3%</div>
                </div>
                <Button className="w-full" disabled={!connected}>
                  Start Farming
                </Button>
              </CardContent>
            </Card>

            {/* Insurance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">🛡️ Built-in Insurance</CardTitle>
                <CardDescription>Встроенный страховой vault</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-blue-500/10 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Покрытие</span>
                    <span className="text-sm font-semibold">$50,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Премия</span>
                    <span className="text-sm font-semibold">2.5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Защита от</span>
                    <span className="text-sm font-semibold">Flash Crash</span>
                  </div>
                </div>
                <Button className="w-full" disabled={!connected}>
                  Активировать страховку
                </Button>
              </CardContent>
            </Card>

            {/* Options */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">📊 Built-in Options</CardTitle>
                <CardDescription>Встроенные опционы</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Тип опциона</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Call / Put" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call Option</SelectItem>
                      <SelectItem value="put">Put Option</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Strike Price</Label>
                  <Input type="number" placeholder="2850.00" />
                </div>
                <div className="space-y-2">
                  <Label>Expiry (hours)</Label>
                  <Input type="number" placeholder="24" />
                </div>
                <Button className="w-full" disabled={!connected}>
                  Buy Option
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Support Tab */}
        <TabsContent value="support" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>FAQ - Часто задаваемые вопросы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  q: 'Как подключить MetaMask?',
                  a: 'Нажмите кнопку "Подключить MetaMask" на главной странице и подтвердите подключение в расширении.'
                },
                {
                  q: 'Какие стратегии доступны?',
                  a: 'Доступны 4 стратегии: Grid, TWAP, Momentum и Delta-Neutral. Каждая подходит для разных рыночных условий.'
                },
                {
                  q: 'Как вывести средства?',
                  a: 'Перейдите на вкладку "Баланс" и нажмите "Вывести баланс". Средства будут отправлены на ваш MetaMask кошелек.'
                }
              ].map((faq, i) => (
                <div key={i} className="p-4 border rounded-lg">
                  <div className="font-semibold mb-2">{faq.q}</div>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Чат поддержки (Gemini AI)</CardTitle>
              <CardDescription>Задайте вопрос и получите мгновенный ответ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Введите ваш вопрос..."
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                rows={4}
              />
              <Button className="w-full">
                <HelpCircle className="mr-2 h-4 w-4" />
                Отправить вопрос в Gemini AI
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
