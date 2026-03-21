import { PLATFORM_CONFIGS } from '@/types/platform';
import { AutomationPhase } from '@/types/automation';
import { parseAmount, makeOrderId } from '@/lib/analytics';
import { PlatformProvider } from '../types';
import {
  AUTOMATION_BRIDGE_SCRIPT,
  buildAutomationCommandScript,
  getSessionResetScript,
} from './injectedScript';

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDateBlinkit(raw: string): Date {
  // Pattern: "DD Mon, H:MM am/pm" e.g. "16 Mar, 8:07 pm"
  const match = raw.match(/(\d{1,2})\s+(\w{3}),\s+(\d{1,2}):(\d{2})\s+(am|pm)/i);
  if (!match) return new Date();

  const [, day, mon, hours, minutes, ampm] = match;
  const month = MONTH_MAP[mon];
  if (month === undefined) return new Date();

  const year = new Date().getFullYear();
  let hour = parseInt(hours, 10);
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;

  const parsed = new Date(year, month, parseInt(day, 10), hour, parseInt(minutes, 10));

  // If the parsed date is in the future, subtract 1 year
  if (parsed > new Date()) {
    parsed.setFullYear(parsed.getFullYear() - 1);
  }

  return parsed;
}

const config = PLATFORM_CONFIGS.blinkit;

export const blinkitProvider: PlatformProvider = {
  id: 'blinkit',
  config,

  getAutomationBridgeScript() {
    return AUTOMATION_BRIDGE_SCRIPT;
  },

  buildCommandScript(command: object) {
    return buildAutomationCommandScript(command);
  },

  getSessionResetScript() {
    return getSessionResetScript(config.cookieDomain);
  },

  parseAmount,

  parseDate(raw: string): Date {
    return parseDateBlinkit(raw);
  },

  makeOrderId(rawDate: string, rawAmount: string): string {
    return makeOrderId('blinkit', rawDate, rawAmount);
  },

  getPhaseTitle(phase: AutomationPhase): string {
    switch (phase) {
      case 'booting': return 'Connecting';
      case 'checking_session': return 'Checking Session';
      case 'requesting_location_permission': return 'Location Required';
      case 'awaiting_phone': return 'Login Required';
      case 'awaiting_otp': return 'Verify OTP';
      case 'awaiting_manual_location': return 'Select Location';
      case 'navigating_to_orders': return 'Opening Orders';
      case 'extracting': return 'Extracting Orders';
      case 'success': return 'Sync Complete';
      case 'error': return 'Sync Error';
      default: return 'Syncing';
    }
  },

  getPhaseSubtitle(
    phase: AutomationPhase,
    detail: string | null,
    syncProgress: number | null,
    syncResult: string | null,
    errorMessage: string | null
  ): string {
    if (phase === 'success' && syncResult) return syncResult;
    if (phase === 'error' && errorMessage) return errorMessage;
    if (phase === 'extracting' && syncProgress != null) {
      return `Found ${syncProgress} orders so far...`;
    }
    if (detail) return detail;

    switch (phase) {
      case 'booting': return 'Opening Blinkit...';
      case 'checking_session': return 'Checking your account...';
      case 'requesting_location_permission': return 'Please allow location or select manually';
      case 'awaiting_phone': return 'Enter your mobile number to continue';
      case 'awaiting_otp': return 'Enter the OTP sent to your phone';
      case 'awaiting_manual_location': return 'Please select your delivery location';
      case 'navigating_to_orders': return 'Opening order history...';
      case 'extracting': return 'Scanning your orders...';
      case 'success': return 'All done!';
      case 'error': return 'Something went wrong';
      default: return '';
    }
  },
};
