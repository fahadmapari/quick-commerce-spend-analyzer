import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ServerMessage, AutomationPhase } from '../types';
import { loadSession, saveSession } from '../session/manager';

// Mumbai coordinates — good enough to pass Blinkit's location gate
const DEFAULT_GEOLOCATION = { latitude: 19.076, longitude: 72.8777 };

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;

  private cancelled = false;
  private pendingInputResolve: ((v: string) => void) | null = null;

  constructor(
    protected readonly platform: string,
    protected readonly sessionId: string,
    private readonly onMessage: (msg: ServerMessage) => void,
  ) {}

  protected emit(msg: ServerMessage): void {
    this.onMessage(msg);
  }

  protected emitState(phase: AutomationPhase, detail?: string, url?: string): void {
    this.emit({ type: 'AUTOMATION_STATE', phase, detail, url });
  }

  protected emitError(message: string, recoverable = true, requiresUserAction = false): void {
    this.emit({ type: 'AUTOMATION_ERROR', message, recoverable, requiresUserAction });
  }

  /** Called by the server when the user submits phone/OTP input. */
  public receiveInput(value: string): void {
    this.pendingInputResolve?.(value);
    this.pendingInputResolve = null;
  }

  public cancel(): void {
    this.cancelled = true;
    this.pendingInputResolve?.('__CANCELLED__');
    this.pendingInputResolve = null;
  }

  protected isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Emits a phase that requires user input, then waits until the app
   * calls receiveInput(). Returns '__CANCELLED__' if the session ends.
   */
  protected waitForInput(phase: AutomationPhase, detail: string): Promise<string> {
    this.emitState(phase, detail);
    return new Promise((resolve) => {
      this.pendingInputResolve = resolve;
    });
  }

  protected async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: MOBILE_USER_AGENT,
      geolocation: DEFAULT_GEOLOCATION,
      permissions: ['geolocation'],
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    const saved = loadSession(this.platform, this.sessionId);
    if (saved && saved.length > 0) {
      await this.context.addCookies(saved as Parameters<BrowserContext['addCookies']>[0]);
    }

    this.page = await this.context.newPage();
  }

  protected async persistSession(): Promise<void> {
    if (!this.context) return;
    const cookies = await this.context.cookies();
    saveSession(this.platform, this.sessionId, cookies);
  }

  protected async cleanup(): Promise<void> {
    try {
      await this.persistSession();
    } catch {}
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  abstract run(): Promise<void>;
}
