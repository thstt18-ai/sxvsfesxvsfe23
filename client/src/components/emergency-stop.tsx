
import { useState } from "react";
import { AlertTriangle, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function EmergencyStop() {
  const { toast } = useToast();
  const [isStopping, setIsStopping] = useState(false);

  const handleEmergencyStop = async () => {
    setIsStopping(true);
    try {
      const response = await apiRequest("POST", "/api/emergency/stop", {
        reason: "Manual emergency stop from UI",
      });

      if (response.success) {
        toast({
          title: "🚨 Emergency Stop Activated",
          description: response.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: response.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to execute emergency stop",
        variant: "destructive",
      });
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="destructive" 
          className="w-full"
          data-testid="button-emergency-stop"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Emergency Stop
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Emergency Stop
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately stop all trading operations and cancel pending transactions.
            <br /><br />
            <strong>Actions that will be taken:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Stop the bot and scanner</li>
              <li>Pause all trading operations</li>
              <li>Cancel pending transactions</li>
              <li>Create circuit breaker event</li>
              <li>Require manual restart</li>
            </ul>
            <br />
            Are you sure you want to proceed?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEmergencyStop}
            disabled={isStopping}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Power className="mr-2 h-4 w-4" />
            {isStopping ? "Stopping..." : "Confirm Emergency Stop"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
