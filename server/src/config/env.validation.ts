import * as Joi from 'joi';

/**
 * Muhit o'zgaruvchilari sxemasi — server noto'g'ri konfiguratsiya bilan
 * ishga tushmasligi uchun (masalan JWT_SECRET yo'q bo'lsa darhol yiqiladi,
 * birinchi login paytida emas).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  FRONTEND_URL: Joi.string().default('http://localhost:5173'),

  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  TELEGRAM_CHAT_ID: Joi.string().allow('').optional(),

  SUPERADMIN_USERNAME: Joi.string().optional(),
  SUPERADMIN_PASSWORD: Joi.string().optional(),
  SEED_DEMO_CLUB: Joi.string().optional(),
});
