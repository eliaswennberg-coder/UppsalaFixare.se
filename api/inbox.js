import { handler, send, body, requireUser, db, parse, sendText, smsStatus, normPhone, newId, HttpError } from './_lib.js';

export default handler(async (req, res) => {
  const user = requireUser(req);
  const r = await db();

  if (req.method === 'GET') {
    const items = ((await r.lrange('inbox', 0, 149)) || []).map(parse);
    const lastRead = (await r.get('inboxRead:' + user)) || '';
    const unread = items.filter((i) => i.dir === 'in' && i.at > lastRead).length;
    return send(res, 200, { items, unread, lastRead });
  }

  if (req.method === 'POST') {
    const b = body(req);
    if (b.action === 'read') {
      await r.set('inboxRead:' + user, new Date().toISOString());
      return send(res, 200, { ok: true });
    }
    if (b.action === 'reply') {
      const to = normPhone(b.to);
      const message = String(b.message || '').trim().slice(0, 600);
      if (!to || !message) throw new HttpError(400, 'Mottagare eller text saknas');
      const result = smsStatus(await sendText(to, message));
      const entry = { id: newId(), dir: 'out', to, by: user, message, at: new Date().toISOString(), sms: result, customerId: b.customerId || null, name: b.name || null };
      await r.lpush('inbox', JSON.stringify(entry));
      await r.ltrim('inbox', 0, 299);
      return send(res, 200, { entry });
    }
  }
  throw new HttpError(405, 'Fel metod');
});
