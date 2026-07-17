// SEC-004 (PR 1): el aiLimiter debe devolver 429 tras superar el umbral.
// Test unit (sin BD): levanta un express mínimo con una instancia de aiLimiter
// de `max` bajo y comprueba que permite hasta el límite y luego bloquea con 429.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createAiLimiter, createAuthLimiter } from '../middleware/rateLimiters.js';

// Levanta un app con el middleware dado, hace N peticiones GET a "/" y devuelve
// la lista de códigos de estado. Cierra el servidor al terminar.
async function hitN(middleware, n) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(middleware);
  app.get('/', (_req, res) => res.status(200).json({ ok: true }));

  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();

  try {
    const codes = [];
    for (let i = 0; i < n; i += 1) {
      // Fijamos X-Forwarded-For para que el conteo por IP sea estable entre peticiones.
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { 'X-Forwarded-For': '203.0.113.7' },
      });
      codes.push(res.status);
    }
    return codes;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('aiLimiter permite hasta el máximo y luego responde 429', async () => {
  const limiter = createAiLimiter({ max: 3, windowMs: 60 * 1000 });
  const codes = await hitN(limiter, 5);

  assert.deepEqual(codes.slice(0, 3), [200, 200, 200], 'las 3 primeras deben pasar');
  assert.equal(codes[3], 429, 'la 4ª supera el umbral');
  assert.equal(codes[4], 429, 'la 5ª también');
});

test('authLimiter aplica su propio umbral independiente', async () => {
  const limiter = createAuthLimiter({ max: 2, windowMs: 60 * 1000 });
  const codes = await hitN(limiter, 4);

  assert.deepEqual(codes.slice(0, 2), [200, 200]);
  assert.equal(codes[2], 429);
  assert.equal(codes[3], 429);
});
