import { handler, send, body, team, makeSession, sessionCookie, currentUser, db, HttpError } from './_lib.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') return send(res, 200, { user: currentUser(req) });

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return send(res, 200, { ok: true });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Fel metod');

  const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
  const r = await db();
  const key = 'login:' + ip;
  const tries = await r.incr(key);
  if (tries === 1) await r.expire(key, 900);
  if (tries > 10) throw new HttpError(429, 'För många försök. Vänta 15 minuter.');

  const pin = String(body(req).pin || '').trim();
  const name = team()[pin];
  if (!name) throw new HttpError(401, 'Fel PIN-kod');

  res.setHeader('Set-Cookie', sessionCookie(makeSession(name), 30 * 86400));
  send(res, 200, { user: name });
});
