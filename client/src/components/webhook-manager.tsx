import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WebhookManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook Manager</CardTitle>
        <CardDescription>
          Manage webhook notifications for trading events
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Webhook management coming soon...
        </p>
      </CardContent>
    </Card>
  );
}
