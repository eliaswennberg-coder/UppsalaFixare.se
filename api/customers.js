import { handler, send, body, requireUser, db, parse, normPhone, newId, HttpError } from './_lib.js';

const PLANS = ['Standard', 'Premium', 'Flex', 'Skräddarsytt', 'Period', 'Trädgård', 'Övrigt'];

function clean(input, old = {}) {
  const s = (v, n = 200) => String(v ?? '').trim().slice(0, n);
  const c = {
    ...old,
    name: s(input.name, 80),
    phone: normPhone(input.phone),
    address: s(input.address, 120),
    area: s(input.area, 40),
    plan: PLANS.includes(input.plan) ? input.plan : 'Övrigt',
    size: s(input.size, 40),
    notes: s(input.notes, 600),
    order: Number.isFinite(+input.order) ? +input.order : 100,
    active: input.active !== false,
    sms: input.sms !== false,
  };
  if (!c.name) throw new HttpError(400, 'Namn saknas');
  if (!c.address) throw new HttpError(400, 'Adress saknas');
  return c;
}

export default handler(async (req, res) => {
  const user = requireUser(req);
  const r = await db();

  if (req.method === 'GET') {
    const id = req.query?.id;
    if (id) {
      const c = parse(await r.hget('customers', id));
      if (!c) throw new HttpError(404, 'Kunden finns inte');
      const hist = Object.values((await r.hgetall('hist:' + id)) || {}).map(parse)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return send(res, 200, { customer: c, history: hist });
    }
    const all = Object.values((await r.hgetall('customers')) || {}).map(parse);
    return send(res, 200, { customers: all });
  }

  if (req.method === 'POST') {
    const b = body(req);
    const id = b.id || newId();
    const old = b.id ? parse(await r.hget('customers', id)) : null;
    if (b.id && !old) throw new HttpError(404, 'Kunden finns inte');
    const c = clean(b, old || { id, createdAt: new Date().toISOString(), createdBy: user });
    c.id = id;
    c.updatedAt = new Date().toISOString();
    c.updatedBy = user;
    await r.hset('customers', { [id]: JSON.stringify(c) });
    return send(res, 200, { customer: c });
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) throw new HttpError(400, 'id saknas');
    await r.hdel('customers', id);
    return send(res, 200, { ok: true });
  }

  throw new HttpError(405, 'Fel metod');
});
