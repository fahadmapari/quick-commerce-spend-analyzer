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
}

export type WebViewBridgeMessage =
  | {
      type: 'AUTOMATION_STATE';
      phase: AutomationPhase;
      detail?: string;
      url?: string;
    }
  | {
      type: 'LOCATION_PERMISSION_REQUIRED';
    }
  | {
      type: 'LOCATION_MANUAL_REQUIRED';
      reason?: string;
    }
  | {
      type: 'SCROLL_PROGRESS';
      count: number;
    }
  | {
      type: 'ORDERS_EXTRACTED';
      orders: RawOrder[];
    }
  | {
      type: 'AUTOMATION_ERROR';
      message: string;
      recoverable?: boolean;
      requiresUserAction?: boolean;
    }
  | {
      type: 'ACCOUNT_IDENTITY';
      identity: string | null;
    };

