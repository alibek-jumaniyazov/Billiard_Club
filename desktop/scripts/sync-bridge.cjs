'use strict';

/**
 * Chiroq markazi dvigatelini (bridge/lib) dastur ichiga ko'chiradi: desktop/bridge-lib/.
 *
 * Nega nusxa: electron-builder faqat desktop/ papkasi ichidagi fayllarni
 * yig'adi, ASAR yaxlitlik tekshiruvi esa faqat app.asar ichidagi kodni
 * himoya qiladi. Dvigatel tashqarida (resources/ da) tursa, uni diskda
 * o'zgartirib asosiy jarayonda begona kod ishga tushirish mumkin bo'lardi.
 *
 * Har yig'ishda papka TOZALANIB qayta yoziladi — eskirgan fayl qolib ketmasin.
 * bridge-lib/ git'ga kirmaydi (manba — bridge/lib).
 */

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', '..', 'bridge', 'lib');
const target = path.resolve(__dirname, '..', 'bridge-lib');

if (!fs.existsSync(path.join(source, 'hub.js'))) {
  console.error(`bridge/lib topilmadi: ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });

let copied = 0;
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      fs.copyFileSync(src, dst);
      copied += 1;
    }
  }
};
copyDir(source, target);
console.log(`bridge-lib: ${copied} ta fayl ko'chirildi`);
