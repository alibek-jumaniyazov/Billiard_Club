import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../api';
import { useAuth } from '../context/AuthContext';
import type { FeatureKey, LimitKey, TiersConfig } from '../types';

/**
 * Klub tarifi bo'yicha nima ochiq (Standart / Pro / VIP).
 *
 * Bu faqat INTERFEYS uchun (menyu, tugma, "tarifni oshirish" kartasi) — server
 * har so'rovda o'zi tekshiradi. Shu sabab ma'lumot bo'lmasa (eski server
 * javobi) hech narsa yopilmaydi; superadmin klubni ko'rish rejimida ham.
 */
export const useEntitlements = () => {
  const { user, club } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const entitlements = club?.entitlements ?? null;

  const can = useCallback(
    (feature: FeatureKey) => isSuperadmin || !entitlements || entitlements.features[feature] !== false,
    [isSuperadmin, entitlements],
  );

  /** null — cheksiz (yoki ma'lumot yo'q) */
  const limit = useCallback(
    (key: LimitKey): number | null => (isSuperadmin || !entitlements ? null : entitlements.limits[key]),
    [isSuperadmin, entitlements],
  );

  return { tier: entitlements?.tier ?? club?.tier ?? null, entitlements, can, limit, isSuperadmin };
};

/** Tariflar sozlamasi sessiyada bir marta olinadi (ommaviy endpoint — kassir ham o'qiy oladi) */
let tiersCache: Promise<TiersConfig | null> | null = null;
const loadTiers = () => {
  if (!tiersCache) {
    tiersCache = publicApi
      .tiers()
      .then((res) => res.data ?? null)
      .catch(() => {
        tiersCache = null; // keyingi safar qayta urinadi
        return null;
      });
  }
  return tiersCache;
};

/** Sozlama + yuklanish holati (yuklanayotganda skelet, xatoda — sozlamasiz ko'rinish) */
export const useTiersConfigState = (): { config: TiersConfig | null; loading: boolean } => {
  const [state, setState] = useState<{ config: TiersConfig | null; loading: boolean }>({ config: null, loading: true });
  useEffect(() => {
    let alive = true;
    void loadTiers().then((config) => {
      if (alive) setState({ config, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
};

export const useTiersConfig = (): TiersConfig | null => useTiersConfigState().config;
