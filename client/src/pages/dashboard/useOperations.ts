import { useCallback, useEffect, useRef, useState } from 'react';
import { lightsApi, reservationsApi } from '../../api';
import type { LightsOverview, Reservation } from '../../types';
import { arrivalQueue, RESERVATION_LOOKAHEAD_MS, RESERVATION_LOOKBACK_MS } from './operations';

interface Snapshot<T> { data: T | null; failed: boolean; at: number | null }
const empty = <T,>(): Snapshot<T> => ({ data: null, failed: false, at: null });

/** Separate failures keep a relay outage from hiding the arrival queue. */
export function useOperations(scope: number | undefined, clockOffset: number) {
  const [lights, setLights] = useState<Snapshot<LightsOverview>>(empty);
  const [arrivals, setArrivals] = useState<Snapshot<Reservation[]>>(empty);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const busy = useRef(false);
  const clock = useRef(clockOffset);
  clock.current = clockOffset;
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    const now = Date.now() + clock.current;
    const query = { from: new Date(now - RESERVATION_LOOKBACK_MS).toISOString(),
      to: new Date(now + RESERVATION_LOOKAHEAD_MS).toISOString(), limit: 4 };
    setLoading(true);
    const [lightResult, arrivalResult] = await Promise.allSettled([
      lightsApi.overview(),
      Promise.all(['pending', 'confirmed'].map((status) => reservationsApi.list({ ...query, status }))),
    ]);
    if (request !== generation.current) return;
    setLights((previous) => lightResult.status === 'fulfilled'
      ? { data: lightResult.value.data, failed: false, at: Date.now() }
      : { ...previous, failed: true });
    setArrivals((previous) => arrivalResult.status === 'fulfilled'
      ? { data: arrivalQueue(arrivalResult.value.flatMap((res) => res.data), now), failed: false, at: Date.now() }
      : { ...previous, failed: true });
    busy.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    setLights(empty());
    setArrivals(empty());
    busy.current = false;
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(visibleRefresh, 30_000);
    document.addEventListener('visibilitychange', visibleRefresh);
    window.addEventListener('online', visibleRefresh);
    return () => {
      generation.current += 1;
      busy.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRefresh);
      window.removeEventListener('online', visibleRefresh);
    };
  }, [refresh, scope]);

  return { lights, arrivals, loading, refresh };
}
