# Design Guidelines: Flash Loan Arbitrage Trading Bot Platform

## Design Approach

**Framework:** Professional Financial Trading Interface with Design System Foundation

**Primary Design References:**
- **Binance/Coinbase Pro** - Industry-standard crypto trading interfaces for trust and familiarity
- **TradingView** - Professional real-time data visualization and charting excellence
- **Linear** - Clean, modern dashboard aesthetics with excellent hierarchy
- **Notion** - Organized data presentation and intuitive navigation

**Rationale:** This is a high-stakes financial application where users manage real money and need instant access to critical trading information. The design must prioritize clarity, real-time monitoring capabilities, and rapid decision-making while maintaining professional credibility.

## Typography System

**Font Stack:**
- **Primary Interface**: Inter via Google Fonts CDN (`font-sans`)
- **Numerical/Data Display**: JetBrains Mono via Google Fonts CDN (`font-mono`)

**Hierarchy:**
- **Page Titles (H1)**: `text-3xl font-bold` - Main dashboard headers
- **Section Headers (H2)**: `text-xl font-semibold` - Card titles, panel headers  
- **Subsections (H3)**: `text-lg font-medium` - Table headers, grouped labels
- **Body Text**: `text-base font-normal` - Descriptions, explanatory content
- **Financial Data**: `text-sm font-mono` - Prices, percentages, wallet addresses, transaction hashes
- **Status Labels**: `text-xs font-medium uppercase tracking-wide` - Badges, timestamps, indicators

## Layout Architecture

**Spacing Primitives:** Tailwind units **2, 4, 6, 8**
- Card padding: `p-6`
- Component gaps: `gap-4`, `gap-6`  
- Section spacing: `mb-6`, `mb-8`
- Grid gaps: `gap-4`

**Application Structure:**
- **Fixed Sidebar Navigation**: `w-64` left sidebar with icon + label menu items, collapsible on mobile
- **Main Content Area**: `max-w-7xl mx-auto px-4 md:px-6 lg:px-8`
- **Dashboard Grid**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` for metric cards
- **Full-Width Data Tables**: Transaction history and opportunity lists span full content width

## Core Components

### Dashboard Control Panel
**Bot Status Section:**
- Large, prominent status indicator displaying current state (Running/Stopped/Simulation Mode)
- Pulsing animation dot for active "Running" state
- Quick action controls: Start/Stop toggle, Emergency Stop button (destructive red), Mode selector dropdown
- Critical metrics displayed in 4-column grid: Total Profit (USD), Active Opportunities Count, Success Rate Percentage, Daily P/L
- Real-time status bar showing: Last scan timestamp, Next scan countdown timer, Current gas price, MATIC wallet balance

### Arbitrage Opportunities Panel
**Live Opportunity Cards:**
- Prominent token pair display (e.g., WMATIC/USDC)
- Large profit percentage with green highlight and + prefix
- DEX route visualization: Buy Exchange → Arrow Icon → Sell Exchange
- Liquidity status badge (Sufficient/Insufficient)
- "Execute Trade" primary action button (disabled state with tooltip when conditions not met)
- Metadata row: Estimated gas cost, Expected profit in USD, Timestamp
- Sort and filter controls: By profit %, token pair, liquidity level
- Empty state message: "Scanning for arbitrage opportunities..." when none detected

### Real-Time Logging Panel
**Structured Log Stream:**
- Reverse chronological order with monospace font for technical details
- Color-coded log level badges: ERROR (red), WARN (yellow), INFO (blue), SUCCESS (green)
- Trade execution stage indicators: Detection → Validation → Preparation → Execution → Result
- Expandable error entries revealing full error messages, stack traces, and recommended actions
- Filter controls: Toggle log levels, search functionality, time range selector
- Auto-scroll option with pause button

### Metric Display Cards
- **Primary Value**: `text-3xl font-bold font-mono` - The main metric (profit, success rate, etc.)
- **Trend Indicator**: Arrow icon with percentage change (green up/red down)
- **Sparkline Chart**: Small embedded line chart showing 24-hour trend
- **Label**: `text-sm` descriptive label positioned above value
- **Last Updated**: Timestamp displayed below in muted text

### Data Tables
- Sticky headers that remain visible on scroll with sort indicators (arrows)
- Subtle alternating row striping for improved readability
- Right-aligned monospace columns for all numerical data
- Action column with icon buttons: View Details, Re-execute Trade, Export Data
- Loading state: Shimmer skeleton effect during data fetching
- Pagination controls at bottom with page size selector

### Status Indicators & Badges
- **Bot Status**: `rounded-full px-3 py-1` with pulsing dot animation for "Running"
- **Transaction Status**: Icon + text label combinations (Pending ⏳, Confirmed ✓, Failed ✗, Reverted ⚠️)
- **Network Health**: Traffic light system (Green/Yellow/Red) with hover tooltips explaining status
- **Balance Warnings**: Alert badges when MATIC balance falls below minimum required amount

### Contract Settings Page (New)
**Configuration Panel:**
- Dedicated page for contract management and deployment
- Contract address display with copy button and blockchain explorer link
- Deployment status indicator with connection test
- Configuration form fields: Gas limit, Slippage tolerance, Minimum profit threshold, Maximum trade size
- Auto-sign toggle: Enable/disable automatic transaction signing
- Wallet connection section showing connected address and balance
- Deploy/Redeploy contract button with progress indicator
- Configuration history log showing all setting changes with timestamps

## Icons

Use **Lucide React** icons:
- **Activity/Status**: `Activity`, `Zap`, `AlertCircle`, `CheckCircle`
- **Trading**: `TrendingUp`, `TrendingDown`, `DollarSign`, `ArrowRightLeft`
- **Actions**: `Play`, `Pause`, `StopCircle`, `RefreshCw`, `Settings`
- **Navigation**: `LayoutDashboard`, `ListOrdered`, `FileText`, `Sliders`

## Responsive Behavior

- **Desktop (lg:)**: Full multi-column layout with persistent sidebar, 3-column metric grids
- **Tablet (md:)**: Collapsible sidebar accessed via hamburger menu, 2-column grids
- **Mobile (base)**: Stacked single-column layout, horizontal scrolling tables with sticky first column, bottom navigation bar for primary actions

## Images

This is a data-intensive trading application. No decorative images or hero sections are needed. Focus remains on real-time data visualization, charts, and functional UI components. The visual interest comes from dynamic data displays, color-coded status indicators, and clean information architecture.