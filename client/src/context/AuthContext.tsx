import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authApi, publicApi } from '../api';
import { silentRefresh, tokenStore, viewingClub } from '../api/client';
import { clearCache, setCacheScope } from '../offline/cache';
import {
  clearLicense,
  initClock,
  offlineVerdict,
  storeLicense,
  storePublicKey,
  type LicenseVerdict,
} from '../offline/license';
import {
  clearSessionSnapshots,
  loadSessionSnapshot,
  saveSessionSnapshot,
} from '../offline/session-snapshot';
import type { ClubInfo, SignedLicense, User, UserRole } from '../types';

interface RegisterPayload {
  clubName: string;
  ownerName: string;
  phone: string;
  address: string;
  username: string;
  password: string;
  website?: string;
}

/**
 * Kirish/ro'yxatdan o'tish natijasi.
 *
 * `reason` MUHIM: tarmoq uzilganida ilova avval "Login yoki parol noto'g'ri"
 * deb ko'rsatardi — bu foydalanuvchiga SABAB HAQIDA YOLG'ON edi. Kassir
 * parolni qayta-qayta terib, server tomondagi 10 urinish/daqiqa chegarasiga
 * tushib qolardi va aloqa tiklanganda TO'G'RI parol bilan ham kira olmasdi.
 */
export type AuthFailReason = 'credentials' | 'network' | 'rateLimited';

export interface AuthResult {
  ok: boolean;
  message?: string;
  reason?: AuthFailReason;
}

/** Xato turini aniqlash: javob yo'q = tarmoq, 429 = urinishlar chegarasi */
const failReasonOf = (err: unknown): AuthFailReason => {
  const res = (err as { response?: { status?: number } })?.response;
  if (!res) return 'network';
  if (res.status === 429) return 'rateLimited';
  return 'credentials';
};

interface AuthContextValue {
  user: User | null;
  club: ClubInfo | null;
  loading: boolean;
  /**
   * Sessiya serverdan emas, LOKAL SURATdan tiklandi (internet yo'q edi).
   * Interfeys shu holatda "oflayn rejim" chizig'ini ko'rsatadi.
   */
  restoredOffline: boolean;
  /**
   * OFLAYN obuna hukmi — imzolangan ruxsatnoma asosida (offline/license.ts).
   *
   * Serverga ulanib turganda server hakam bo'lgani uchun bu qiymat
   * ishlatilmaydi; internet uzilganda esa AYNAN shu blok qaroriga asos bo'ladi.
   * `null` — hali hisoblanmagan (ilova endi yuklanyapti).
   */
  offlineLicense: LicenseVerdict | null;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (body: RegisterPayload) => Promise<AuthResult>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  /** Klub obuna holatini qayta so'raydi (blok ekranidagi "tekshirish" tugmasi) */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoredOffline, setRestoredOffline] = useState(false);
  const [offlineLicense, setOfflineLicense] = useState<LicenseVerdict | null>(null);

  /**
   * Kesh doirasi = foydalanuvchi + klub. Bu chegara tenant izolyatsiyasini
   * OFLAYN keshda ham saqlaydi: bir kompyuterda ikkinchi xodim (yoki boshqa
   * klubga o'tgan superadmin) birinchisining keshini KO'RMAYDI.
   */
  const applyScope = useCallback((nextUser: User | null, nextClub: ClubInfo | null) => {
    setCacheScope(nextUser ? `u${nextUser.id}|c${nextClub?.id ?? nextUser.clubId ?? 0}` : null);
  }, []);

  /**
   * Oflayn hukmni qayta hisoblash. Har safar yangi ruxsatnoma kelganda va
   * ilova ochilganda chaqiriladi.
   */
  const recomputeVerdict = useCallback(async (clubId: number | null) => {
    setOfflineLicense(await offlineVerdict(clubId));
  }, []);

  const adopt = useCallback(
    (
      nextUser: User,
      nextClub: ClubInfo | null,
      offline = false,
      license?: SignedLicense | null,
    ) => {
      applyScope(nextUser, nextClub);
      setUser(nextUser);
      setClub(nextClub);
      setRestoredOffline(offline);
      if (!offline) saveSessionSnapshot(tokenStore.getAccess(), nextUser, nextClub);

      // Ruxsatnoma faqat ONLAYN javobdan yangilanadi (oflayn tiklashda
      // saqlangani o'z holicha qoladi — u allaqachon imzolangan va tekshiriladi)
      void (async () => {
        if (!offline) await storeLicense(license ?? null);
        await recomputeVerdict(nextClub?.id ?? nextUser.clubId ?? null);
      })();
    },
    [applyScope, recomputeVerdict],
  );

  const refreshMe = useCallback(async () => {
    const res = await authApi.me();
    adopt(res.data.user, res.data.club, false, res.data.license);
  }, [adopt]);

  /**
   * Monoton soat va ochiq kalit — ilova ochilishida BIR MARTA.
   *
   * Kalit oldindan saqlangan bo'lsa serverga so'rov ketmaydi ham: bu yo'l
   * internetsiz ishga tushishda ham to'g'ri bo'lishi kerak (aynan o'shanda
   * ruxsatnoma tekshiruvi eng zarur).
   */
  useEffect(() => {
    void (async () => {
      await initClock();
      try {
        const res = await publicApi.licenseKey();
        if (res.data?.publicKey) await storePublicKey(res.data.publicKey);
      } catch {
        // Internet yo'q — avval saqlangan kalit ishlatiladi
      }
    })();
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        if (!tokenStore.getAccess()) {
          // Access token yo'q, lekin httpOnly refresh cookie bo'lishi mumkin —
          // "chiqib ketgan" deb hisoblashdan avval bitta jim refresh urinamiz
          const result = await silentRefresh();
          if (!result.token) return;
        }
        await refreshMe();
      } catch (err: unknown) {
        // Faqat autentifikatsiya xatosida tokenni o'chiramiz — tarmoq
        // uzilishida foydalanuvchini bejiz chiqarib yubormaymiz
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          tokenStore.clear();
          clearSessionSnapshots();
          void clearCache();
          return;
        }
        // TARMOQ UZILGAN: oxirgi ma'lum sessiyani lokal suratdan tiklaymiz,
        // shunda kassir internet yo'q paytda ham ishni davom ettiradi
        // (token muddati o'tgan bo'lsa surat ishlatilmaydi — session-snapshot.ts)
        const snap = loadSessionSnapshot(tokenStore.getAccess());
        if (snap) adopt(snap.user, snap.club, true);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [refreshMe, adopt]);

  // Multi-tab sinxronizatsiya (storage hodisasi FAQAT boshqa tablarda ishlaydi)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // Boshqa oynada accessToken o'chirilsa — bu oynada ham lokal chiqish
      if (e.key === 'accessToken' && e.newValue === null) {
        viewingClub.clear();
        clearSessionSnapshots();
        void clearCache();
        setCacheScope(null);
        setUser(null);
        setClub(null);
        setRestoredOffline(false);
      }
      // Superadmin "klubni ko'rish" konteksti boshqa tabda o'zgarsa/tozalansa —
      // bu tab ham qayta sinxronlanishi shart: aks holda UI bir klubni ko'rsatib,
      // so'rovlar (X-Club-Id) localStorage dagi boshqa klub kontekstida ketardi.
      // Eng ishonchli yo'l — sahifani qayta yuklab, kontekstni bir xillashtirish.
      if (e.key === 'viewingClub') {
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        // Avvalgi sessiyaning "klubni ko'rish" rejimi yangi sessiyaga o'tmasin
        viewingClub.clear();
        const res = await authApi.login(username, password);
        // Boshqa hisobning oflayn keshi yangi kirgan xodimga ko'rinmasin
        await clearCache();
        // Faqat access token saqlanadi — refresh httpOnly cookie da
        tokenStore.set(res.data.accessToken);
        adopt(res.data.user, res.data.club, false, res.data.license);
        return { ok: true };
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
        return { ok: false, message, reason: failReasonOf(err) };
      }
    },
    [adopt],
  );

  const register = useCallback(
    async (body: RegisterPayload) => {
      try {
        viewingClub.clear();
        const res = await publicApi.register(body);
        await clearCache();
        tokenStore.set(res.data.accessToken);
        adopt(res.data.user, res.data.club, false, res.data.license);
        return { ok: true };
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
        return { ok: false, message, reason: failReasonOf(err) };
      }
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    try {
      // Avval server tomonda refresh sessiya bekor qilinadi va cookie tozalanadi
      await authApi.logout();
    } catch {
      // Server xatosi chiqishga to'sqinlik qilmasin
    }
    tokenStore.clear();
    viewingClub.clear();
    // Oflayn izlar ham tozalanadi — keyingi xodim oldingisining ma'lumotini
    // ko'rmasin (yuborilmagan navbat ATAYLAB saqlanadi: u pul amali)
    clearSessionSnapshots();
    await clearCache();
    // Ruxsatnoma ham tozalanadi: u KLUBGA tegishli va keyingi xodim boshqa
    // klubdan bo'lishi mumkin. (Monoton vaqt langari ATAYLAB qoladi — u
    // hisobga emas, kompyuterga tegishli va uni chiqib-kirish bilan
    // "nolga qaytarib" bo'lmasligi kerak.)
    await clearLicense();
    setCacheScope(null);
    setUser(null);
    setClub(null);
    setRestoredOffline(false);
    setOfflineLicense(null);
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      club,
      loading,
      restoredOffline,
      offlineLicense,
      login,
      register,
      logout,
      hasRole,
      refreshMe,
    }),
    [
      user,
      club,
      loading,
      restoredOffline,
      offlineLicense,
      login,
      register,
      logout,
      hasRole,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
};
