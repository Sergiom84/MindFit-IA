/**
 * @fileoverview Tests unitarios para dayNormalizer.js
 * 
 * Ejecutar con: node --test backend/utils/shared/__tests__/dayNormalizer.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  stripDiacritics,
  normalizeDayAbbrev,
  DAY_INDEX_TO_ABBREV,
  ABBREV_TO_DAY_INDEX,
  FULL_DAY_NAMES
} from '../dayNormalizer.js';

describe('stripDiacritics', () => {
  it('should remove accents from Spanish characters', () => {
    assert.strictEqual(stripDiacritics('miércoles'), 'miercoles');
    assert.strictEqual(stripDiacritics('sábado'), 'sabado');
    assert.strictEqual(stripDiacritics('año'), 'ano');
    assert.strictEqual(stripDiacritics('niño'), 'nino');
  });

  it('should handle empty strings', () => {
    assert.strictEqual(stripDiacritics(''), '');
    assert.strictEqual(stripDiacritics(), '');
  });

  it('should preserve non-accented characters', () => {
    assert.strictEqual(stripDiacritics('lunes'), 'lunes');
    assert.strictEqual(stripDiacritics('ABC123'), 'ABC123');
  });
});

describe('normalizeDayAbbrev', () => {
  it('should normalize full day names to abbreviations', () => {
    assert.strictEqual(normalizeDayAbbrev('lunes'), 'Lun');
    assert.strictEqual(normalizeDayAbbrev('martes'), 'Mar');
    assert.strictEqual(normalizeDayAbbrev('miércoles'), 'Mie');
    assert.strictEqual(normalizeDayAbbrev('jueves'), 'Jue');
    assert.strictEqual(normalizeDayAbbrev('viernes'), 'Vie');
    assert.strictEqual(normalizeDayAbbrev('sábado'), 'Sab');
    assert.strictEqual(normalizeDayAbbrev('domingo'), 'Dom');
  });

  it('should normalize abbreviated day names', () => {
    assert.strictEqual(normalizeDayAbbrev('lun'), 'Lun');
    assert.strictEqual(normalizeDayAbbrev('mar'), 'Mar');
    assert.strictEqual(normalizeDayAbbrev('mie'), 'Mie');
    assert.strictEqual(normalizeDayAbbrev('jue'), 'Jue');
    assert.strictEqual(normalizeDayAbbrev('vie'), 'Vie');
    assert.strictEqual(normalizeDayAbbrev('sab'), 'Sab');
    assert.strictEqual(normalizeDayAbbrev('dom'), 'Dom');
  });

  it('should handle case insensitivity', () => {
    assert.strictEqual(normalizeDayAbbrev('LUNES'), 'Lun');
    assert.strictEqual(normalizeDayAbbrev('Martes'), 'Mar');
    assert.strictEqual(normalizeDayAbbrev('MIE'), 'Mie');
  });

  it('should handle trailing periods', () => {
    assert.strictEqual(normalizeDayAbbrev('lun.'), 'Lun');
    assert.strictEqual(normalizeDayAbbrev('mar.'), 'Mar');
  });

  it('should handle whitespace', () => {
    assert.strictEqual(normalizeDayAbbrev('  lunes  '), 'Lun');
    assert.strictEqual(normalizeDayAbbrev('\tmartes\n'), 'Mar');
  });

  it('should return original value for unknown days', () => {
    assert.strictEqual(normalizeDayAbbrev('unknown'), 'unknown');
    assert.strictEqual(normalizeDayAbbrev('xyz'), 'xyz');
  });

  it('should handle null/undefined', () => {
    assert.strictEqual(normalizeDayAbbrev(null), null);
    assert.strictEqual(normalizeDayAbbrev(undefined), undefined);
  });
});

describe('DAY_INDEX_TO_ABBREV', () => {
  it('should map day indices correctly', () => {
    assert.strictEqual(DAY_INDEX_TO_ABBREV[0], 'Dom');
    assert.strictEqual(DAY_INDEX_TO_ABBREV[1], 'Lun');
    assert.strictEqual(DAY_INDEX_TO_ABBREV[2], 'Mar');
    assert.strictEqual(DAY_INDEX_TO_ABBREV[3], 'Mie');
    assert.strictEqual(DAY_INDEX_TO_ABBREV[4], 'Jue');
    assert.strictEqual(DAY_INDEX_TO_ABBREV[5], 'Vie');
    assert.strictEqual(DAY_INDEX_TO_ABBREV[6], 'Sab');
  });
});

describe('ABBREV_TO_DAY_INDEX', () => {
  it('should map abbreviations to indices correctly', () => {
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Dom'], 0);
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Lun'], 1);
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Mar'], 2);
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Mie'], 3);
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Jue'], 4);
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Vie'], 5);
    assert.strictEqual(ABBREV_TO_DAY_INDEX['Sab'], 6);
  });
});

describe('FULL_DAY_NAMES', () => {
  it('should have correct day names in order', () => {
    assert.strictEqual(FULL_DAY_NAMES[0], 'domingo');
    assert.strictEqual(FULL_DAY_NAMES[1], 'lunes');
    assert.strictEqual(FULL_DAY_NAMES[2], 'martes');
    assert.strictEqual(FULL_DAY_NAMES[3], 'miércoles');
    assert.strictEqual(FULL_DAY_NAMES[4], 'jueves');
    assert.strictEqual(FULL_DAY_NAMES[5], 'viernes');
    assert.strictEqual(FULL_DAY_NAMES[6], 'sábado');
  });

  it('should have 7 days', () => {
    assert.strictEqual(FULL_DAY_NAMES.length, 7);
  });
});

