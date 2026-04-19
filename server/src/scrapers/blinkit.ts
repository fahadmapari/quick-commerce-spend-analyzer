import { Page } from 'playwright';
import { BaseScraper } from './base';
import { RawOrder, ServerMessage } from '../types';

const HOME_URL = 'https://blinkit.com';
const ORDERS_URL = 'https://blinkit.com/account/orders';
const MAX_SCROLL = 90;
const STABLE_THRESHOLD = 4;
const SCROLL_DELAY_MS = 700;

export class BlinkitScraper extends BaseScraper {
  constructor(sessionId: string, onMessage: (msg: ServerMessage) => void) {
    super('blinkit', sessionId, onMessage);
  }

  private async dismissDownloadModal(page: Page): Promise<void> {
    const continueBtn = await page.$('[class*="DownloadAppModal__ContinueLink"]');
    if (continueBtn) { await continueBtn.click(); await page.waitForTimeout(600); return; }

    const closeBtn = await page.$('[class*="DownloadAppModal__BackButtonIcon"]');
    if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(600); }
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    if (await page.$('[class*="UserAccountLogin__HeaderStrip"]')) return true;
    const text = await page.textContent('body').catch(() => '');
    return (text ?? '').toLowerCase().includes('logout');
  }

  private async extractOrders(page: Page): Promise<RawOrder[]> {
    return page.$$eval('[data-pf="reset"]', (containers) => {
      const orders: { rawAmount: string; rawDate: string }[] = [];
      const seen: Record<string, true> = {};

      for (const container of containers) {
        if (
          !container.classList.contains('tw-flex') ||
          !container.classList.contains('tw-gap-1')
        ) continue;

        const card = container.closest('[role="button"]');
        if (!card || !(card.textContent ?? '').toLowerCase().includes('arrived')) continue;

        const priceEls = container.querySelectorAll('.tw-text-200.tw-font-regular');
        if (priceEls.length < 2) continue;

        const rawAmount = (priceEls[0].textContent ?? '').trim();
        const rawDate = (priceEls[priceEls.length - 1].textContent ?? '').trim();

        if (!rawAmount.startsWith('₹') || !rawDate.includes(':')) continue;

        const key = `${rawAmount}::${rawDate}`;
        if (seen[key]) continue;
        seen[key] = true;
        orders.push({ rawAmount, rawDate });
      }
      return orders;
    });
  }

  private async extractAccountIdentity(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw) as { phone?: unknown; id?: unknown };
          if (u.phone) return String(u.phone).replace(/\D/g, '').slice(-10);
          if (u.id) return String(u.id);
        }
      } catch {}
      return null;
    });
  }

  async run(): Promise<void> {
    await this.initialize();
    const page = this.page!;

    try {
      this.emitState('booting', 'Opening Blinkit', HOME_URL);
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(1500);
      await this.dismissDownloadModal(page);

      this.emitState('checking_session', 'Checking your account');

      if (!(await this.isLoggedIn(page))) {
        // Open account / login sheet
        const accountBtn = await page.$('[class*="ProfileButton__Container"]');
        if (accountBtn) { await accountBtn.click(); await page.waitForTimeout(1000); }

        const phoneInput = await page
          .waitForSelector('[data-test-id="phone-no-text-box"]', { state: 'visible', timeout: 12_000 })
          .catch(() => null);

        if (!phoneInput) {
          this.emitError('Phone input not found — Blinkit UI may have changed.', true, true);
          return;
        }

        const phone = await this.waitForInput('awaiting_phone', 'Enter your Blinkit mobile number');
        if (phone === '__CANCELLED__') return;

        await phoneInput.fill(phone);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);

        const otpInput = await page
          .waitForSelector('[data-test-id="otp-text-box"]', { state: 'visible', timeout: 20_000 })
          .catch(() => null);

        if (!otpInput) {
          this.emitError('OTP screen did not appear.', true, true);
          return;
        }

        const otp = await this.waitForInput('awaiting_otp', 'Enter the OTP sent to your phone');
        if (otp === '__CANCELLED__') return;

        await otpInput.fill(otp);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2500);
      }

      // Location modal — mock geolocation is already set on the context, so just
      // click "Use my location" if the modal appears. Playwright will grant it immediately.
      const locationModal = await page
        .$('[class*="GetLocationModal__GetLocationContainer"]')
        .catch(() => null);
      if (locationModal) {
        this.emitState('requesting_location_permission', 'Setting up delivery location');
        const useMyLocation = await page.$('[class*="GetLocationModal"] button');
        if (useMyLocation) { await useMyLocation.click(); await page.waitForTimeout(1500); }
      }

      this.emitState('navigating_to_orders', 'Opening order history', ORDERS_URL);
      await page.goto(ORDERS_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2000);

      this.emitState('extracting', 'Scanning orders');

      let scrollAttempts = 0;
      let stableCount = 0;
      let lastCount = 0;

      while (scrollAttempts < MAX_SCROLL) {
        if (this.isCancelled()) return;

        const orders = await this.extractOrders(page);

        if (orders.length === lastCount) {
          stableCount++;
        } else {
          stableCount = 0;
          lastCount = orders.length;
        }

        this.emit({ type: 'SCROLL_PROGRESS', count: orders.length });
        this.emitState('extracting', `Scanning ${orders.length} orders`);

        if (stableCount >= STABLE_THRESHOLD) break;

        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
        scrollAttempts++;
        await page.waitForTimeout(SCROLL_DELAY_MS);
      }

      const finalOrders = await this.extractOrders(page);
      const identity = await this.extractAccountIdentity(page);

      await this.persistSession();
      this.emit({ type: 'ACCOUNT_IDENTITY', identity });
      this.emit({ type: 'ORDERS_EXTRACTED', orders: finalOrders });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scraping failed';
      this.emitError(msg, true, false);
    } finally {
      await this.cleanup();
    }
  }
}
