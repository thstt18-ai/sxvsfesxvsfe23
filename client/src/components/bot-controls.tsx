import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Play, Pause, StopCircle } from "lucide-react"
import { StatusBadge } from "./status-badge"

interface BotControlsProps {
  isRunning: boolean
  isPaused: boolean
  isSimulation: boolean
  onStart: () => void
  onStop: () => void
  onEmergencyStop: () => void
  onToggleSimulation: (value: boolean) => void
}

export function BotControls({
  isRunning,
  isPaused,
  isSimulation,
  onStart,
  onStop,
  onEmergencyStop,
  onToggleSimulation,
}: BotControlsProps) {
  const [localIsRunning, setLocalIsRunning] = useState(isRunning)

  const handleStart = () => {
    setLocalIsRunning(true)
    onStart()
  }

  const handleStop = () => {
    setLocalIsRunning(false)
    onStop()
  }

  const handleEmergencyStop = () => {
    setLocalIsRunning(false)
    onEmergencyStop()
  }

  return (
    <Card data-testid="card-bot-controls">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-4">
          <span>Управление ботом</span>
          <StatusBadge
            status={localIsRunning ? (isPaused ? "paused" : "running") : "stopped"}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Button
            onClick={handleStart}
            disabled={localIsRunning}
            variant="default"
            className="gap-2"
            data-testid="button-start-bot"
          >
            <Play className="w-4 h-4" />
            Запустить
          </Button>
          <Button
            onClick={handleStop}
            disabled={!localIsRunning}
            variant="secondary"
            className="gap-2"
            data-testid="button-stop-bot"
          >
            <Pause className="w-4 h-4" />
            Остановить
          </Button>
          <Button
            onClick={handleEmergencyStop}
            variant="destructive"
            className="gap-2"
            data-testid="button-emergency-stop"
          >
            <StopCircle className="w-4 h-4" />
            Экстренная остановка
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 p-4 border rounded-md">
          <div className="space-y-1">
            <Label htmlFor="simulation-mode" className="text-base font-medium">
              Режим симуляции
            </Label>
            <p className="text-sm text-muted-foreground">
              {isSimulation ? "Тестовый режим - реальные сделки не выполняются" : "РЕАЛЬНЫЙ режим - сделки выполняются на блокчейне"}
            </p>
          </div>
          <Switch
            id="simulation-mode"
            checked={isSimulation}
            onCheckedChange={onToggleSimulation}
            data-testid="switch-simulation-mode"
          />
        </div>
      </CardContent>
    </Card>
  )
}
