
```typescript
import { EventEmitter } from 'events';

export type TradeEvent = 'Fill' | 'Reject' | 'Error' | 'Quote' | 'BalanceUpdate';

export interface TradeEventData {
  orderId: string;
  timestamp: number;
  [key: string]: any;
}

export class CoreEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many subscribers
  }

  emitTrade(event: TradeEvent, data: TradeEventData): void {
    this.emit(event, data);
    this.emit('*', event, data); // Wildcard listener
  }

  onTrade(event: TradeEvent | '*', handler: (data: TradeEventData) => void): void {
    this.on(event, handler);
  }

  offTrade(event: TradeEvent | '*', handler: (data: TradeEventData) => void): void {
    this.off(event, handler);
  }
}

export const eventBus = new CoreEventBus();
```
