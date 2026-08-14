import { describe, expect, it } from 'vitest';
import {
  API_SCOPES,
  SCOPE_DESCRIPTION_KEYS,
  hasScope,
  isApiScope,
  normalizeScopes,
} from './scopes';

describe('isApiScope', () => {
  it('accepts every declared scope', () => {
    for (const s of API_SCOPES) expect(isApiScope(s)).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isApiScope('messages:delete')).toBe(false);
    expect(isApiScope('')).toBe(false);
    expect(isApiScope(null)).toBe(false);
    expect(isApiScope(42)).toBe(false);
  });
});

describe('normalizeScopes', () => {
  it('passes a valid list through, de-duplicated', () => {
    expect(
      normalizeScopes(['messages:send', 'messages:send', 'contacts:read'])
    ).toEqual(['messages:send', 'contacts:read']);
  });

  it('treats an empty array as valid (key with no scopes)', () => {
    expect(normalizeScopes([])).toEqual([]);
  });

  it('returns null if any entry is not a known scope', () => {
    expect(normalizeScopes(['messages:send', 'bogus'])).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(normalizeScopes('messages:send')).toBeNull();
    expect(normalizeScopes(undefined)).toBeNull();
  });
});

describe('hasScope', () => {
  it('is true when the scope is present', () => {
    expect(hasScope(['messages:send', 'contacts:read'], 'contacts:read')).toBe(
      true
    );
  });

  it('is false when the scope is absent or the list is empty', () => {
    expect(hasScope(['messages:send'], 'contacts:read')).toBe(false);
    expect(hasScope([], 'messages:send')).toBe(false);
  });
});

describe('SCOPE_DESCRIPTION_KEYS', () => {
  // Descriptions moved into the message catalogue
  // (Settings.apiKeys.scopes.*), so this asserts the key mapping rather
  // than the English sentence it used to hold.
  it('has a catalogue key for every scope', () => {
    for (const s of API_SCOPES) {
      expect(SCOPE_DESCRIPTION_KEYS[s]).toBeTruthy();
    }
  });

  it('maps to plain leaf keys, not dotted paths or wire ids', () => {
    for (const s of API_SCOPES) {
      expect(SCOPE_DESCRIPTION_KEYS[s]).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });
});
