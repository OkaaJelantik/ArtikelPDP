import * as cheerio from 'cheerio';

// --- locale ID saja ---
export const BASE = 'https://budayabali.com';
export const LOCALE = 'id';
export const HOME = `${BASE}/${LOCALE}`;

const clean = (s) => (s || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const dec = (s) => clean(s)
  .replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

// slug kanonik: path tanpa prefix locale, lowercase
export function slugOf(url) {
  let p = new URL(url, HOME).pathname.replace(/^\/+|\/+$/g, '');
  p = p.replace(new RegExp(`^${LOCALE}/`, 'i'), '');
  return p.toLowerCase();
}

export function parseNav(html) {
  const $ = cheerio.load(html);
  const cats = [];
  const push = (href, label, parent = null) => {
    const raw = new URL(href, HOME);
    if (!raw.pathname.startsWith(`/${LOCALE}`)) return;          // buang link EN
    const slug = slugOf(raw.href);
    if (!slug || cats.some((c) => c.slug === slug)) return;
    cats.push({ slug, label: clean(label), url: raw.href, parent });
  };
  $('li.nav-item-category > a.nav-link[href]').each((_, a) => push($(a).attr('href'), $(a).text()));
  $('a.link-sub-category[href]').each((_, a) => push($(a).attr('href'), $(a).text(), slugOf($(a).attr('href')).split('/')[0]));
  return cats.filter((c) => !/^page\b/.test(c.slug));
}

export function parseList(html, pageUrl) {
  const $ = cheerio.load(html);
  const root = $('.section-page').length ? $('.section-page') : $('main, #content').first();
  const cards = [];
  const seen = new Set();
  root.find('.post-item, .post-item-small, .item').each((_, el) => {
    const a = $(el).find('h3.title a[href], h2.title a[href], h4.title a[href]').first();
    const href = a.attr('href');
    if (!href) return;
    const url = new URL(href, HOME).href;
    if (!new URL(url).pathname.startsWith(`/${LOCALE}`)) return;
    const slug = slugOf(url);
    if (!slug || seen.has(slug) || slug.includes('/')) return;
    seen.add(slug);
    const meta = $(el).find('.post-meta, .small-post-meta').first();
    cards.push({
      url, slug,
      title: dec(a.text()),
      author: clean(meta.find('a.a-username, a[href*="/profile/"]').first().text()) || null,
      dateRaw: clean(meta.find('span').last().text()) || null,
    });
  });
  const pages = $('.pagination a.page-link[href]')
    .map((_, a) => { const m = /[?&]page=(\d+)/.exec($(a).attr('href') || ''); return m ? +m[1] : 0; }).get();
  return { cards, lastPage: pages.length ? Math.max(...pages) : 1, url: pageUrl };
}

const MO = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  mei: '05', agu: '08', ags: '08', okt: '10', des: '12', peb: '02' };
export function isoDate(raw) {
  if (!raw) return null;
  const m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
  if (!m) return null;
  const mm = MO[m[1].toLowerCase()] || '01';
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
}

export function parseArticle(html, url) {
  const $ = cheerio.load(html);
  const authorEl = $('.item-meta-author a').first();
  const dateRaw = clean($('.item-meta-date').first().text()).replace(/^[^0-9A-Za-z]*/, '');
  return {
    url,
    badgeCategory: clean($('.badge-category').first().text()) || clean($('meta[property="article:section"]').attr('content')) || null,
    title: dec($('.post-title').first().text()) || dec($('meta[property="og:title"]').attr('content')),
    summary: dec($('.post-summary').first().text()) || dec($('meta[name="description"]').attr('content')),
    author: clean(authorEl.find('span').first().text() || authorEl.text()) || null,
    authorUrl: authorEl.attr('href') ? new URL(authorEl.attr('href'), HOME).href : null,
    publishedAt: isoDate(dateRaw),
    publishedRaw: dateRaw || null,
  };
}

// kunci topik untuk pencocokan draft vs artikel terbit
export function topicKey(s) {
  return (s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trigrams(s) {
  const k = topicKey(s).replace(/\s/g, '');
  const g = new Set();
  for (let i = 0; i + 3 <= k.length; i++) g.add(k.slice(i, i + 3));
  return g;
}
export function similarity(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
