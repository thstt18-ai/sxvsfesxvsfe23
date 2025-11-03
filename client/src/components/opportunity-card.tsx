import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface OpportunityCardProps {
  tokenPair: string
  profitPercent: number
  profitUsd: number
  buyDex: string
  sellDex: string
  gasCost: number
  hasLiquidity: boolean
  onExecute?: () => void
  className?: string
}

export function OpportunityCard({
  tokenPair,
  profitPercent,
  profitUsd,
  buyDex,
  sellDex,
  gasCost,
  hasLiquidity,
  onExecute,
  className
}: OpportunityCardProps) {
  const isProfit = profitPercent > 0

  return (
    <Card className={cn("hover-elevate", className)} data-testid={`card-opportunity-${tokenPair}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-lg font-semibold font-mono">{tokenPair}</h3>
          <Badge variant={hasLiquidity ? "default" : "secondary"}>
            {hasLiquidity ? "Ликвидность OK" : "Низкая ликвидность"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={cn("w-5 h-5", isProfit ? "text-trading-profit" : "text-trading-loss")} />
            <span className={cn(
              "text-2xl font-bold font-mono",
              isProfit ? "text-trading-profit" : "text-trading-loss"
            )}>
              +{profitPercent.toFixed(2)}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Прибыль: ${profitUsd.toFixed(2)} USD
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{buyDex}</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{sellDex}</span>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t flex-wrap">
          <div className="text-sm">
            <span className="text-muted-foreground">Gas: </span>
            <span className="font-mono">${gasCost.toFixed(2)}</span>
          </div>
          <Button
            onClick={onExecute}
            disabled={!hasLiquidity}
            size="sm"
            data-testid="button-execute-trade"
          >
            Выполнить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
