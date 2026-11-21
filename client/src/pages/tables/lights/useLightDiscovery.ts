import { useCallback, useEffect, useRef, useState } from 'react';
import { lightsApi } from '../../../api';
import { desktopLights } from '../../../offline/desktop';
import type { DiscoveredDevice } from '../../../types';
import { foundDevice, type FoundDevice } from './devices';
import type { LightHubDiscovered } from '../../../offline/desktop';
import { lightErrorText } from './hub-errors';

/** Agent skani ketayotganda natijani shu oraliqda so'raymiz (ms) */
const POLL_MS = 3000;

const normalize = (devices: Array<LightHubDiscovered | DiscoveredDevice>): FoundDevice[] => {
  const map = new Map<string, FoundDevice>();
  for (const device of devices) {
    const item = foundDevice(device);
    if (item && !map.has(item.key)) map.set(item.key, item);
  }
  return Array.from(map.values());
};

export interface LightDiscovery {
  found: FoundDevice[];
  scanning: boolean;
  scannedAt: string | null;
  subnet: string | null;
  error: string | null;
  /** Qidirish mumkinmi: kompyuter dasturi yoki onlayn agent */
  available: boolean;
  /** Qidiruvni kim bajaradi: shu kompyuter yoki klub agenti */
  via: 'desktop' | 'agent' | null;
  scan: (subnet?: string) => Promise<void>;
}

/**
 * Qurilmalarni qidirish.
 *  - Kompyuter dasturida: shu kompyuterning o'zi tarmoq (Shelly/Tasmota/ESPHome,
 *    mDNS orqali Sonoff, Tuya UDP e'lonlari) va USB (COM, HID) ni ko'radi.
 *  - Brauzerda: qidiruvni klub agenti bajaradi (server orqali navbat).
 */
export function useLightDiscovery(open: boolean, agentOnline: boolean, fallbackError: string): LightDiscovery {
  const hub = desktopLights();
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [subnet, setSubnet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadAgentResult = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const res = await lightsApi.discovered();
      if (!alive.current) return;
      setFound(normalize(res.data.devices));
      setScannedAt(res.data.scannedAt);
      setSubnet(res.data.subnet ?? null);
      setScanning(res.data.running);
    } catch {
      /* oxirgi natija ko'rinib qoladi — keyingi so'rovda yangilanadi */
    } finally {
      polling.current = false;
    }
  }, []);

  /* Brauzerda: oyna ochilganda agentning oxirgi skan natijasi */
  useEffect(() => {
    if (!open || hub) return;
    void loadAgentResult();
  }, [open, hub, loadAgentResult]);

  /* Agent skani ketayotganda natijani kuzatamiz */
  useEffect(() => {
    if (!open || hub || !scanning) return;
    const timer = setInterval(() => void loadAgentResult(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, hub, scanning, loadAgentResult]);

  const scan = useCallback(
    async (subnetInput?: string) => {
      const cleanSubnet = subnetInput?.trim() || undefined;
      setError(null);
      if (hub) {
        setScanning(true);
        try {
          const res = await hub.discover(cleanSubnet);
          if (!alive.current) return;
          setFound(normalize(res.devices));
          setSubnet(res.subnet);
          setScannedAt(new Date().toISOString());
        } catch (err) {
          if (alive.current) setError(lightErrorText(err, fallbackError));
        } finally {
          if (alive.current) setScanning(false);
        }
        return;
      }
      try {
        const res = await lightsApi.discover(cleanSubnet);
        if (!alive.current) return;
        if (res.data.queued) setScanning(true);
        else setError(res.message ?? fallbackError);
      } catch (err) {
        if (alive.current) setError(lightErrorText(err, fallbackError));
      }
    },
    [hub, fallbackError],
  );

  return {
    found,
    scanning,
    scannedAt,
    subnet,
    error,
    available: !!hub || agentOnline,
    via: hub ? 'desktop' : agentOnline ? 'agent' : null,
    scan,
  };
}
