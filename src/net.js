// Classificação das requisições de rastreamento observadas pelo background.
// Separado do service worker para ser testável em Node.

export const URL_FILTERS = [
  '*://*.googletagmanager.com/*', '*://*.google-analytics.com/*', '*://*.analytics.google.com/*',
  '*://www.google.com/ccm/*', '*://www.google.com/rmkt/*', '*://www.google.com/pagead/*', '*://stats.g.doubleclick.net/*',
  '*://*.facebook.com/tr*', '*://*.facebook.com/tr/*', '*://*.googleadservices.com/*',
  '*://googleads.g.doubleclick.net/*', '*://*.clarity.ms/*', '*://*.hotjar.com/*', '*://*.hotjar.io/*', '*://analytics.tiktok.com/*',
];

const PATTERNS = [
  { kind: 'gtm', re: /googletagmanager\.com\/gtm\.js/i },
  { kind: 'gtag', re: /googletagmanager\.com\/gtag\/js/i },
  { kind: 'ga4', re: /(google-analytics\.com|analytics\.google\.com|googletagmanager\.com|stats\.g\.doubleclick\.net)\/g\/collect/i },
  { kind: 'ga4', re: /google-analytics\.com\/(j\/)?collect/i },
  { kind: 'ccm', re: /google\.com\/ccm\/collect/i },
  { kind: 'meta', re: /facebook\.com\/tr\/?(\?|$)/i },
  { kind: 'ads', re: /googleadservices\.com\/pagead\/conversion/i },
  { kind: 'ads', re: /google\.com\/pagead\/1p-conversion/i },
  { kind: 'ads', re: /google\.com\/rmkt\/collect\/\d+/i },
  { kind: 'ads', re: /googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion/i },
  { kind: 'clarity', re: /clarity\.ms\//i },
  { kind: 'hotjar', re: /hotjar\.(com|io)\//i },
  { kind: 'tiktok', re: /analytics\.tiktok\.com/i },
];

export function bodyText(details) {
  try {
    const raw = details.requestBody && details.requestBody.raw;
    if (raw && raw.length) {
      const dec = new TextDecoder();
      return raw.map((r) => (r.bytes ? dec.decode(r.bytes) : '')).join('');
    }
    const fd = details.requestBody && details.requestBody.formData;
    if (fd) return Object.entries(fd).map(([k, v]) => `${k}=${encodeURIComponent(v[0])}`).join('&');
  } catch { /* corpo binário */ }
  return '';
}

// Devolve zero ou mais eventos para uma requisição. A sonda de bloqueio do
// Track Eye (te_probe=1) nunca vira evento.
export function classify(details) {
  const url = details.url || '';
  if (/[?&]te_probe=1/.test(url)) return [];
  const p = PATTERNS.find((x) => x.re.test(url));
  if (!p) return [];
  let u;
  try { u = new URL(url); } catch { return []; }
  const q = u.searchParams;
  const base = { t: details.timeStamp || Date.now(), kind: p.kind, url: url.slice(0, 300), frameId: details.frameId, method: details.method, params: {} };
  if (p.kind === 'gtm' || p.kind === 'gtag') return [{ ...base, params: { id: q.get('id') || '' } }];
  if (p.kind === 'meta') return [{ ...base, params: { id: q.get('id') || '', ev: q.get('ev') || '', dl: q.get('dl') || '' } }];
  if (p.kind === 'ads') {
    const m = u.pathname.match(/conversion\/(\d+)/) || u.pathname.match(/viewthroughconversion\/(\d+)/) || u.pathname.match(/rmkt\/collect\/(\d+)/);
    const remarketing = /rmkt\/collect|viewthroughconversion/.test(u.pathname);
    return [{ ...base, params: { id: m ? 'AW-' + m[1] : '', label: q.get('label') || '', remarketing } }];
  }
  if (p.kind === 'clarity') {
    const m = u.pathname.match(/\/tag\/([a-z0-9]+)/i);
    return [{ ...base, params: { id: m ? m[1] : '' } }];
  }
  if (p.kind === 'ga4' || p.kind === 'ccm') {
    const tid = q.get('tid') || '';
    const dl = q.get('dl') || '';
    // ccm/collect carrega hits do Google Ads (tid AW-) e às vezes do GA4 (tid G-)
    const kind = p.kind === 'ccm' ? (/^G-/.test(tid) ? 'ga4' : 'ads') : 'ga4';
    const body = bodyText(details);
    const events = [];
    const mk = (en) => ({ ...base, kind, params: { tid, en, dl, id: kind === 'ads' ? tid : undefined, remarketing: kind === 'ads' && !/conversion/i.test(en), bodyLen: body.length } });
    if (q.get('en')) events.push(mk(q.get('en')));
    // Lote: cada linha do corpo é um evento (en=...&ep.x=...)
    if (body) for (const line of body.split('\n')) {
      const lp = new URLSearchParams(line.trim());
      if (lp.get('en')) events.push(mk(lp.get('en')));
    }
    if (!events.length) events.push(mk(''));
    return events;
  }
  return [{ ...base }];
}
