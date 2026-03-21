import { PlatformId, PlatformConfig } from '@/types/platform';
import { AutomationPhase } from '@/types/automation';

export interface PlatformProvider {
  id: PlatformId;
  config: PlatformConfig;

  /** The full injected JS string for WebView automation */
  getAutomationBridgeScript(): string;

  /** Build a JS snippet that sends a command to the injected automation */
  buildCommandScript(command: object): string;

  /** JS snippet to clear all web session data for this platform */
  getSessionResetScript(): string;

  /** Parse a raw amount string (e.g. "₹1,678") into an integer */
  parseAmount(raw: string): number;

  /** Parse a raw date string into a Date object */
  parseDate(raw: string): Date;

  /** Build a dedup-safe order ID */
  makeOrderId(rawDate: string, rawAmount: string): string;

  /** Human-readable title for a given automation phase */
  getPhaseTitle(phase: AutomationPhase): string;

  /** Human-readable subtitle for a given automation phase */
  getPhaseSubtitle(
    phase: AutomationPhase,
    detail: string | null,
    syncProgress: number | null,
    syncResult: string | null,
    errorMessage: string | null
  ): string;
}
