// Integer minor units (cents / piasters), so totals are exact.
export type Cents = number;

const AMOUNT_PATTERN = /^(\d{1,8})(?:\.(\d{1,2}))?$/;

export function parseAmount(value: string): Cents | null {
  const match = AMOUNT_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function formatAmount(cents: Cents): string {
  const fraction = cents % 100;
  return `${(cents - fraction) / 100}.${String(fraction).padStart(2, '0')}`;
}

export function formatAmountOrNull(cents: Cents | null): string | null {
  return cents === null ? null : formatAmount(cents);
}
