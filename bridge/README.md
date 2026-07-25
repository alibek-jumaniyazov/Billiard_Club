# Billiard Club — Bridge agenti (chiroq boshqaruvi)

Bu kichik dastur **klubning o'z tarmog'ida** ishlaydi va bulutdagi server (`billiardclub.uz`) bilan
lokal relaylar (Shelly, Tasmota va h.k.) o'rtasida ko'prik vazifasini bajaradi.

## Nega kerak?

Server internetda, relaylar esa klubning ichki tarmog'ida (`192.168.x.x`) — router ortida turadi.
Bulutdagi server ularga to'g'ridan-to'g'ri murojaat qila olmaydi.

Bridge agenti muammoni hal qiladi: **u serverga o'zi chiqadi** (oddiy chiquvchi HTTPS so'rov).
Shu sababli:

- routerni sozlash **shart emas**,
- port forwarding **shart emas**,
- statik "oq" IP **shart emas**,
- klub tarmog'i tashqaridan ochilmaydi — xavfsiz.

Ish sxemasi:

```
 [ billiardclub.uz ]  <--- HTTPS (agent o'zi so'raydi) ---  [ Bridge agenti ]  ---> [ Relay 192.168.1.51 ]
        server                                                klubdagi kompyuter          [ Relay 192.168.1.52 ]
```

Agent har doim serverdan "qaysi stolda chiroq yoniq bo'lishi kerak" degan ro'yxatni oladi
(o'zgarish bo'lmasa so'rov 25 soniya "osilib" turadi — bu tarmoqni band qilmaydi),
o'zgargan relaylargagina buyruq yuboradi va natijani serverga qaytaradi.

---

## 1. Talablar

- **Node.js 18 yoki undan yuqori** (agentda npm paketlar YO'Q — hech narsa o'rnatish shart emas).
- Doim yoqiq turadigan qurilma: klubdagi kassa kompyuteri, mini-PC yoki Raspberry Pi.
- Bu qurilma relaylar bilan **bir tarmoqda** bo'lishi (ya'ni `192.168.1.51` ga ping ketishi) kerak.
- Internetga chiqish (faqat chiquvchi 443-port).

---

## 2. Tokenni olish

1. Saytga klub egasi (admin) sifatida kiring.
2. **Sozlamalar -> Chiroq boshqaruvi** bo'limiga o'ting.
3. Rejimni **Bridge** qilib tanlang va **"Token yaratish"** tugmasini bosing.
4. Token **faqat bir marta** ko'rsatiladi — darhol nusxalab oling.
   Yo'qotsangiz, eskisini bekor qilib yangisini yaratasiz.

---

## 3. Windows da o'rnatish

### 3.1. Node.js o'rnatish

1. https://nodejs.org saytiga kiring, **LTS** versiyasini yuklab oling (`.msi`).
2. O'rnatuvchini ishga tushiring — barcha bosqichlarda **Next** (standart sozlamalar yetarli).
3. Tekshirish: **Win + R** -> `cmd` -> Enter, so'ng yozing:

   ```
   node -v
   ```

   `v18.x` yoki undan yuqori chiqsa — hammasi joyida.

### 3.2. Papkani joylashtirish

1. `bridge` papkasini kompyuterga nusxalang, masalan: `C:\billiardclub-bridge`
   (ichida `agent.js`, `package.json`, `.env.example` bo'lishi kerak).
2. `.env.example` faylini o'sha papkaning ichida nusxalab, nomini **`.env`** ga o'zgartiring.

   > Eslatma: Windows kengaytmalarni yashirishi mumkin. Fayl nomi `.env.txt` emas, aynan `.env`
   > bo'lishi shart. Buni ta'minlash uchun `cmd` da:
   > ```
   > cd C:\billiardclub-bridge
   > copy .env.example .env
   > notepad .env
   > ```

3. `.env` faylini to'ldiring:

   ```
   SERVER_URL=https://billiardclub.uz
   BRIDGE_TOKEN=saytdan olgan tokeningiz
   FORCE_SYNC_MS=60000
   LOG_LEVEL=info
   REQUEST_TIMEOUT_MS=5000
   ```

### 3.3. Qo'lda sinab ko'rish

`cmd` yoki PowerShell da:

```
cd C:\billiardclub-bridge
npm start
```

(`npm start` ishlamasa `node agent.js` deb ham ishga tushirsa bo'ladi — natija bir xil.)

To'g'ri ishlayotgan bo'lsa quyidagiga o'xshash loglar chiqadi:

```
[2026-07-24 18:30:05] [INFO] Billiard Club bridge agenti v1.0.0 ishga tushdi (Node 20.11.1)
[2026-07-24 18:30:05] [INFO] Server: https://billiardclub.uz | Token: A7f2...9dQx
[2026-07-24 18:30:06] [INFO] Yangi holat versiyasi: 9c1a...
[2026-07-24 18:30:06] [INFO] 4 ta qurilmaga buyruq yuborilmoqda (majburiy sinxronizatsiya)
[2026-07-24 18:30:06] [INFO] stol #1: chiroq YONDI (shelly_gen1)
```

Saytdagi **Sozlamalar -> Chiroq boshqaruvi** sahifasida bridge holati **"onlayn"** ga o'zgarishi kerak.
To'xtatish: `Ctrl + C`.

### 3.4. Avtomatik ishga tushirish — 1-usul: Vazifalar rejalashtiruvchisi (oson)

1. **Win + R** -> `taskschd.msc` -> Enter.
2. O'ng paneldan **"Create Task..."** (Vazifa yaratish) ni tanlang (Basic Task emas!).
3. **General** yorlig'i:
   - Name: `Billiard Club Bridge`
   - **"Run whether user is logged on or not"** ni belgilang (foydalanuvchi kirmagan bo'lsa ham ishlaydi).
   - **"Run with highest privileges"** ni belgilang.
4. **Triggers** yorlig'i -> **New...**:
   - Begin the task: **At startup** (kompyuter yoqilganda).
   - Advanced settings: **Delay task for: 30 seconds** (tarmoq ko'tarilishini kutish uchun).
   - OK.
5. **Actions** yorlig'i -> **New...**:
   - Action: **Start a program**
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `agent.js`
   - Start in: `C:\billiardclub-bridge`
   - OK.
6. **Conditions** yorlig'i:
   - **"Start the task only if the computer is on AC power"** belgisini **olib tashlang**
     (noutbukda batareyada ham ishlashi uchun).
7. **Settings** yorlig'i:
   - **"If the task fails, restart every:"** -> `1 minute`, **Attempt to restart up to:** `999` times.
   - **"Stop the task if it runs longer than"** belgisini **olib tashlang** (agent doim ishlashi kerak).
8. OK -> Windows parolingizni so'raydi, kiriting.
9. Vazifalar ro'yxatidan `Billiard Club Bridge` ni tanlab, o'ng tugma -> **Run** bilan darhol sinab ko'ring.

> Loglarni ko'rish uchun bu usulda oyna ochilmaydi. Kerak bo'lsa `Actions` da argumentni
> quyidagicha o'zgartiring: `agent.js >> C:\billiardclub-bridge\agent.log 2>&1`
> (bu holda Program/script sifatida `cmd.exe`, argument sifatida
> `/c node agent.js >> agent.log 2>&1` yozilishi kerak).

### 3.5. Avtomatik ishga tushirish — 2-usul: NSSM orqali Windows xizmati (ishonchliroq)

NSSM — dasturni haqiqiy Windows xizmatiga (service) aylantiruvchi bepul vosita.

1. https://nssm.cc/download dan `nssm` arxivini yuklab oling, ochib `win64\nssm.exe` ni
   `C:\billiardclub-bridge` ichiga nusxalang.
2. **Administrator nomidan** `cmd` ochib:

   ```
   cd C:\billiardclub-bridge
   nssm install BilliardClubBridge
   ```

3. Ochilgan oynada:
   - **Application** yorlig'i:
     - Path: `C:\Program Files\nodejs\node.exe`
     - Startup directory: `C:\billiardclub-bridge`
     - Arguments: `agent.js`
   - **Details** yorlig'i: Display name: `Billiard Club Bridge`
   - **I/O** yorlig'i (loglarni faylga yozish uchun):
     - Output (stdout): `C:\billiardclub-bridge\agent.log`
     - Error (stderr): `C:\billiardclub-bridge\agent.log`
   - **Exit actions** yorlig'i: Restart -> Delay: `5000` ms
   - **Install service** tugmasini bosing.
4. Xizmatni boshqarish:

   ```
   nssm start BilliardClubBridge     :: ishga tushirish
   nssm status BilliardClubBridge    :: holatini ko'rish
   nssm restart BilliardClubBridge   :: qayta ishga tushirish
   nssm stop BilliardClubBridge      :: to'xtatish
   nssm remove BilliardClubBridge confirm   :: o'chirish
   ```

5. Loglarni ko'rish: `C:\billiardclub-bridge\agent.log` faylini oching
   (yoki `powershell Get-Content agent.log -Wait -Tail 50`).

> `.env` faylini o'zgartirgandan keyin xizmatni **albatta qayta ishga tushiring**
> (`nssm restart BilliardClubBridge`).

---

## 4. Linux / Raspberry Pi da o'rnatish

### 4.1. Node.js o'rnatish

Raspberry Pi OS / Debian / Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v      # v20.x chiqishi kerak
```

### 4.2. Fayllarni joylashtirish

```bash
sudo mkdir -p /opt/billiardclub-bridge
sudo cp -r bridge/* /opt/billiardclub-bridge/
cd /opt/billiardclub-bridge
sudo cp .env.example .env
sudo nano .env          # SERVER_URL va BRIDGE_TOKEN ni to'ldiring
sudo chown -R pi:pi /opt/billiardclub-bridge
chmod 600 /opt/billiardclub-bridge/.env    # token faqat egasiga ko'rinsin
```

Sinab ko'rish:

```bash
cd /opt/billiardclub-bridge && node agent.js
```

Loglar chiqsa `Ctrl + C` bilan to'xtating va xizmat qilib o'rnatishga o'ting.

### 4.3. systemd xizmati

`billiardclub-bridge.service` fayli shu papkada tayyor turibdi. To'liq matni:

```ini
[Unit]
Description=Billiard Club bridge agenti (chiroq boshqaruvi)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/billiardclub-bridge
ExecStart=/usr/bin/node /opt/billiardclub-bridge/agent.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=billiardclub-bridge
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

O'rnatish va yoqish:

```bash
sudo cp /opt/billiardclub-bridge/billiardclub-bridge.service /etc/systemd/system/
sudo nano /etc/systemd/system/billiardclub-bridge.service   # User= va yo'llarni tekshiring
sudo systemctl daemon-reload
sudo systemctl enable billiardclub-bridge     # kompyuter yonganda avtomatik ishga tushsin
sudo systemctl start billiardclub-bridge
```

Boshqarish buyruqlari:

```bash
sudo systemctl status billiardclub-bridge     # holati
sudo journalctl -u billiardclub-bridge -f     # jonli loglar
sudo systemctl restart billiardclub-bridge    # .env o'zgartirilgandan keyin
sudo systemctl stop billiardclub-bridge
```

`node` boshqa yo'lda bo'lsa (`which node` bilan tekshiring), `ExecStart` dagi
`/usr/bin/node` ni o'sha yo'lga almashtiring.

---

## 5. Sozlamalar (.env)

| O'zgaruvchi          | Standart                  | Tavsif                                                                 |
|----------------------|---------------------------|------------------------------------------------------------------------|
| `SERVER_URL`         | — (majburiy)              | Server manzili, masalan `https://billiardclub.uz`                       |
| `BRIDGE_TOKEN`       | — (majburiy)              | Klub sozlamalarida yaratilgan token                                     |
| `FORCE_SYNC_MS`      | `60000`                   | Majburiy to'liq qayta qo'llash oralig'i (ms). Server qiymati ustun turadi |
| `LOG_LEVEL`          | `info`                    | `info` yoki `debug` (debug — chaqirilgan URL lar ham yoziladi)          |
| `REQUEST_TIMEOUT_MS` | `5000`                    | Serverga so'rov timeouti (relaylarga buyruq timeouti — 3000 ms, qat'iy) |

Muhit o'zgaruvchilari `.env` fayldan ustun turadi (systemd `Environment=` yoki
Windows tizim o'zgaruvchilari orqali berish mumkin).

---

## 6. Qo'llab-quvvatlanadigan relaylar

Qurilma turi va IP manzili **saytdagi stol sozlamalarida** kiritiladi, agentda emas.

| Drayver        | Yuboriladigan so'rov                                  |
|----------------|--------------------------------------------------------|
| `shelly_gen1`  | `http://{host}/relay/{kanal}?turn=on\|off`             |
| `shelly_gen2`  | `http://{host}/rpc/Switch.Set?id={kanal}&on=true\|false`|
| `tasmota`      | `http://{host}/cm?cmnd=Power{kanal+1}%20ON\|OFF`        |
| `http`         | Sizning `onUrl` / `offUrl` shablonlaringiz              |

- **`http` shablonlarida** `{channel}` (kanal raqami) va `{state}` (`on` / `off`) o'rinbosarlari ishlaydi.
- **Teskari (inverted)** belgisi — NC (normally closed) relaylar uchun: buyruq teskari yuboriladi.
- **Login/parol** kerak bo'lsa (Shelly parolli rejimi) — `Authorization: Basic` sarlavhasi orqali
  yuboriladi, parol URL manzilida ochiq ketmaydi.

---

## 7. Diagnostika

### "Bridge offline" ko'rinmoqda (saytda)

Tartib bilan tekshiring:

1. **Agent umuman ishlayaptimi?**
   - Windows: Task Manager -> Details -> `node.exe` bormi. NSSM bilan: `nssm status BilliardClubBridge`.
   - Linux: `sudo systemctl status billiardclub-bridge`.
2. **Loglarda nima yozilgan?**
   - Windows: `agent.log` fayli. Linux: `sudo journalctl -u billiardclub-bridge -n 50`.
3. **`BRIDGE_TOKEN noto'g'ri yoki bekor qilingan (401/403)`** —
   token xato yoki saytda yangisi yaratilgan. Saytdan yangi token oling va `.env` ni yangilang,
   so'ng xizmatni qayta ishga tushiring.
4. **`timeout (javob kelmadi)` yoki `ENOTFOUND` / `ECONNREFUSED`** — internet yoki DNS muammosi:
   ```bash
   ping billiardclub.uz
   curl -I https://billiardclub.uz
   ```
   Windows da: `ping billiardclub.uz` va brauzerda saytni ochib ko'ring.
5. **`SERVER_URL` xato yozilgan** — oxirida `/` yoki `/api` bo'lmasin.
   To'g'risi: `https://billiardclub.uz`.
6. **Antivirus / korporativ proksi** chiquvchi so'rovni bloklayotgan bo'lishi mumkin —
   `node.exe` ga ruxsat bering.
7. **`.env` fayli o'qilmayapti** — fayl `agent.js` bilan **bir papkada** va nomi aynan `.env`
   bo'lishi kerak (`.env.txt` emas). Tekshirish: `LOG_LEVEL=debug` qo'yib ishga tushiring —
   banner logda `Server:` va `Token:` qiymatlari to'g'ri ko'rinishi kerak.

### Relay javob bermayapti (logda `stol #N: xato — ...`)

1. **`timeout (javob kelmadi)`** — relay o'chgan, IP o'zgargan yoki boshqa tarmoqda:
   ```bash
   ping 192.168.1.51
   ```
   Javob bo'lmasa — relayning quvvati va Wi-Fi ulanishini tekshiring.
2. **IP o'zgarib ketgan** — routerda relay uchun **statik IP (DHCP reservation)** qilib qo'ying,
   aks holda har qayta yonishda IP almashib, chiroq boshqarilmay qoladi.
3. **`HTTP 401`** — relayda parol yoqilgan. Saytdagi stol sozlamalarida `login:parol` ni kiriting.
4. **`HTTP 404`** — drayver noto'g'ri tanlangan (Gen1 o'rniga Gen2 va aksincha) yoki kanal raqami xato.
   Shelly Gen1: `http://IP/relay/0` brauzerda ochilishi kerak.
   Shelly Gen2: `http://IP/rpc/Switch.GetStatus?id=0`.
   Tasmota: `http://IP/cm?cmnd=Power1`.
5. **`host formati noto'g'ri`** — saytda host maydoniga `http://` yoki `/` qo'shib yozilgan.
   To'g'risi: faqat `192.168.1.51` yoki `192.168.1.51:8080`.
6. **Chiroq teskari ishlayapti** (yonishi kerakda o'chadi) — stol sozlamalarida
   **"teskari (NC relay)"** belgisini yoqing.
7. **Qo'lda tekshirish** — agentni to'xtatmasdan, o'sha kompyuterdan brauzerda relay URL ini oching:
   `http://192.168.1.51/relay/0?turn=on`. Ishlamasa — muammo tarmoqda/relayda, agentda emas.

### Foydali eslatmalar

- Agent **hech qachon** o'yin/sessiya jarayoniga ta'sir qilmaydi: chiroq xatosi kassada
  hech narsani to'xtatmaydi, faqat logga va saytdagi holat ustuniga yoziladi.
- Agent har `FORCE_SYNC_MS` (standart 1 daqiqa) da barcha relaylarga holatni **majburiy qayta**
  yuboradi — shuning uchun elektr uzilib-yongandan keyin chiroqlar o'zi to'g'rilanadi.
- Bir klubda **faqat bitta** agent ishlashi kerak. Ikkita nusxa ishga tushsa, ular bir-biriga
  xalaqit bermaydi, lekin loglar chalkashadi.
- Tokenni hech kimga bermang. Shubha bo'lsa saytdan bekor qilib, yangisini yarating.

---

## 8. Fayllar

| Fayl                             | Vazifasi                                  |
|----------------------------------|--------------------------------------------|
| `agent.js`                       | Agentning o'zi (yagona fayl, bog'liqliksiz) |
| `package.json`                   | `npm start` uchun                          |
| `.env.example`                   | Sozlamalar namunasi                        |
| `billiardclub-bridge.service`    | systemd xizmati namunasi                   |
| `README.md`                      | Ushbu qo'llanma                            |
