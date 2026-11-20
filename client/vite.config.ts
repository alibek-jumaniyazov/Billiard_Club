import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { seoPlugin } from './vite-plugin-seo';
import { swPlugin } from './vite-plugin-sw';

/**
 * `npm run preview` production'dagi nginx xavfsizlik sarlavhalari (CSP, X-Frame-Options, …) bilan
 * ishlaydi. Ular yagona manbadan — deploy/nginx/billiardclub-security-headers.conf dan o'qiladi,
 * shuning uchun CSP'ni buzadigan o'zgarish deploy'dan oldin lokal ko'rinadi (Console: "Refused to …").
 * Dev serverga qo'yilmaydi: Vite dev o'zi ichki skript (React Refresh) qo'shadi.
 */
const NGINX_SECURITY_HEADERS = fileURLToPath(
  new URL('../deploy/nginx/billiardclub-security-headers.conf', import.meta.url),
);

const productionHeaders = (): Record<string, string> => {
  let conf: string;
  try {
    conf = readFileSync(NGINX_SECURITY_HEADERS, 'utf8');
  } catch {
    console.warn(`[preview] ${NGINX_SECURITY_HEADERS} topilmadi — xavfsizlik sarlavhalarisiz ishlaydi`);
    return {};
  }
  const headers: Record<string, string> = {};
  for (const [, name, value] of conf.matchAll(/^\s*add_header\s+([\w-]+)\s+"([^"]*)"/gm)) headers[name] = value;
  return headers;
};

export default defineConfig(({ isPreview }) => ({
  plugins: [react(), seoPlugin(), swPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  // /api proksisi server.proxy dan meros qilinadi
  preview: isPreview ? { headers: productionHeaders() } : undefined,
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Yirik kutubxonalar alohida, uzoq keshlanadigan bo'laklarga
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          i18n: ['i18next', 'react-i18next', 'dayjs'],
        },
      },
    },
  },
}));
