import crypto from 'node:crypto';

/**
 * Crockford's Base32 Alphabet (excludes I, L, O, U to prevent visual confusion).
 * Standard alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ
 */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHECKSUM_SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U';

/**
 * Compute Modulo 37 Checksum for Crockford Base32 string according to Crockford specification.
 */
export function computeCrockfordChecksum(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^0-9A-HJKMNP-Z]/g, '');
  let sum = 0n;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]!;
    const val = BigInt(CROCKFORD_ALPHABET.indexOf(char));
    if (val === -1n) {
      throw new Error(`Invalid Crockford Base32 character: ${char}`);
    }
    sum = (sum * 32n + val) % 37n;
  }
  return CHECKSUM_SYMBOLS[Number(sum)]!;
}

/**
 * Generate a random Crockford Base32 string of specified length.
 */
export function generateRandomCrockford(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i]!;
    result += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
  }
  return result;
}

/**
 * Generate a formatted, checksummed human-friendly reference code for orders.
 * Format: SP-XXXX-XXXXC (e.g. SP-7K4M-9Q22K)
 */
export function generateOrderReferenceCode(prefix = 'SP'): string {
  const p1 = generateRandomCrockford(4);
  const p2 = generateRandomCrockford(4);
  const body = `${p1}${p2}`;
  const checksum = computeCrockfordChecksum(body);
  return `${prefix}-${p1}-${p2}${checksum}`;
}

/**
 * Validate a formatted reference code and its checksum.
 */
export function validateOrderReferenceCode(code: string, prefix = 'SP'): boolean {
  if (!code || typeof code !== 'string') return false;
  const parts = code.toUpperCase().trim().split('-');
  if (parts.length !== 3) return false;
  if (parts[0] !== prefix) return false;

  const p1 = parts[1]!;
  const rest = parts[2]!;
  if (p1.length !== 4 || rest.length !== 5) return false;

  const p2 = rest.slice(0, 4);
  const check = rest.slice(4);

  const body = `${p1}${p2}`;
  try {
    const expectedChecksum = computeCrockfordChecksum(body);
    return check === expectedChecksum;
  } catch {
    return false;
  }
}
