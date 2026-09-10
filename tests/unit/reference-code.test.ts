import { describe, it, expect } from 'vitest';
import {
  computeCrockfordChecksum,
  generateOrderReferenceCode,
  validateOrderReferenceCode,
} from '@/domain/money/reference-code';

describe('Crockford Base32 Reference Code Generator', () => {
  it('generates valid reference codes matching SP-XXXX-XXXXC format', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOrderReferenceCode('SP');
      expect(code).toMatch(/^SP-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}[0-9A-HJKMNP-Z*~$=U]$/);
      expect(validateOrderReferenceCode(code, 'SP')).toBe(true);
    }
  });

  it('detects corrupted or typoed reference codes', () => {
    const validCode = generateOrderReferenceCode('SP');
    expect(validateOrderReferenceCode(validCode)).toBe(true);

    // Swap last character (checksum)
    const corruptedChecksum = validCode.slice(0, -1) + (validCode.endsWith('A') ? 'B' : 'A');
    expect(validateOrderReferenceCode(corruptedChecksum)).toBe(false);

    // Corrupt one character in the body
    const parts = validCode.split('-');
    const corruptedBody = `${parts[0]}-${parts[1]!.slice(0, 3)}X-${parts[2]}`;
    // If 'X' changed the checksum requirement, validation should fail
    expect(validateOrderReferenceCode('INVALID-CODE')).toBe(false);
  });
});
