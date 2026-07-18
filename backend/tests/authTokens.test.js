// AUTH-001 (PR 3): tests unit (sin BD) de las primitivas de tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// El módulo lee JWT_SECRET/flags en import; fijarlos antes de importar.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-auth001';

const {
  newSessionId,
  signAccessToken,
  newRefreshToken,
  hashRefreshToken,
  sessionIdFromRefreshToken,
} = await import('../utils/authTokens.js');

test('newSessionId genera UUID v4', () => {
  const id = newSessionId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('signAccessToken liga jti y es verificable', () => {
  const jti = newSessionId();
  const token = signAccessToken({ userId: 42, email: 'a@b.c', jti });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.equal(decoded.userId, 42);
  assert.equal(decoded.email, 'a@b.c');
  assert.equal(decoded.jti, jti);
  assert.ok(decoded.exp > decoded.iat, 'tiene expiración');
});

test('newRefreshToken usa formato <sessionId>.<random> y hash sha256', () => {
  const sid = newSessionId();
  const r = newRefreshToken(sid);
  assert.ok(r.token.startsWith(`${sid}.`), 'prefijo = sessionId');
  assert.equal(r.hash, hashRefreshToken(r.token));
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  assert.ok(r.expiresAt instanceof Date && r.expiresAt.getTime() > Date.now());
});

test('sessionIdFromRefreshToken extrae el sessionId y rechaza malformados', () => {
  const sid = newSessionId();
  const r = newRefreshToken(sid);
  assert.equal(sessionIdFromRefreshToken(r.token), sid);
  assert.equal(sessionIdFromRefreshToken('sin-punto'), null);
  assert.equal(sessionIdFromRefreshToken('no-uuid.abc'), null);
  assert.equal(sessionIdFromRefreshToken(null), null);
});

test('dos refresh tokens de la misma sesión difieren (rotación real)', () => {
  const sid = newSessionId();
  const a = newRefreshToken(sid);
  const b = newRefreshToken(sid);
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.hash, b.hash);
});
