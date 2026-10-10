// Server-only Express middleware. Attach directly before the real submission
// handler, never as a standalone verification endpoint or on page GET requests.
export function createSubmissionProtection({
  secret = process.env.TURNSTILE_SECRET_KEY,
  hostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES || '').split(',').map(value => value.trim()).filter(Boolean),
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const attempts = new Map();
  const windowMs = 10 * 60 * 1000;
  const limit = 10;

  return async function protectSubmission(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ error: 'Method not allowed.' });
    if (!secret || !hostnames.length) return res.status(503).json({ error: 'Submissions are temporarily unavailable.' });

    // Express defaults to the socket address. Configure trust proxy only for
    // the actual trusted hosting proxy; never trust arbitrary forwarded headers.
    const ip = req.ip;
    if (!ip) return res.status(503).json({ error: 'Submissions are temporarily unavailable.' });
    const time = now();
    for (const [key, entry] of attempts) if (entry.expires <= time) attempts.delete(key);
    let entry = attempts.get(ip);
    if (!entry) {
      // Bound memory without evicting active limits under high-cardinality traffic.
      if (attempts.size >= 10000) return res.status(503).json({ error: 'Please try again later.' });
      entry = { count: 0, expires: time + windowMs };
      attempts.set(ip, entry);
    }
    if (++entry.count > limit) {
      return res.status(429).set('Retry-After', String(Math.ceil((entry.expires - time) / 1000)))
        .json({ error: 'Too many requests. Please try again later.' });
    }

    const token = req.get?.('X-Turnstile-Token') || req.body?.['cf-turnstile-response'];
    if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
      return res.status(400).json({ error: 'Please complete verification and try again.' });
    }
    try {
      const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Verification unavailable');
      const result = await response.json();
      if (result.success !== true || !hostnames.includes(result.hostname) || result.action !== 'form_submit') {
        return res.status(403).json({ error: 'Verification failed. Please try again.' });
      }
    } catch {
      return res.status(503).json({ error: 'Verification is temporarily unavailable. Please try again.' });
    }
    // The real email/upload/storage side effect must run ONLY after this point.
    return next();
  };
}
