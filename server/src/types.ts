export type Platform = 'blinkit' | 'zepto';

export type AutomationPhase =
  | 'booting'
  | 'checking_session'
  | 'requesting_location_permission'
  | 'awaiting_phone'
  | 'awaiting_otp'
  | 'awaiting_manual_location'
  | 'navigating_to_orders'
  | 'extracting'
  | 'success'
  | 'error';

export interface RawOrder {
  rawAmount: string;
  rawDate: string;
  orderId?: string;
}

// Server → Client (React Native app)
export type ServerMessage =
  | { type: 'AUTOMATION_STATE'; phase: AutomationPhase; detail?: string; url?: string }
  | { type: 'SCROLL_PROGRESS'; count: number }
  | { type: 'ORDERS_EXTRACTED'; orders: RawOrder[] }
  | { type: 'AUTOMATION_ERROR'; message: string; recoverable?: boolean; requiresUserAction?: boolean }
  | { type: 'ACCOUNT_IDENTITY'; identity: string | null }
  | { type: 'LOCATION_PERMISSION_REQUIRED' }
  | { type: 'LOCATION_MANUAL_REQUIRED'; reason?: string };

// Client (React Native app) → Server
export type ClientMessage =
  | { type: 'START_SCRAPE'; platform: Platform; sessionId: string }
  | { type: 'SUBMIT_INPUT'; value: string }
  | { type: 'CANCEL' };
