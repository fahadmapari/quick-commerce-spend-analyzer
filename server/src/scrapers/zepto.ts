import { Page } from 'playwright';
import { BaseScraper } from './base';
import { RawOrder, ServerMessage } from '../types';

const HOME_URL = 'https://www.zeptonow.com';
const ORDERS_URL = 'https://www.zeptonow.com/account/orders';
const MAX_SCROLL = 90;
const STABLE_THRESHOLD = 4;
const SCROLL_DELAY_MS = 800;
const LOAD_MORE_DELAY_MS = 1300;

export class ZeptoScraper extends BaseScraper {
  constructor(sessionId: string, onMessage: (msg: ServerMessage) => void) {
    super('zepto', sessionId, onMessage);
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    if (await page.$('a[aria-label="profile"][href="/account"]')) return true;
    return page.evaluate(() => {
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const p = JSON.parse(raw) as { state?: { user?: { mobileNumber?: unknown } } };
          return !!p?.state?.user?.mobileNumber;
        }
      } catch {}
      return false;
    });
  }

  private async extractOrders(page: Page): Promise<RawOrder[]> {
    return page.$$eval('a[href^="/order/"]', (links) => {
      const orders: { rawAmount: string; rawDate: string; orderId: string }[] = [];
      const seen: Record<string, true> = {};

      for (const link of links) {
        const href = link.getAttribute('href') ?? '';
        const orderId = href.replace('/order/', '').split('?')[0].split('/')[0];
        if (!orderId || seen[orderId]) continue;

        // Only delivered orders
        const statusEls = link.querySelectorAll('p[class*="text-heading6"]');
        let delivered = false;
        for (const el of statusEls) {
          if ((el.textContent ?? '').toLowerCase().includes('order delivered')) {
            delivered = true;
            break;
          }
        }
        if (!delivered) continue;

        // Amount
        const amountEls = link.querySelectorAll('p[class*="text-heading5"]');
        let rawAmount = '';
        for (const el of amountEls) {
          const t = (el.textContent ?? '').trim();
          if (t.includes('₹')) { rawAmount = t; break; }
        }
        if (!rawAmount) continue;

        // Date — strip "Placed at " prefix
        const dateEls = link.querySelectorAll('p[class*="text-body2"]');
        let rawDate = '';
        for (const el of dateEls) {
          const t = (el.textContent ?? '').trim();
          if (t.startsWith('Placed at')) {
            rawDate = t.replace(/^Placed at\s*/i, '').trim();
            break;
          }
        }
        if (!rawDate) continue;

        seen[orderId] = true;
        orders.push({ rawAmount, rawDate, orderId: `zepto:${orderId}` });
      }
      return orders;
    });
  }

  private async extractAccountIdentity(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const p = JSON.parse(raw) as { state?: { user?: { mobileNumber?: unknown; id?: unknown } } };
          const user = p?.state?.user;
          if (user?.mobileNumber) return String(user.mobileNumber).replace(/\D/g, '').slice(-10);
          if (user?.id) return String(user.id);
        }
      } catch {}
      return null;
    });
  }

  async run(): Promise<void> {
    await this.initialize();
    const page = this.page!;

    try {
      this.emitState('booting', 'Opening Zepto', HOME_URL);
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2000);

      this.emitState('checking_session', 'Checking your account');

      if (!(await this.isLoggedIn(page))) {
        // Click login button to open the login sheet
        const loginBtn = await page.$('button[aria-label="login"]');
        if (loginBtn) { await loginBtn.click(); await page.waitForTimeout(1000); }

        const phoneInput = await page
          .waitForSelector('input[type="tel"]', { state: 'visible', timeout: 12_000 })
          .catch(() => null);

        if (!phoneInput) {
          this.emitError('Phone input not found — Zepto UI may have changed.', true, true);
          return;
        }

        const phone = await this.waitForInput('awaiting_phone', 'Enter your Zepto mobile number');
        if (phone === '__CANCELLED__') return;

        await phoneInput.fill(phone);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);

        // Wait for OTP container
        const otpContainer = await page
          .waitForSelector('.gN7Pp', { state: 'visible', timeout: 20_000 })
          .catch(() => null);

        if (!otpContainer) {
          this.emitError('OTP screen did not appear.', true, true);
          return;
        }

        const otp = await this.waitForInput('awaiting_otp', 'Enter the OTP sent to your phone');
        if (otp === '__CANCELLED__') return;

        // Fill each digit into its own input
        const digitInputs = await page.$$('.gN7Pp input[inputmode="numeric"]');
        if (digitInputs.length >= 4) {
          for (let i = 0; i < Math.min(otp.length, digitInputs.length); i++) {
            await digitInputs[i].focus();
            await digitInputs[i].fill(otp[i]);
            await page.waitForTimeout(50);
          }
        } else {
          // Fallback: single OTP input
          const single = await page.$('input[inputmode="numeric"]');
          if (single) await single.fill(otp);
        }

        await page.waitForTimeout(2500);
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

        // Click "Load More" if present
        const loadMore = await page.$('button[aria-label="Load More"]');
        if (!loadMore) {
          // Text-based fallback
          const fallback = await page.getByRole('button', { name: /load more/i }).first().catch(() => null);
          if (fallback) { await fallback.click(); await page.waitForTimeout(LOAD_MORE_DELAY_MS); }
        } else {
          await loadMore.click();
          await page.waitForTimeout(LOAD_MORE_DELAY_MS);
        }

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
