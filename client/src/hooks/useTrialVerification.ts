import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  errorMessage, isNetworkError, publicApi,
  type TrialVerificationChallenge, type TrialVerificationStatus,
} from '../api';
import { setTrialDays } from '../i18n';
import { readTrialProof, TrialRequestGate } from '../utils/trial-verification';

/** Browser proof remains in memory; returning from Telegram checks without polling. */
export const useTrialVerification = (onInvalidate: () => void) => {
  const { t } = useTranslation();
  const [configState, setConfigState] = useState<'loading' | 'available' | 'unavailable' | 'error'>('loading');
  const [configAttempt, setConfigAttempt] = useState(0);
  const [challenge, setChallenge] = useState<TrialVerificationChallenge | null>(null);
  const [verification, setVerification] = useState<TrialVerificationStatus>({ status: 'pending' });
  const [busy, setBusy] = useState<'start' | 'check' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState(false);
  const [gate] = useState(() => new TrialRequestGate());

  useEffect(() => {
    let alive = true;
    publicApi.config().then((res) => {
      if (!alive) return;
      setTrialDays(res.data.trialDays);
      setConfigState(res.data.trialVerification?.method === 'telegram' &&
        res.data.trialVerification.available ? 'available' : 'unavailable');
    }).catch(() => { if (alive) setConfigState('error'); });
    return () => { alive = false; };
  }, [configAttempt]);

  useEffect(() => () => gate.invalidate(), [gate]);

  const failure = useCallback((cause: unknown) => {
    const status = (cause as { response?: { status?: number } })?.response?.status;
    return errorMessage(cause, t(isNetworkError(cause) ? 'offline.networkError' :
      status === 429 ? 'offline.rateLimited' : 'common.error'));
  }, [t]);

  const expire = useCallback(() => {
    gate.invalidate();
    setVerification({ status: 'expired' });
    setBusy(null);
    setError(null);
    setPendingNotice(false);
    onInvalidate();
  }, [gate, onInvalidate]);

  useEffect(() => {
    if (!challenge || verification.status === 'expired' || verification.status === 'used') return;
    const timeout = window.setTimeout(expire, Math.max(0, Date.parse(challenge.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [challenge, verification.status, expire]);

  const reset = () => {
    gate.invalidate();
    setChallenge(null);
    setVerification({ status: 'pending' });
    setBusy(null);
    setError(null);
    setPendingNotice(false);
    onInvalidate();
  };

  const start = async (website?: string) => {
    if (configState !== 'available' || challenge) return;
    const ticket = gate.begin('start');
    if (ticket === null) return;
    setBusy('start');
    setError(null);
    setPendingNotice(false);
    try {
      const res = await publicApi.startTrialVerification({ website });
      if (!gate.isCurrent(ticket)) return;
      const url = new URL(res.data.telegramUrl);
      if (url.protocol !== 'https:' || url.hostname !== 't.me' || !Number.isFinite(Date.parse(res.data.expiresAt))) {
        throw new Error('Invalid verification response');
      }
      setChallenge(res.data);
      setVerification({ status: 'pending' });
    } catch (cause) {
      if (gate.isCurrent(ticket)) setError(failure(cause));
    } finally {
      if (gate.isCurrent(ticket)) setBusy(null);
      gate.finish(ticket);
    }
  };

  const check = useCallback(async (automatic = false) => {
    if (!challenge || verification.status !== 'pending') return;
    if (Date.parse(challenge.expiresAt) <= Date.now()) { expire(); return; }
    const ticket = gate.begin('check');
    if (ticket === null) return;
    setBusy('check');
    setError(null);
    setPendingNotice(false);
    try {
      const res = await publicApi.trialVerificationStatus({ id: challenge.id, token: challenge.token });
      if (!gate.isCurrent(ticket)) return;
      if (Date.parse(challenge.expiresAt) <= Date.now()) { expire(); return; }
      if (res.data.status === 'verified' && !/^\d{7,15}$/.test(res.data.phone)) {
        throw new Error('Invalid verified phone');
      }
      setVerification(res.data);
      if (res.data.status === 'pending' && !automatic) setPendingNotice(true);
      if (res.data.status === 'expired' || res.data.status === 'used') onInvalidate();
    } catch (cause) {
      if (gate.isCurrent(ticket)) setError(failure(cause));
    } finally {
      if (gate.isCurrent(ticket)) setBusy(null);
      gate.finish(ticket);
    }
  }, [challenge, verification.status, gate, expire, failure, onInvalidate]);

  useEffect(() => {
    if (!challenge || verification.status !== 'pending') return;
    const onReturn = () => {
      if (document.visibilityState === 'visible') void check(true);
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [challenge, verification.status, check]);

  const currentProof = () => configState === 'available' ? readTrialProof(challenge, verification) : null;
  return {
    configState, challenge, verification, busy, error, pendingNotice,
    proof: currentProof(), currentProof, start, check, reset, expire, failure,
    reloadConfig: () => { setConfigState('loading'); setConfigAttempt((attempt) => attempt + 1); },
  };
};
