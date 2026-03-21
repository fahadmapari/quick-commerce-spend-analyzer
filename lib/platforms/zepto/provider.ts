import { PLATFORM_CONFIGS } from '@/types/platform';
import { AutomationPhase } from '@/types/automation';
import { parseAmount, makeOrderId } from '@/lib/analytics';
import { PlatformProvider } from '../types';
import {
  AUTOMATION_BRIDGE_SCRIPT,
  buildAutomationCommandScript,
  getSessionResetScript,
} from './injectedScript';

/**
 * Parse Zepto date format: "20th Feb 2026, 07:09 pm"
 * Format: DDth Mon YYYY, HH:MM am/pm (ordinal suffix on day, year included)
 */
const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDateZepto(raw: string): Date {
  // Match: "20th Feb 2026, 07:09 pm" — ordinal suffix (st/nd/rd/th) is optional
  const match = raw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w{3})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return new Date();

  const [, day, mon, year, hours, minutes, ampm] = match;
  const month = MONTH_MAP[mon];
  if (month === undefined) return new Date();

  let hour = parseInt(hours, 10);
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;

  return new Date(parseInt(year, 10), month, parseInt(day, 10), hour, parseInt(minutes, 10));
}

const config = PLATFORM_CONFIGS.zepto;

export const zeptoProvider: PlatformProvider = {
  id: 'zepto',
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
    return parseDateZepto(raw);
  },

  makeOrderId(rawDate: string, rawAmount: string): string {
    return makeOrderId('zepto', rawDate, rawAmount);
  },

  getPhaseTitle(phase: AutomationPhase): string {
    switch (phase) {
      case 'booting': return 'Connecting';
      case 'checking_session': return 'Checking Session';
      case 'awaiting_phone': return 'Login Required';
      case 'awaiting_otp': return 'Verify OTP';
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
      case 'booting': return 'Opening Zepto...';
      case 'checking_session': return 'Checking your account...';
      case 'awaiting_phone': return 'Enter your mobile number to continue';
      case 'awaiting_otp': return 'Enter the OTP sent to your phone';
      case 'navigating_to_orders': return 'Opening order history...';
      case 'extracting': return 'Scanning your orders...';
      case 'success': return 'All done!';
      case 'error': return 'Something went wrong';
      default: return '';
    }
  },
};
