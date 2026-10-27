// Kort publik länk till ett klart-foto: /b/<kod> → bilden.
import { handler, db } from './_lib.js';

export default handler(async (req, res) => {
  const code = String(req.query?.c || '');
  const url = /^[A-Za-z0-9_-]{6,16}$/.test(code) ? await (await db()).get('photo:' + code) : null;
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Bilden finns inte.');
  }
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end();
});
