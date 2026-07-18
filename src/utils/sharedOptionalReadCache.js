export function createSharedOptionalReadCache(
  request,
  getIdentity = () => "anonymous",
  ttlMs = 1500
) {
  const entries = new Map();

  const buildKey = (path) => `${getIdentity() || "anonymous"}:${path}`;

  const read = async (path, { force = false } = {}) => {
    const key = buildKey(path);
    const now = Date.now();
    const cached = entries.get(key);

    if (!force && cached && cached.expiresAt > now) {
      return cached.promise;
    }

    const promise = Promise.resolve()
      .then(() => request(path))
      .then((data) => ({ ok: true, status: 200, data }))
      .catch((error) => {
        if (error?.status === 404) {
          return { ok: false, status: 404, data: null };
        }
        entries.delete(key);
        throw error;
      });

    entries.set(key, { promise, expiresAt: now + ttlMs });
    return promise;
  };

  const invalidate = (path = null) => {
    for (const key of entries.keys()) {
      if (!path || key.endsWith(`:${path}`)) {
        entries.delete(key);
      }
    }
  };

  return { read, invalidate };
}
