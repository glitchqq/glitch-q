/* Glitch Q — the customer's invoice, drawn on his own device.
   The artwork (assets/invoice-bg.jpg) is the owner's own design; this file writes the order's data into its boxes and, when an order has
   more lines than the artwork has rows, repeats a row so the table grows and everything below it moves down.
   Everything comes from the customer's OWN order document (the rules let him read it); the delivered gift codes are never drawn.
   Download as PNG, or as a real PDF (a one-page PDF around the picture — no library). The e-mail copy is built by the Worker. */
const GQInv = (() => {
  const W = 1024, H = 1536, S = 1.5;                               // template size, and the drawing scale (output 1536 px wide)
  const ROW0 = 772, ROWH = 53.25, ROWS = 5, COLS = [34, 338, 507, 632, 821, 990], TAIL = ROW0 + 4 * ROWH;   // TAIL = where the template's 5th (last) row starts: the cut is made on a row line, so the seam never shows
  const FIELD = { id: [155, 500, 291, 47], date: [155, 598, 291, 47], cust: [609, 500, 339, 47], mail: [609, 598, 339, 47] };
  const BOX = { pay: [355, 1108, 223, 48], stat: [355, 1181, 223, 47], deliv: [703, 1180, 265, 48] };
  const PAY = { baridimob: 'BaridiMob', hand: 'Cash — hand delivery' };
  const FONT = '"Kookies","Chakra Petch","Segoe UI",Tahoma,Arial,sans-serif';
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const dzd = n => Number(n).toLocaleString('en-US') + ' DZD';
  const maskMail = e => { const s = String(e || ''), at = s.lastIndexOf('@'); return at < 1 ? '' : s.slice(0, Math.min(2, at)) + '***' + s.slice(at); };
  const maskTel = p => { const d = String(p || '').replace(/\D/g, ''); return d.length < 4 ? '' : '*'.repeat(Math.max(3, d.length - 3)) + d.slice(-3); };
  const rude = s => { try { return typeof NF !== 'undefined' && NF.bad(s); } catch (e) { return false; } };

  /* the invoice's data, from an order document (+ the catalogue for the region and the customer's own name/e-mail) */
  function data(id, o, ctx) {
    ctx = ctx || {};
    const prods = Array.isArray(ctx.products) ? ctx.products : [];
    let lines = (Array.isArray(o.items) ? o.items : []).slice(0, 40).map(l => {
      const p = prods.find(x => String(x.id) === String(l.id)) || {};
      const qty = Math.max(1, Math.floor(Number(l.qty) || 1)), unit = Math.max(0, Math.floor(Number(l.unitDZD) || 0));
      return { name: str(l.name, 80) || '—', region: str(p.sub, 40) || '—', qty, unit, total: qty * unit };
    });
    const total = Math.max(0, Math.floor(Number(o.totalDZD) || 0));
    if (!lines.length) lines = [{ name: str(o.product, 80) || '—', region: '—', qty: 1, unit: total, total }];   // an old order that has no item list
    let customer = str(ctx.customer, 80);
    if (!customer || rude(customer)) customer = 'Customer';
    const contact = str(o.receiveContact, 254);
    return {
      id: str(id, 40), date: str(o.date, 10), customer, email: str(ctx.email || o.accountEmail, 254), lines,
      discount: Math.max(0, Math.floor(Number(o.discountDZD) || 0)), coupon: str(o.coupon, 40), total,
      pay: PAY[o.paymentMethod] || '—', status: o.status === 'done' ? 'PAID' : '—',
      delivery: o.receiveMethod === 'email' ? 'Email · ' + maskMail(contact) : (o.paymentMethod === 'hand' ? 'Hand delivery · Tlemcen' : 'Phone · ' + maskTel(contact)),
    };
  }

  let _tpl = null;
  const template = () => _tpl || (_tpl = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => { _tpl = null; rej(new Error('template')); }; i.src = 'assets/invoice-bg.jpg'; }));

  function fitFont(c, text, maxW, size, min, weight) {
    let s = size;
    for (; s > min; s -= 0.5) { c.font = `${weight} ${s}px ${FONT}`; if (c.measureText(text).width <= maxW) return s; }
    return min;
  }
  const isAr = s => /[؀-ۿ]/.test(s);
  function put(c, text, x, y, o) {                                       // one line, shrunk (then cut with …) to fit
    o = o || {}; text = String(text);
    const sz = fitFont(c, text, o.w || 9999, o.size || 20, o.min || 11, o.weight || 600);
    c.font = `${o.weight || 600} ${sz}px ${FONT}`;
    let t = text;
    if (o.w && c.measureText(t).width > o.w) { while (t.length > 1 && c.measureText(t + '…').width > o.w) t = t.slice(0, -1); t += '…'; }
    c.fillStyle = o.color || '#f1f1f4'; c.textAlign = o.align || 'left'; c.textBaseline = 'middle'; c.direction = isAr(t) ? 'rtl' : 'ltr';
    c.fillText(t, x, y);
  }
  function wrap2(c, text, w, size, weight) {                              // up to two lines; the second is cut with … if still too long
    c.font = `${weight} ${size}px ${FONT}`;
    if (c.measureText(text).width <= w) return [text];
    const words = text.split(' '); let a = '', i = 0;
    for (; i < words.length; i++) { const n = a ? a + ' ' + words[i] : words[i]; if (c.measureText(n).width > w && a) break; a = n; }
    let b = words.slice(i).join(' ');
    if (!b) return [a];
    while (b.length > 1 && c.measureText(b).width > w) b = b.slice(0, -2) + '…';
    return [a, b];
  }

  async function draw(inv) {
    const img = await template();
    try { await document.fonts.load('600 20px Kookies', 'Aأ'); await document.fonts.load('700 20px Kookies', 'Aأ'); } catch (e) { /* the fallback font is fine */ }
    const rows = inv.lines.map(l => ({ k: 'i', l }));
    if (inv.discount > 0) rows.push({ k: 'd' });
    rows.push({ k: 't' });
    const extra = Math.max(0, rows.length - ROWS) * ROWH;
    const cv = document.createElement('canvas'); cv.width = Math.round(W * S); cv.height = Math.round((H + extra) * S);
    const c = cv.getContext('2d'); c.scale(S, S); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (!extra) c.drawImage(img, 0, 0, W, H);
    else {
      c.drawImage(img, 0, 0, W, TAIL, 0, 0, W, TAIL);                                  // header, info panel, table head and its first four rows
      for (let i = 4; i < rows.length - 1; i++) c.drawImage(img, 0, ROW0, W, Math.ceil(ROWH), 0, ROW0 + i * ROWH, W, Math.ceil(ROWH));   // repeated rows
      c.drawImage(img, 0, TAIL, W, H - TAIL, 0, TAIL + extra, W, H - TAIL);           // last row, table frame, payment, delivery, support, footer
    }
    const box = (b, dy) => [b[0] + 14, b[1] + (dy || 0) + b[3] / 2, b[2] - 28];
    let [x, y, w] = box(FIELD.id); put(c, inv.id, x, y, { w, size: 19, min: 11, weight: 600 });
    [x, y, w] = box(FIELD.date); put(c, inv.date, x, y, { w, size: 22 });
    [x, y, w] = box(FIELD.cust); put(c, inv.customer, x, y, { w, size: 23, min: 12 });
    [x, y, w] = box(FIELD.mail); put(c, inv.email, x, y, { w, size: 21, min: 11 });
    rows.forEach((r, i) => {
      const cy = ROW0 + i * ROWH + ROWH / 2, mid = j => (COLS[j] + COLS[j + 1]) / 2, cw = j => COLS[j + 1] - COLS[j] - 16;
      if (r.k === 'i') {
        const l = r.l, ls = wrap2(c, l.name, cw(0) - 6, 16, 600);
        ls.forEach((t, n) => put(c, t, COLS[0] + 14, cy + (ls.length === 1 ? 0 : (n ? 10 : -10)), { w: cw(0) - 6, size: 16, min: 11 }));
        put(c, l.region, mid(1), cy, { w: cw(1), size: 16, align: 'center', color: '#d8d8e0' });
        put(c, String(l.qty), mid(2), cy, { w: cw(2), size: 18, align: 'center' });
        put(c, dzd(l.unit), mid(3), cy, { w: cw(3), size: 16, align: 'center', color: '#d8d8e0' });
        put(c, dzd(l.total), mid(4), cy, { w: cw(4), size: 17, align: 'center', weight: 700 });
      } else if (r.k === 'd') {
        put(c, 'Discount' + (inv.coupon ? ' (' + inv.coupon + ')' : ''), COLS[0] + 14, cy, { w: cw(0) + cw(1), size: 16, color: '#ffb36b' });
        put(c, '− ' + dzd(inv.discount), mid(4), cy, { w: cw(4), size: 17, align: 'center', weight: 700, color: '#ffb36b' });
      } else {
        c.fillStyle = 'rgba(225,6,44,.22)'; c.fillRect(COLS[0] + 2, ROW0 + i * ROWH + 3, COLS[5] - COLS[0] - 4, ROWH - 6);
        put(c, 'TOTAL', COLS[0] + 14, cy, { size: 20, weight: 700, color: '#ffffff' });
        put(c, dzd(inv.total), mid(4), cy, { w: cw(4) + 8, size: 20, align: 'center', weight: 700, color: '#ff5470' });
      }
    });
    [x, y, w] = box(BOX.pay, extra); put(c, inv.pay, x, y, { w, size: 19, min: 11 });
    [x, y, w] = box(BOX.stat, extra);
    const paid = inv.status === 'PAID';
    if (paid) { c.strokeStyle = '#35e08a'; c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 7, y + 7); c.lineTo(x + 20, y - 8); c.stroke(); }
    put(c, inv.status, x + (paid ? 30 : 0), y, { w: w - (paid ? 30 : 0), size: 21, weight: 700, color: paid ? '#35e08a' : '#f1f1f4' });
    const d = BOX.deliv, dl = wrap2(c, inv.delivery, d[2] - 28, 17, 600), dy = d[1] + extra + d[3] / 2;
    dl.forEach((t, n) => put(c, t, d[0] + 14, dy + (dl.length === 1 ? 0 : (n ? 10 : -10)), { w: d[2] - 28, size: 17, min: 11 }));
    return cv;
  }

  const blob = (cv, type, q) => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), type, q));
  const png = cv => blob(cv, 'image/png');

  /* a one-page PDF whose page is the invoice picture (JPEG, DCTDecode) */
  async function pdf(cv, title) {
    const jpg = new Uint8Array(await (await blob(cv, 'image/jpeg', 0.93)).arrayBuffer());
    const pw = 595, ph = Math.round(pw * cv.height / cv.width * 100) / 100, enc = new TextEncoder(), parts = [], offs = [];
    let len = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body, stream) => { offs[n] = len; add(`${n} 0 obj\n${body}\n`); if (stream) { add('stream\n'); add(stream); add('\nendstream\n'); } add('endobj\n'); };
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    add('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    obj(4, `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
    obj(5, `<< /Length ${content.length} >>`, content);
    obj(6, `<< /Title (${String(title || 'Invoice').replace(/[^A-Za-z0-9 _.\-#]/g, '')}) /Producer (Glitch Q) >>`);
    const xref = len;
    add(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  function save(b, name) {
    const a = document.createElement('a'), u = URL.createObjectURL(b);
    a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 15000);
  }
  return { data, draw, png, pdf, save };
})();
