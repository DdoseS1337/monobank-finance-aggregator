import { Money } from './money';

describe('Money', () => {
  describe('arithmetic', () => {
    it('adds same-currency amounts', () => {
      const a = Money.of('100.50', 'UAH');
      const b = Money.of('25.10', 'UAH');
      expect(a.add(b).toFixed(2)).toBe('125.60');
    });

    it('subtracts same-currency amounts', () => {
      const a = Money.of('100', 'UAH');
      const b = Money.of('30.50', 'UAH');
      expect(a.subtract(b).toFixed(2)).toBe('69.50');
    });

    it('multiplies by a scalar', () => {
      expect(Money.of('100', 'UAH').multiply(0.15).toFixed(2)).toBe('15.00');
    });

    it('computes percentage', () => {
      expect(Money.of('200', 'UAH').percentage(25).toFixed(2)).toBe('50.00');
    });

    it('rejects mixed currencies on add/subtract/compare', () => {
      const uah = Money.of('100', 'UAH');
      const usd = Money.of('100', 'USD');
      expect(() => uah.add(usd)).toThrow(/different currencies/);
      expect(() => uah.subtract(usd)).toThrow(/different currencies/);
      expect(() => uah.greaterThan(usd)).toThrow(/different currencies/);
    });
  });

  describe('predicates', () => {
    it('detects positive / zero / negative', () => {
      expect(Money.of('1.5', 'UAH').isPositive()).toBe(true);
      expect(Money.zero('UAH').isPositive()).toBe(false);
      expect(Money.zero('UAH').isZero()).toBe(true);
      expect(Money.of('-1', 'UAH').isNegative()).toBe(true);
    });

    it('compares same-currency values correctly', () => {
      const a = Money.of('100', 'UAH');
      const b = Money.of('99.99', 'UAH');
      expect(a.greaterThan(b)).toBe(true);
      expect(a.lessThan(b)).toBe(false);
      expect(a.equals(Money.of('100.00', 'UAH'))).toBe(true);
    });
  });

  describe('serialization', () => {
    it('produces fixed-precision JSON', () => {
      expect(Money.of('99.999', 'UAH').toJSON()).toEqual({
        amount: '100.00',
        currency: 'UAH',
      });
    });

    it('toString is human readable', () => {
      expect(Money.of('1234.5', 'EUR').toString()).toBe('1234.50 EUR');
    });
  });

  it('throws on infinite amounts', () => {
    expect(() => Money.of(Infinity, 'UAH')).toThrow();
  });
});
