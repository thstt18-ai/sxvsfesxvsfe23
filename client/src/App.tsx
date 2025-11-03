import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import Ledger from "@/pages/ledger";
import Safe from "@/pages/safe";
import Wallet from "@/pages/wallet";
import Trade from "@/pages/trade";
import TransactionsPage from "@/pages/transactions";
import DocumentationPage from "@/pages/documentation";
import LogsPage from "@/pages/logs";
import RiskManagement from "@/pages/risk-management";
import AIAssistant from "@/pages/ai-assistant";
import NotFoundPage from "@/pages/not-found";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import FullTradeFlow from "./pages/full-trade-flow";
import AdvancedTrading from "@/pages/advanced-trading";
import AutoSignPage from "@/pages/auto-sign";
import MetaMaskOfficePage from "@/pages/metamask-office";
import SocialPage from "./pages/social";

export default function App() {
  const sidebarStyle = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="app-theme">
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between p-2 border-b gap-2">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto">
                  <Switch>
                    <Route path="/">
                      {() => <Dashboard />}
                    </Route>
                    <Route path="/settings">
                      {() => <Settings />}
                    </Route>
                    <Route path="/risk-management">
                      {() => <RiskManagement />}
                    </Route>
                    <Route path="/ledger">
                      {() => <Ledger />}
                    </Route>
                    <Route path="/safe">
                      {() => <Safe />}
                    </Route>
                    <Route path="/wallet" component={Wallet} />
                    <Route path="/trade">
                      {() => <Trade />}
                    </Route>
                    <Route path="/transactions">
                      {() => <TransactionsPage />}
                    </Route>
                    <Route path="/documentation">
                      {() => <DocumentationPage />}
                    </Route>
                    <Route path="/logs">
                      {() => <LogsPage />}
                    </Route>
                    <Route path="/full-trade" component={FullTradeFlow} />
                    <Route path="/advanced-trading" component={AdvancedTrading} />
                    <Route path="/auto-sign" component={AutoSignPage} />
                    <Route path="/metamask-office" component={MetaMaskOfficePage} />
                    <Route path="/social" element={<SocialPage />} />
                    <Route path="/ai-assistant">
                      {() => (
                        <Suspense fallback={
                          <div className="container mx-auto p-6 space-y-6">
                            <Skeleton className="h-12 w-64" />
                            <Skeleton className="h-[600px]" />
                          </div>
                        }>
                          <AIAssistant />
                        </Suspense>
                      )}
                    </Route>
                    <Route>
                      {() => <NotFoundPage />}
                    </Route>
                  </Switch>
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}