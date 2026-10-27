// Webhook från 46elks när en kund svarar på firmans nummer.
import { handler, body, db, parse, normPhone, inboundKey, sendText, newId } from './_lib.js';

export default handler(async (req, res) => {
  const ok = () => { res.statusCode = 200; res.setHeader('Content-Type', 'text/plain'); res.end(''); };
  if (req.method !== 'POST' || req.query?.k !== inboundKey()) { res.statusCode = 403; return res.end(''); }

  const b = body(req);
  const from = normPhone(b.from);
  const message = String(b.message || '').slice(0, 1000);
  const image = typeof b.image === 'string' ? b.image : (b.images ? String(Object.values(parse(b.images) || {})[0] || '') : '');
  const r = await db();

  const customers = Object.values((await r.hgetall('customers')) || {}).map(parse);
  const c = customers.find((x) => x.phone && x.phone === from);

  const entry = {
    id: newId(), dir: 'in', from, customerId: c?.id || null, name: c?.name || null,
    address: c?.address || null, message, image: image || null, at: new Date().toISOString(),
  };
  await r.lpush('inbox', JSON.stringify(entry));
  await r.ltrim('inbox', 0, 299);

  const owner = process.env.OWNER_PHONE;
  if (owner && normPhone(owner) !== from) {
    const who = c ? `${c.name} (${c.address})` : from;
    await sendText(owner, `Svar från ${who}: ${message || '[bild]'}`.slice(0, 600));
  }
  ok();
});
