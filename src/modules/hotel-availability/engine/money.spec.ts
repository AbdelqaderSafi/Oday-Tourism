import { formatAmount, formatAmountOrNull, parseAmount } from './money';

describe('money', () => {
  it('parses decimal strings into minor units', () => {
    expect(parseAmount('5000.00')).toBe(500000);
    expect(parseAmount('7500.5')).toBe(750050);
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount(' 0.01 ')).toBe(1);
    expect(parseAmount('99999999.99')).toBe(9999999999);
  });

  it('rejects anything but a non-negative amount with at most two decimals', () => {
    for (const value of [
      '',
      '-1',
      '1.234',
      '1e3',
      'abc',
      '123456789',
      '.5',
      '5.',
    ]) {
      expect(parseAmount(value)).toBeNull();
    }
  });

  it('formats minor units with exactly two decimals', () => {
    expect(formatAmount(2640000)).toBe('26400.00');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(9999999999)).toBe('99999999.99');
    expect(formatAmountOrNull(null)).toBeNull();
    expect(formatAmountOrNull(180000)).toBe('1800.00');
  });
});
