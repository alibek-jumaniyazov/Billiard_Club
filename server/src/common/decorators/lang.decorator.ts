import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type Language = 'uz' | 'ru';

export const getRequestLang = (request: { headers: Record<string, unknown> }): Language => {
  const raw = String(request.headers['x-lang'] || '').toLowerCase();
  return raw === 'ru' ? 'ru' : 'uz';
};

/** Klient tili (X-Lang header, default: uz) */
export const Lang = createParamDecorator((_data: unknown, ctx: ExecutionContext): Language => {
  return getRequestLang(ctx.switchToHttp().getRequest());
});
