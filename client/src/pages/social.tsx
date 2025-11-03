
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Trophy, Users, Vote, Award, TrendingUp, Copy } from 'lucide-react';

export default function SocialPage() {
  const { toast } = useToast();
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(null);

  const { data: leaderboard } = useQuery({
    queryKey: ['/api/social/leaderboard'],
  });

  const { data: strategies } = useQuery({
    queryKey: ['/api/social/copy-trading'],
  });

  const { data: proposals } = useQuery({
    queryKey: ['/api/social/dao/proposals'],
  });

  const { data: badges } = useQuery({
    queryKey: ['/api/social/nft/badges'],
  });

  const subscribeMutation = useMutation({
    mutationFn: async (strategyId: number) => {
      const res = await fetch('/api/social/copy-trading/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Подписка активирована',
        description: data.message,
      });
    },
  });

  const voteMutation = useMutation({
    mutationFn: async ({ proposalId, vote }: { proposalId: number; vote: string }) => {
      const res = await fetch('/api/social/dao/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, vote }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '🗳️ Голос учтён',
        description: data.message,
      });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Социальные Функции</h1>
          <p className="text-muted-foreground">
            Leaderboard • Copy-Trading • DAO • NFT Badges
          </p>
        </div>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="leaderboard">
            <Trophy className="h-4 w-4 mr-2" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="copy-trading">
            <Copy className="h-4 w-4 mr-2" />
            Copy-Trading
          </TabsTrigger>
          <TabsTrigger value="dao">
            <Vote className="h-4 w-4 mr-2" />
            DAO
          </TabsTrigger>
          <TabsTrigger value="nft">
            <Award className="h-4 w-4 mr-2" />
            NFT Badges
          </TabsTrigger>
        </TabsList>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>🏆 Топ-Трейдеры по PnL</CardTitle>
              <CardDescription>Анонимная таблица лидеров</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {leaderboard?.map((entry: any) => (
                  <div
                    key={entry.rank}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold text-muted-foreground">
                        #{entry.rank}
                      </div>
                      <div>
                        <div className="font-semibold">{entry.anonymousId}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.tradesCount} сделок • Win Rate: {entry.winRate.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${entry.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {entry.totalPnL >= 0 ? '+' : ''}${entry.totalPnL.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Sharpe: {entry.sharpeRatio.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Copy-Trading Tab */}
        <TabsContent value="copy-trading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>📋 Доступные Стратегии</CardTitle>
              <CardDescription>Копируйте сделки успешных трейдеров</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {strategies?.map((strategy: any) => (
                <div key={strategy.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold">{strategy.name}</div>
                      <div className="text-sm text-muted-foreground">{strategy.description}</div>
                    </div>
                    <Badge variant="outline">{strategy.followers} подписчиков</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className={`text-lg font-bold ${strategy.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      PnL: ${strategy.pnl.toFixed(2)}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => subscribeMutation.mutate(strategy.id)}
                      disabled={subscribeMutation.isPending}
                    >
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Подписаться
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DAO Tab */}
        <TabsContent value="dao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>🗳️ DAO Голосование</CardTitle>
              <CardDescription>Участвуйте в управлении платформой</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {proposals?.map((proposal: any) => (
                <div key={proposal.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">{proposal.title}</div>
                    <Badge>{proposal.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{proposal.description}</p>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="text-sm">
                      ✅ ЗА: <span className="font-bold text-green-500">{proposal.votesFor}</span>
                    </div>
                    <div className="text-sm">
                      ❌ ПРОТИВ: <span className="font-bold text-red-500">{proposal.votesAgainst}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => voteMutation.mutate({ proposalId: proposal.id, vote: 'for' })}
                    >
                      Голосовать ЗА
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => voteMutation.mutate({ proposalId: proposal.id, vote: 'against' })}
                    >
                      Голосовать ПРОТИВ
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NFT Badges Tab */}
        <TabsContent value="nft" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>🏅 Ваши NFT-Бейджи</CardTitle>
              <CardDescription>Достижения за успешную торговлю</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {badges?.map((badge: any) => (
                  <div key={badge.id} className="p-4 border rounded-lg text-center">
                    <div className="text-4xl mb-2">{badge.title.split(' ')[0]}</div>
                    <div className="font-semibold mb-1">{badge.title}</div>
                    <div className="text-sm text-muted-foreground mb-2">{badge.description}</div>
                    <div className="text-xs text-muted-foreground">
                      Получено: {new Date(badge.earnedAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
