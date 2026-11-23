import { describe, it, expect } from 'vitest';
import { classifyBarcode, isBareUpc, parseUpc, upcValid } from './barcode';

const HOBBIT = '9780547928227';
// A UPC-A with a valid check digit, and one with a wrong one.
const UPC = '036000291452';
const BAD_UPC = '036000291453';

describe('upcValid', () => {
  it('checks the UPC-A check digit', () => {
    expect(upcValid(UPC)).toBe(true);
    expect(upcValid('012345678905')).toBe(true);
    expect(upcValid(BAD_UPC)).toBe(false);
    expect(upcValid(UPC.slice(1))).toBe(false);
  });
});

describe('parseUpc', () => {
  it.each([
    [UPC, UPC, ''],
    [UPC + '12', UPC, '12'],
    [UPC + '00799', UPC, '00799'],
    ['0' + UPC, UPC, ''],
    ['0' + UPC + '00799', UPC, '00799'],
  ])('reads %s', (digits, upc, addon) => {
    expect(parseUpc(digits)).toEqual({ kind: 'upc', upc, addon, code: upc + addon });
  });

  it.each([BAD_UPC, UPC + '1', UPC + '123', UPC.slice(0, 11), '00' + UPC])(
    'refuses %s',
    (digits) => {
      expect(parseUpc(digits)).toBeNull();
    }
  );
});

describe('classifyBarcode', () => {
  it.each([
    [HOBBIT, HOBBIT],
    ['978-0-547-92822-7', HOBBIT],
    ['0547928211', '9780547928210'],
    ['080442957X', '9780804429573'],
    [HOBBIT + '51599', HOBBIT],
  ])('reads the ISBN %s', (raw, isbn) => {
    expect(classifyBarcode(raw)).toEqual({ kind: 'isbn', isbn });
  });

  it.each([
    [UPC, UPC],
    ['0' + UPC, UPC],
    [UPC + '12', UPC + '12'],
    [UPC + '00799', UPC + '00799'],
    [` ${UPC}-00799 `, UPC + '00799'],
  ])('reads the UPC %s', (raw, code) => {
    expect(classifyBarcode(raw)).toMatchObject({ kind: 'upc', code });
  });

  it.each(['', '   ', '1984', BAD_UPC, '9780547928228', 'The Hobbit', HOBBIT + '1'])(
    'recognises nothing in %j',
    (raw) => {
      expect(classifyBarcode(raw)).toBeNull();
    }
  );

  it('takes a typed 12-digit 978 number for an ISBN missing a digit', () => {
    expect(classifyBarcode('978054792822')).toBeNull();
  });

  it('reads a scanned 12-digit 978 number as a UPC when its check digit fits', () => {
    // A UPC-A whose number system digit happens to be 9 and that starts 978.
    const upc = '978000000002';
    expect(upcValid(upc)).toBe(true);
    expect(classifyBarcode(upc)).toBeNull();
    expect(classifyBarcode(upc, { scanned: true })).toMatchObject({ kind: 'upc', code: upc });
  });

  it('tells a bare UPC from one with its add-on', () => {
    expect(isBareUpc(classifyBarcode(UPC))).toBe(true);
    expect(isBareUpc(classifyBarcode(UPC + '00799'))).toBe(false);
    expect(isBareUpc(classifyBarcode(HOBBIT))).toBe(false);
    expect(isBareUpc(null)).toBe(false);
  });
});
