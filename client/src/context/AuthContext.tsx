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
import type { ClubInfo, User, UserRole } from '../types';

interface RegisterPayload {
  clubName: string;
  ownerName: string;
  phone: string;
  address: string;
  username: string;
  password: string;
  website?: string;
}

interface AuthContextValue {
  user: User | null;
  club: ClubInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  register: (body: RegisterPayload) => Promise<{ ok: boolean; message?: string }>;
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

  const refreshMe = useCallback(async () => {
    const res = await authApi.me();
    setUser(res.data.user);
    setClub(res.data.club);
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
        if (status === 401) tokenStore.clear();
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [refreshMe]);

  // Multi-tab: boshqa oynada accessToken o'chirilsa — bu oynada ham lokal chiqish
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'accessToken' && e.newValue === null) {
        viewingClub.clear();
        setUser(null);
        setClub(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      // Avvalgi sessiyaning "klubni ko'rish" rejimi yangi sessiyaga o'tmasin
      viewingClub.clear();
      const res = await authApi.login(username, password);
      // Faqat access token saqlanadi — refresh httpOnly cookie da
      tokenStore.set(res.data.accessToken);
      setUser(res.data.user);
      setClub(res.data.club);
      return { ok: true };
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      return { ok: false, message };
    }
  }, []);

  const register = useCallback(async (body: RegisterPayload) => {
    try {
      viewingClub.clear();
      const res = await publicApi.register(body);
      tokenStore.set(res.data.accessToken);
      setUser(res.data.user);
      setClub(res.data.club);
      return { ok: true };
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      return { ok: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Avval server tomonda refresh sessiya bekor qilinadi va cookie tozalanadi
      await authApi.logout();
    } catch {
      // Server xatosi chiqishga to'sqinlik qilmasin
    }
    tokenStore.clear();
    viewingClub.clear();
    setUser(null);
    setClub(null);
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  const value = useMemo(
    () => ({ user, club, loading, login, register, logout, hasRole, refreshMe }),
    [user, club, loading, login, register, logout, hasRole, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
};
