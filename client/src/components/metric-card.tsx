import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  title: string
  value: string
  trend?: {
    value: string
    isPositive: boolean
  }
  icon?: React.ReactNode
  className?: string
}

export function MetricCard({ title, value, trend, icon, className }: MetricCardProps) {
  return (
    <Card className={cn("hover-elevate", className)} data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold font-mono" data-testid={`text-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-2 text-sm">
            {trend.isPositive ? (
              <TrendingUp className="w-4 h-4 text-trading-profit" />
            ) : (
              <TrendingDown className="w-4 h-4 text-trading-loss" />
            )}
            <span className={cn(
              "font-medium font-mono",
              trend.isPositive ? "text-trading-profit" : "text-trading-loss"
            )}>
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
