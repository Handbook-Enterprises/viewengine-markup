import { describe, expect, test } from 'bun:test';
import { parseRoomRef } from './account-mcp';
import { safeNext } from './auth/next';

describe('safeNext', () => {
  test('returns to the OAuth screen the sign-in started from', () => {
    expect(safeNext('/authorize?client_id=x&state=y')).toBe('/authorize?client_id=x&state=y');
  });

  test('refuses anything else, so the cookie is never an open redirect', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext('https://evil.example/authorize?x')).toBeNull();
    expect(safeNext('//evil.example/authorize?x')).toBeNull();
    expect(safeNext('/app')).toBeNull();
  });
});

describe('parseRoomRef', () => {
  test('takes a bare id or a share link', () => {
    expect(parseRoomRef('abc123')).toBe('abc123');
    expect(parseRoomRef('https://markup.viewengine.dev/s/abc123?x=1')).toBe('abc123');
  });

  test('rejects a link with no board in it', () => {
    expect(parseRoomRef('https://markup.viewengine.dev/app')).toBeNull();
    expect(parseRoomRef('  ')).toBeNull();
  });
});
