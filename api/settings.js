import {
  handler, send, body, requireUser, db, settings, hasRedis, elks, elksReady, sendText, smsStatus,
  inboundKey, team, normPhone, HttpError,
} from './_lib.js';

function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
  return `${proto}://${host}`;
}

export default handler(async (req, res) => {
  const user = requireUser(req);
  const r = await db();

  if (req.method === 'GET') {
    return send(res, 200, {
      settings: await settings(),
      status: {
        database: hasRedis() || !process.env.VERCEL,
        photos: !!process.env.BLOB_READ_WRITE_TOKEN,
        elks: elksReady(),
        from: process.env.ELKS_FROM || null,
        owner: process.env.OWNER_PHONE ? normPhone(process.env.OWNER_PHONE) : null,
        team: Object.values(team()),
        repliesConnected: (await r.get('repliesConnected')) || null,
      },
      user,
    });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Fel metod');
  const b = body(req);

  if (b.action === 'save') {
    const s = {
      templatePhoto: String(b.templatePhoto || '').slice(0, 500),
      templateNoPhoto: String(b.templateNoPhoto || '').slice(0, 500),
    };
    if (!s.templatePhoto || !s.templateNoPhoto) throw new HttpError(400, 'Mallarna får inte vara tomma');
    await r.set('settings', JSON.stringify(s));
    return send(res, 200, { settings: s });
  }

  if (b.action === 'test') {
    const to = normPhone(b.to || process.env.OWNER_PHONE);
    if (!to) throw new HttpError(400, 'Inget nummer att testa mot');
    const result = smsStatus(await sendText(to, 'Test från UppsalaFixaren drift-app. Allt fungerar!'));
    return send(res, 200, { to, result });
  }

  if (b.action === 'connect') {
    if (!elksReady()) throw new HttpError(400, '46elks-nycklarna är inte inlagda än');
    const list = await elks('numbers', null, 'GET');
    if (list.error || list.skipped) throw new HttpError(502, '46elks: ' + (list.error || list.skipped));
    const want = normPhone(process.env.ELKS_FROM);
    const num = (list.data || []).find((n) => normPhone(n.number) === want && n.active !== 'no');
    if (!num) throw new HttpError(404, `Hittar inte ${want} bland dina 46elks-nummer`);
    const url = `${baseUrl(req)}/api/inbound?k=${inboundKey()}`;
    const upd = await elks('numbers/' + num.id, { sms_url: url, mms_url: url });
    if (upd.error) throw new HttpError(502, '46elks: ' + upd.error);
    const at = new Date().toISOString();
    await r.set('repliesConnected', at);
    return send(res, 200, { ok: true, number: want, at });
  }

  throw new HttpError(400, 'Okänd åtgärd');
});
