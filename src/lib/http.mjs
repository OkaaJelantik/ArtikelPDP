// HTTP client minimal: streaming + early-abort supaya halaman 7MB tidak diunduh penuh.
export const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// berhenti hanya kalau keempat field sudah utuh di buffer (author & tanggal sudah tertutup)
const READY = [
  /<h1 class="post-title"/,
  /<h2 class="post-summary"/,
  /item-meta-author[\s\S]{0,600}?<\/a>/,
  /item-meta-date[\s\S]{0,1500}?<\/div>/,
];
const isReady = (html) => {
  const h = html.indexOf('</head>') + 1;
  if (!h) return false;
  const body = html.slice(h);
  return READY.every((re) => re.test(body));
};

export async function fetchHtml(url, { maxBytes = 512_000, timeoutMs = 90_000, earlyStop = false } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
      signal: ac.signal,
      redirect: 'follow',
    });
    if (!res.ok || !res.body) {
      const html = res.body ? await res.text() : '';
      return { status: res.status, html: html.slice(0, maxBytes), bytes: html.length, ms: Date.now() - t0, truncated: false };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let html = '', bytes = 0, truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += dec.decode(value, { stream: true });
      if ((earlyStop && isReady(html)) || html.length >= maxBytes) { truncated = true; break; }
    }
    if (truncated) { try { await reader.cancel(); } catch {} }
    return { status: res.status, html, bytes, ms: Date.now() - t0, truncated };
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pool sederhana: jalankan fn untuk tiap item dengan batas konkurensi
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: e.message }; }
    }
  }));
  return out;
}
