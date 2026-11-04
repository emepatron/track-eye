// chrome.* falso para abrir o painel num navegador comum e conferir o visual.
// Carregado só quando chrome.runtime.id não existe (fora da extensão).
import { trackEyeScan } from '../scanner.js';

const mem = {};
const storage = {
  get: async (key) => (typeof key === 'string' ? { [key]: mem[key] } : { ...mem }),
  set: async (obj) => { Object.assign(mem, obj); },
  remove: async () => {},
};
const listeners = () => ({ addListener() {} });

// Página fictícia para a varredura de demonstração.
const demoHtml = `<!doctype html><html><head><title>LP Demonstração — Track Eye</title><meta name="viewport" content="width=device-width">
<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-DEMO123');</script>
<script>fbq('init','1234567890123456');fbq('track','PageView');</script></head>
<body><h1>Sua clínica cheia em 30 dias</h1>
<a href="https://wa.me/5535999990000?text=Ol%C3%A1%2C%20vim%20pela%20campanha">Falar no WhatsApp</a>
<a href="https://wa.me/5531988887777">WhatsApp rodapé</a>
<a class="btn" href="https://pay.hotmart.com/A1B2C3D4?src=lp&sck=instagram">Quero garantir minha vaga</a>
<a class="btn" href="https://pay.hotmart.com/A1B2C3D4">Comprar agora</a>
<form id="lead-form" class="elementor-form" action="https://hooks.n8n.cloud/webhook/x"><input name="nome"><input type="email" name="email"><input type="tel" name="whatsapp"><input type="hidden" name="utm_source"><button type="submit">Quero agendar</button></form></body></html>`;

const demoScan = () => {
  const doc = new DOMParser().parseFromString(demoHtml, 'text/html');
  const win = {
    document: doc,
    location: new URL('https://lp.clinicaexemplo.com.br/oferta?utm_source=instagram&utm_campaign=novembro'),
    getComputedStyle: () => ({ position: 'static', display: 'block', fontFamily: 'Inter' }),
    scrollY: 0,
    performance: { getEntriesByType: (t) => (t === 'navigation' ? [{ responseStart: 320, domContentLoadedEventEnd: 1400, loadEventEnd: 2900, transferSize: 420000, nextHopProtocol: 'h2' }] : []) },
    __trackEye: { dataLayer: [{ t: 1, args: [{ event: 'gtm.js' }] }], fbq: [{ t: 1, args: ['init', '1234567890123456'] }, { t: 2, args: ['track', 'PageView'] }], gtag: [], errors: [{ message: 'Uncaught TypeError: x is not a function', source: 'app.js:12' }], forms: [] },
    google_tag_manager: { 'GTM-DEMO123': {} },
    fbq: Object.assign(() => {}, { getState: () => ({ pixels: [{ id: '1234567890123456' }] }) }),
  };
  return trackEyeScan(win);
};
const now = Date.now();
const demoEvents = [
  { t: now - 3000, kind: 'gtm', url: 'https://www.googletagmanager.com/gtm.js?id=GTM-DEMO123', params: { id: 'GTM-DEMO123' } },
  { t: now - 2800, kind: 'meta', url: 'https://www.facebook.com/tr?id=1234567890123456&ev=PageView', params: { id: '1234567890123456', ev: 'PageView' } },
  { t: now - 2700, kind: 'meta', url: 'https://www.facebook.com/tr?id=1234567890123456&ev=PageView', params: { id: '1234567890123456', ev: 'PageView' } },
];
const demoNavs = [{ t: now - 3500, url: 'https://lp.clinicaexemplo.com.br/oferta?utm_source=instagram&utm_campaign=novembro', type: 'link' }];

const tab = { id: 1, windowId: 1, url: 'https://lp.clinicaexemplo.com.br/oferta?utm_source=instagram&utm_campaign=novembro', title: 'Clínica Demo — Agende sua avaliação' };

globalThis.chrome = {
  runtime: {
    id: 'mock',
    lastError: null,
    getManifest: () => ({ version: '0.1.0' }),
    sendMessage(msg, cb) {
      const reply = (r) => setTimeout(() => cb(r), msg.type === 'scan' ? 500 : 50);
      if (msg.type === 'scan') return reply({ scan: demoScan(), events: demoEvents, navs: demoNavs });
      if (msg.type === 'events' || msg.type === 'afterTest') return reply({ events: [...demoEvents, { t: Date.now(), kind: 'meta', url: '', params: { id: '1234567890123456', ev: 'Lead' } }], navs: [...demoNavs, { t: Date.now(), url: 'https://lp.clinicaexemplo.com.br/obrigado' }], dataLayerEvents: ['form_submit'] });
      if (msg.type === 'startTest') return reply({ ok: true, startedAt: Date.now(), url: tab.url, filled: [{ name: 'nome', value: 'TESTE TRACK EYE' }, { name: 'email', value: msg.data.email }], submittedVia: 'clique no botão "Quero agendar"' });
      if (msg.type === 'capture') return reply({ dataUrl: 'data:image/png;base64,' });
      if (msg.type === 'clickBuy') { demoEvents.push({ t: Date.now() + 1500, kind: 'meta', url: '', params: { id: '1234567890123456', ev: 'InitiateCheckout' } }); demoNavs.push({ t: Date.now() + 2000, url: 'https://pay.hotmart.com/A1B2C3?src=lp&sck=instagram' }); return reply({ ok: true, startedAt: Date.now(), url: tab.url, href: msg.href, text: 'Quero garantir minha vaga' }); }
      return reply({ ok: true });
    },
  },
  storage: { local: storage, session: storage },
  tabs: {
    query: async () => [tab],
    reload: async () => {},
    update: async (id, props) => { if (props && props.url) tab.url = props.url; return tab; },
    create: async (props) => { window.open(props.url, '_blank'); return { id: 2, url: props.url }; },
    onActivated: listeners(),
    onUpdated: listeners(),
  },
};
mem.clients = [
  { id: 'c1', name: 'Clínica Demo', domains: ['clinicaexemplo.com.br'], whatsapp: ['35999990000'], notes: 'Pixel oficial 1234567890123456', updatedAt: now },
  { id: 'c2', name: 'Loja Exemplo', domains: ['lojaexemplo.com.br'], whatsapp: ['35988880000'], notes: '', updatedAt: now },
];
mem.settings = { analyst: 'Pedro', testEmail: '', testPhone: '' };
