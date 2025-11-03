import {
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Wallet,
  TrendingUp,
  FileText,
  Book,
  Usb,
  Shield,
  ScrollText,
  Brain,
  Zap,
  Key,
  Users, // Added Users icon
} from "lucide-react"
import { Link, useLocation } from "wouter"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const mainItems = [
  {
    title: "Панель управления",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Управление рисками",
    url: "/risk-management",
    icon: ShieldCheck,
  },
  {
    title: "Автоподпись",
    url: "/auto-sign",
    icon: Key,
  },
  {
    title: "💰 MetaMask Офис",
    url: "/metamask-office",
    icon: Wallet,
  },
  {
    title: "Торговля",
    url: "/trade",
    icon: TrendingUp,
  },
  {
    title: "Транзакции",
    url: "/transactions",
    icon: FileText,
  },
  {
    title: "Логи",
    url: "/logs",
    icon: ScrollText,
  },
]

const integrationItems = [
  {
    title: "Кошелек",
    url: "/wallet",
    icon: Wallet,
  },
  {
    title: "Ledger",
    url: "/ledger",
    icon: Usb,
  },
  {
    title: "Gnosis Safe",
    url: "/safe",
    icon: Shield,
  },
]

const settingsItems = [
  {
    title: "Настройки",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "Документация",
    url: "/documentation",
    icon: Book,
  },
  {
    title: "AI Assistant",
    url: "/ai-assistant",
    icon: Brain,
  },
  {
    title: "📈 Дальнейшая Торговля",
    url: "/advanced-trading",
    icon: TrendingUp,
  },
  // Added Social Features item
  {
    title: "Social Features",
    url: "/social",
    icon: Users,
  },
]

export function AppSidebar() {
  const [location] = useLocation()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Flash Loan Arbitrage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.url.substring(1) || 'dashboard'}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Интеграции</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {integrationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.url.substring(1)}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Система</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.url.substring(1)}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}