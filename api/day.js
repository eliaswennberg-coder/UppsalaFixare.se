import { handler, send, requireUser, db, parse, today, validDate } from './_lib.js';

export default handler(async (req, res) => {
  requireUser(req);
  const date = validDate(req.query?.date) ? req.query.date : today();
  const raw = (await (await db()).hgetall('day:' + date)) || {};
  const visits = {};
  for (const [k, v] of Object.entries(raw)) visits[k] = parse(v);
  send(res, 200, { date, today: today(), visits });
});
