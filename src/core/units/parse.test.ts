import { describe, expect, it } from 'vitest';
import { inch } from './length';
import { parseLength, type BareUnit } from './parse';

function ok(input: string, bare: BareUnit = 'in'): number {
  const r = parseLength(input, bare);
  if (!r.ok) throw new Error(`expected "${input}" to parse, got: ${r.error}`);
  return r.value;
}

describe('parseLength: imperial forms', () => {
  it.each([
    // [input, expected inches]
    ['23', 23],
    ['23.25', 23.25],
    ['.5', 0.5],
    ['0', 0],
    ['3/4', 0.75],
    ['23 1/4', 23.25],
    ['23-1/4', 23.25],
    ['23 - 1/4', 23.25],
    ['23 1/4"', 23.25],
    ['23-1/4"', 23.25],
    ['23 1/4 "', 23.25],
    ['23 1/4 in', 23.25],
    ['23 1/4in', 23.25],
    ['23.25in', 23.25],
    ['23.25 inches', 23.25],
    ['23.25 inch', 23.25],
    ['23.25 in.', 23.25],
    ['1 inch', 1],
    ['23 15/32', 23 + 15 / 32],
    ['23 31/32"', 23 + 31 / 32],
    ['5/16"', 5 / 16],
    ['1/3', 1 / 3],
    ['  23 1/4  ', 23.25],
    ['23\t1/4', 23.25],
    ['23″', 23],
    ['23”', 23],
    ["23''", 23],
    ['23½', 23.5],
    ['23 ½', 23.5],
    ['¾', 0.75],
    ['¾"', 0.75],
    ['0⅛', 0.125],
    ['1⅜', 1.375],
    ['1⅝"', 1.625],
    ['1⅞', 1.875],
    ['1¼', 1.25],
    ["2'", 24],
    ['2′', 24],
    ['2 ft', 24],
    ['2ft', 24],
    ['2 feet', 24],
    ['1 foot', 12],
    ['1\' 2"', 14],
    ['1\'2"', 14],
    ["1'2", 14],
    ['1\'-2"', 14],
    ['1\' - 2 1/4"', 14.25],
    ['1\'-2-1/4"', 14.25],
    ['2 ft 3 in', 27],
    ['2ft 3 1/2in', 27.5],
    ['7\' 0"', 84],
    ['8′ 1½″', 97.5],
    ['+23', 23],
    ['-1/4', -0.25],
    ['- 23 1/4', -23.25],
    ['23.', 23],
  ] as [string, number][])('%s → %f in', (input, inches) => {
    expect(ok(input)).toBe(inch(inches));
  });
});

describe('parseLength: metric forms', () => {
  it.each([
    ['590mm', 590],
    ['590 mm', 590],
    ['590.5 mm', 590.5],
    ['590 MM', 590],
    ['59cm', 590],
    ['59.05 cm', 590.5],
    ['0.59m', 590],
    ['.59 m', 590],
    ['18 millimeters', 18],
    ['18 millimetres', 18],
    ['5 centimeters', 50],
    ['1 meter', 1000],
    ['2 metres', 2000],
    ['-3mm', -3],
  ] as [string, number][])('%s → %f mm', (input, mm) => {
    expect(ok(input, 'in')).toBeCloseTo(mm, 9);
  });

  it('applies the bare unit to unit-less numbers', () => {
    expect(ok('590', 'mm')).toBe(590);
    expect(ok('590.5', 'mm')).toBe(590.5);
    expect(ok('23 1/4', 'mm')).toBe(23.25);
    expect(ok('590', 'in')).toBe(inch(590));
  });

  it('explicit units override the bare unit', () => {
    expect(ok('23"', 'mm')).toBe(inch(23));
    expect(ok('590mm', 'in')).toBe(590);
  });
});

describe('parseLength: invalid input', () => {
  it.each([
    ['', 'Enter a length.'],
    ['   ', 'Enter a length.'],
    ['abc', "Can't read"],
    ['IN 23', "Can't read"],
    ['23 1/4 1/8', "Can't read"],
    ['23 /4', "Can't read"],
    ['23 1 / 4', "Can't read"],
    ['3 / 4', "Can't read"],
    ['23 1', "Can't read"],
    ['1/0', 'cannot have 0'],
    ['23 1/0"', 'cannot have 0'],
    ['0/0\' 2"', 'cannot have 0'],
    ["2' 1/0", 'cannot have 0'],
    ['1/2 mm', 'Use decimals'],
    ['2 1/2 cm', 'Use decimals'],
    ['--23', "Can't read"],
    ['23mmm', "Can't read"],
    ['1.2.3', "Can't read"],
    ['23" 1/4', "Can't read"],
    ['2 cm 3 mm', "Can't read"],
    ['1e3', "Can't read"],
  ])('rejects %j', (input, message) => {
    const r = parseLength(input, 'in');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });
});

describe('parseLength: precision', () => {
  it('stores sixteenths and thirty-seconds within 1 nm of exact', () => {
    for (let ticks = 0; ticks <= 96 * 32; ticks++) {
      const value = ok(`${ticks}/32`);
      expect(Math.abs(value - (ticks * 25.4) / 32)).toBeLessThanOrEqual(1e-6);
    }
  });
});
