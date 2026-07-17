import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Telegram xabarnomalari — platforma egasiga (sizga) yangi klub
 * qo'shilganda / obuna uzaytirilganda xabar yuboradi.
 * Sozlanmagan bo'lsa (token yo'q) — jimgina o'tkazib yuboriladi.
 * Xatolar asosiy oqimni to'xtatmaydi (fire-and-forget).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly config: ConfigService) {}

  async notify(text: string): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      this.logger.warn('Telegram sozlanmagan (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — xabar yuborilmadi');
      return;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        this.logger.error(`Telegram API xatosi: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Telegram xabari yuborilmadi: ${(err as Error).message}`);
    }
  }
}
