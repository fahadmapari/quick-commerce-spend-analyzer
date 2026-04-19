import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { BlinkitScraper } from './scrapers/blinkit';
import { ZeptoScraper } from './scrapers/zepto';
import { ClientMessage } from './types';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  let activeScraper: BlinkitScraper | ZeptoScraper | null = null;

  const send = (msg: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  ws.on('message', async (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (msg.type === 'START_SCRAPE') {
      // Cancel any in-flight scrape before starting a new one
      activeScraper?.cancel();
      activeScraper = null;

      const { platform, sessionId } = msg;

      if (platform === 'blinkit') {
        activeScraper = new BlinkitScraper(sessionId, send);
      } else if (platform === 'zepto') {
        activeScraper = new ZeptoScraper(sessionId, send);
      } else {
        send({
          type: 'AUTOMATION_ERROR',
          message: `Unknown platform: ${platform}`,
          recoverable: false,
        });
        return;
      }

      activeScraper.run().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unexpected server error';
        send({ type: 'AUTOMATION_ERROR', message, recoverable: true });
      });

      return;
    }

    if (msg.type === 'SUBMIT_INPUT') {
      activeScraper?.receiveInput(msg.value);
      return;
    }

    if (msg.type === 'CANCEL') {
      activeScraper?.cancel();
      activeScraper = null;
      return;
    }
  });

  const teardown = () => {
    activeScraper?.cancel();
    activeScraper = null;
  };

  ws.on('close', teardown);
  ws.on('error', teardown);
});

httpServer.listen(PORT, () => {
  console.log(`Scraper server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
