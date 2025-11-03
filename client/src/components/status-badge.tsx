import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: "running" | "stopped" | "paused" | "error" | "success" | "warning" | "info" | "pending"
  label?: string
  showDot?: boolean
  className?: string
}

const statusConfig = {
  running: {
    variant: "default",
    dotClass: "bg-green-500 animate-pulse",
    label: "Запущен"
  },
  stopped: {
    variant: "secondary",
    dotClass: "bg-gray-500",
    label: "Остановлен"
  },
  paused: {
    variant: "secondary",
    dotClass: "bg-yellow-500",
    label: "Пауза"
  },
  error: {
    variant: "destructive",
    dotClass: "bg-red-500",
    label: "Ошибка"
  },
  success: {
    variant: "default",
    dotClass: "bg-green-500",
    label: "Успешно"
  },
  warning: {
    variant: "secondary",
    dotClass: "bg-yellow-500",
    label: "Предупреждение"
  },
  info: {
    variant: "secondary",
    dotClass: "bg-blue-500",
    label: "Информация"
  },
  pending: {
    variant: "secondary",
    dotClass: "bg-orange-500",
    label: "Ожидание"
  }
} as const

export function StatusBadge({ status, label, showDot = true, className }: StatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge
      variant={config.variant as any}
      className={cn("font-medium uppercase tracking-wide gap-2", className)}
      data-testid={`badge-status-${status}`}
    >
      {showDot && <span className={cn("w-2 h-2 rounded-full", config.dotClass)} />}
      <span>{label || config.label}</span>
    </Badge>
  )
}
