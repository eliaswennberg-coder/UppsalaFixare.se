import {
  handler, send, body, requireUser, db, parse, today, clock, validDate,
  settings, fill, sendMms, sendText, smsStatus, HttpError,
} from './_lib.js';

export const config = { maxDuration: 30 };

async function storePhoto(dataUrl, customerId, date) {
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Bilden kunde inte läsas');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_500_000) throw new HttpError(413, 'Bilden är för stor');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { url: null, note: 'Bildlagring ej kopplad' };
  const { put } = await import('@vercel/blob');
  const blob = await put(`klart/${date}/${customerId}.${m[1] === 'png' ? 'png' : 'jpg'}`, buf, {
    access: 'public', contentType: 'image/' + m[1], addRandomSuffix: true,
  });
  return { url: blob.url };
}

export default handler(async (req, res) => {
  const user = requireUser(req);
  const r = await db();

  if (req.method === 'DELETE') {
    const { customerId, date } = req.query || {};
    if (!customerId || !validDate(date)) throw new HttpError(400, 'Saknar kund eller datum');
    await r.hdel('day:' + date, customerId);
    await r.hdel('hist:' + customerId, date);
    return send(res, 200, { ok: true });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Fel metod');

  const b = body(req);
  const date = validDate(b.date) ? b.date : today();
  const c = parse(await r.hget('customers', b.customerId));
  if (!c) throw new HttpError(404, 'Kunden finns inte');

  const existing = parse(await r.hget('day:' + date, c.id));
  if (existing && !b.replace) return send(res, 200, { visit: existing, already: true });

  const now = new Date();
  const time = clock(now);
  const visit = { customerId: c.id, date, at: now.toISOString(), time, by: user, photo: null, note: String(b.note || '').slice(0, 300) };

  let mmsImage = null;
  if (b.photo) {
    try {
      const p = await storePhoto(b.photo, c.id, date);
      visit.photo = p.url;
      mmsImage = p.url || b.photo;
      if (p.note) visit.photoNote = p.note;
    } catch (e) {
      if (e.status === 400 || e.status === 413) throw e;
      console.error('blob', e);
      visit.photoNote = 'Bilden kunde inte sparas: ' + e.message;
      mmsImage = b.photo;
    }
  }

  if (b.sms && c.phone) {
    const s = await settings();
    const text = fill(mmsImage ? s.templatePhoto : s.templateNoPhoto, c, time);
    const result = mmsImage ? await sendMms(c.phone, text, mmsImage) : await sendText(c.phone, text);
    visit.sms = { ...smsStatus(result), to: c.phone, text, kind: mmsImage ? 'mms' : 'sms' };
  } else {
    visit.sms = { status: 'off', note: c.phone ? 'Inget sms valt' : 'Inget telefonnummer' };
  }

  const json = JSON.stringify(visit);
  await r.hset('day:' + date, { [c.id]: json });
  await r.hset('hist:' + c.id, { [date]: json });
  send(res, 200, { visit });
});
