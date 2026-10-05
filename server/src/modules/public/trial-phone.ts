/**
 * Stable identity used only for free-trial claims. Keep this equivalent to the
 * canonical_trial_phone SQL function, including normalization of old club data.
 * Customer phone normalization has a separate persisted-key contract.
 */
export function canonicalTrialPhone(value?: string | null): string | null {
  const input = value?.trim();
  if (!input || !/^\+?[0-9\s().-]+$/.test(input)) return null;

  const digits = input.replace(/[^0-9]/g, '');
  const explicitlyInternational = input.startsWith('+') || digits.startsWith('00');
  const international = digits.startsWith('00') ? digits.slice(2) : digits;
  const phone = !explicitlyInternational && international.length === 9 ? `998${international}` : international;

  // Do not truncate: distinct malformed values must never share a claim key.
  return /^[1-9][0-9]{6,14}$/.test(phone) ? phone : null;
}

/** Telegram account phones already include their country code, even without +. */
export function canonicalTelegramTrialPhone(value?: string | null): string | null {
  const input = value?.trim();
  if (!input) return null;
  return canonicalTrialPhone(input.startsWith('+') ? input : `+${input}`);
}
