/**
 * Best-effort E.164 formatting (Odyssey asks for E.164 "when available").
 * Nigerian local numbers (0803…, 803…, 234803…) become +234803…; anything already starting with + is kept.
 * Returns undefined for empty input and the cleaned original when the format is not recognised.
 */
export function toE164(raw: string | null | undefined, defaultCountryCode = '234'): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith(defaultCountryCode) && digits.length >= defaultCountryCode.length + 7) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `+${defaultCountryCode}${digits}`;
  return trimmed;
}
