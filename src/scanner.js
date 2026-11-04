// Varredura da página. As funções são autocontidas de propósito: o background
// as injeta no mundo da página (MAIN) com chrome.scripting.executeScript({ func }),
// então não podem depender de nada fora do próprio corpo. Em Node, os testes
// chamam trackEyeScan(window) com um jsdom.
export function trackEyeScan(win) {
  const w = win || window;
  const doc = w.document;
  const loc = w.location;
  const now = Date.now();
  let isTop = true;
  try { isTop = w.top === w; } catch { isTop = false; }

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  const digits = (s) => String(s || '').replace(/\D+/g, '');
  const text = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  const abs = (href) => { try { return new URL(href, loc.href).href; } catch { return String(href || ''); } };

  // Percorre o DOM entrando em shadow roots (widgets de chat vivem lá).
  const allElements = () => {
    const out = [];
    const walk = (root) => {
      const list = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (const el of list) {
        if (out.length > 30000) return;
        out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(doc);
    return out;
  };
  const everything = allElements();
  const matching = (pred) => everything.filter(pred);

  // ---------- Fontes de código: scripts, iframes e HTML ----------
  const scripts = Array.from(doc.scripts || []);
  const srcs = scripts.map((s) => s.src).filter(Boolean);
  const inline = scripts.filter((s) => !s.src).map((s) => s.textContent || '').join('\n');
  const html = (doc.documentElement && doc.documentElement.outerHTML) || '';
  const corpus = srcs.join('\n') + '\n' + inline;
  const iframeEls = matching((el) => el.tagName === 'IFRAME');
  const iframes = iframeEls.map((f) => f.src || '').filter(Boolean);
  const noscriptGtm = html.match(/ns\.html\?id=(GTM-[A-Z0-9]+)/g) || [];

  const match = (re, source = corpus) => uniq(Array.from(source.matchAll(re)).map((m) => m[1]));

  const tags = {
    gtm: {
      code: uniq([...match(/(GTM-[A-Z0-9]{4,10})/g), ...noscriptGtm.map((s) => s.replace(/.*id=/, ''))]),
      runtime: [],
    },
    ga4: { code: match(/\b(G-[A-Z0-9]{6,12})\b/g), runtime: [] },
    meta: { code: match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/g), runtime: [] },
    ads: { code: match(/\b(AW-\d{6,12})\b/g), runtime: [] },
    clarity: { code: uniq([...match(/clarity\.ms\/tag\/([a-z0-9]{6,20})/g), ...match(/["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/g)]), runtime: [] },
    hotjar: { code: uniq([...match(/hjid\s*:\s*(\d{4,10})/g), ...match(/hotjar-(\d{4,10})\.js/g)]), runtime: [] },
    tiktok: { code: match(/sdkid=([A-Z0-9]{10,30})/g), runtime: [] },
  };
  const metaImg = match(/facebook\.com\/tr\?id=(\d{10,20})/g, html);
  tags.meta.code = uniq([...tags.meta.code, ...metaImg]);

  // ---------- Runtime: objetos que as tags criam quando carregam ----------
  const log = w.__trackEye || { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  try {
    const gtmObj = w.google_tag_manager;
    if (gtmObj && typeof gtmObj === 'object') {
      for (const k of Object.keys(gtmObj)) {
        if (/^GTM-/.test(k)) tags.gtm.runtime.push(k);
        if (/^G-/.test(k)) tags.ga4.runtime.push(k);
        if (/^AW-/.test(k)) tags.ads.runtime.push(k);
      }
    }
  } catch { /* objeto pode ser exótico */ }
  for (const call of log.gtag) {
    const [cmd, id] = call.args || [];
    if (cmd === 'config' && typeof id === 'string') {
      if (/^G-/.test(id)) tags.ga4.runtime.push(id);
      if (/^AW-/.test(id)) tags.ads.runtime.push(id);
    }
  }
  for (const call of log.fbq) {
    const [cmd, id] = call.args || [];
    if (cmd === 'init' && id) tags.meta.runtime.push(String(id));
  }
  try {
    const f = w.fbq;
    const state = f && typeof f.getState === 'function' ? f.getState() : null;
    if (state && Array.isArray(state.pixels)) for (const p of state.pixels) tags.meta.runtime.push(String(p.id));
  } catch { /* versões antigas não têm getState */ }
  const runtimeFlags = {
    dataLayer: Array.isArray(w.dataLayer) ? w.dataLayer.length : null,
    fbq: typeof w.fbq === 'function',
    gtag: typeof w.gtag === 'function',
    clarity: typeof w.clarity === 'function',
    hotjar: typeof w.hj === 'function',
    tiktok: !!w.ttq,
    googleTagManager: !!w.google_tag_manager,
  };
  for (const k of Object.keys(tags)) tags[k].runtime = uniq(tags[k].runtime);

  // ---------- Posição de um elemento na página ----------
  const docH = Math.max(doc.body ? doc.body.scrollHeight : 0, doc.documentElement ? doc.documentElement.scrollHeight : 0, 1);
  const isFixed = (el) => {
    try {
      let node = el;
      while (node && node !== doc.body && node.nodeType === 1) {
        if (w.getComputedStyle(node).position === 'fixed') return true;
        node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
      }
    } catch { /* ignora */ }
    return false;
  };
  const place = (el) => {
    try {
      const cs = w.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || (r.width === 0 && r.height === 0)) return 'oculto';
      if (isFixed(el)) return 'flutuante';
      const y = r.top + (w.scrollY || 0);
      if (y < 250) return 'topo';
      if (y > docH - 700) return 'rodapé';
      return 'meio';
    } catch { return 'desconhecido'; }
  };
  const visible = (el) => place(el) !== 'oculto';

  // ---------- WhatsApp: links diretos ----------
  const waRe = /(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\/)/i;
  const whatsapp = [];
  const seenWa = new Set();
  const linkish = matching((el) => el.hasAttribute && (el.hasAttribute('href') || el.hasAttribute('onclick') || el.hasAttribute('data-href') || el.hasAttribute('data-url')));
  for (const el of linkish) {
    const href = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('onclick') || '';
    if (!waRe.test(href)) continue;
    const m = href.match(/https?:\/\/[^\s'")]+|whatsapp:\/\/[^\s'")]+/);
    const raw = m ? m[0] : href;
    let phone = '', message = '';
    try {
      const u = new URL(raw.replace(/^whatsapp:\/\//, 'https://api.whatsapp.com/'));
      phone = digits(u.searchParams.get('phone') || (u.hostname === 'wa.me' ? u.pathname : ''));
      message = u.searchParams.get('text') || '';
    } catch {
      phone = digits((raw.match(/(?:phone=|wa\.me\/)(\d{8,15})/) || [])[1]);
      message = decodeURIComponent((raw.match(/text=([^&]+)/) || [, ''])[1]);
    }
    const key = raw + '|' + text(el).slice(0, 40);
    if (seenWa.has(key)) continue;
    seenWa.add(key);
    whatsapp.push({
      href: raw,
      phone,
      message,
      hasMessage: !!message,
      hasOrigin: /utm|origem|source|campanha|anuncio|anúncio|instagram|facebook|google|site|lp\b/i.test(message + ' ' + raw),
      label: text(el).slice(0, 80) || (el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 80),
      position: place(el),
    });
  }

  // ---------- WhatsApp: botões e widgets sem link direto ----------
  const signal = (el) => [el.id, el.className && el.className.baseVal !== undefined ? '' : el.className, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt'), el.getAttribute('data-testid')]
    .map((x) => String(x || '')).join(' ');
  const whatsappWidgets = [];
  const seenWidget = new Set();
  for (const el of everything) {
    if (!el.getAttribute || ['SCRIPT', 'STYLE', 'LINK', 'META', 'SVG', 'PATH', 'HTML', 'HEAD', 'BODY'].includes(el.tagName)) continue;
    const sig = signal(el) + ' ' + (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ? text(el).slice(0, 60) : '');
    if (!/whats|zap\b|wpp/i.test(sig)) continue;
    const href = el.getAttribute('href') || '';
    if (waRe.test(href)) continue; // já contado como link
    const clickable = ['BUTTON', 'A'].includes(el.tagName) || el.getAttribute('role') === 'button' || el.hasAttribute('onclick') || /pointer/.test((() => { try { return w.getComputedStyle(el).cursor; } catch { return ''; } })());
    if (!clickable) continue;
    const fixed = isFixed(el);
    const key = el.tagName + '|' + sig.slice(0, 60);
    if (seenWidget.has(key)) continue;
    seenWidget.add(key);
    whatsappWidgets.push({
      label: (el.getAttribute('aria-label') || el.getAttribute('title') || text(el) || sig).replace(/\s+/g, ' ').trim().slice(0, 80),
      position: fixed ? 'flutuante' : place(el),
      tag: el.tagName.toLowerCase(),
      classes: String(el.className && el.className.baseVal === undefined ? el.className : '').slice(0, 80),
      href: href.slice(0, 120),
      visible: visible(el),
    });
    if (whatsappWidgets.length >= 10) break;
  }

  // ---------- Chats e chatbots conhecidos ----------
  const CHAT_SIGNATURES = [
    ['LeadConnector / GoHighLevel (chat widget)', /leadconnectorhq\.com\/chat-widget|<chat-widget/i],
    ['Typebot', /typebot\.(io|co)/i],
    ['ManyChat', /manychat\.com/i],
    ['Tawk.to', /tawk\.to/i],
    ['JivoChat', /jivosite\.com|jivochat/i],
    ['Crisp', /crisp\.chat/i],
    ['Intercom', /intercom(cdn)?\.(io|com)/i],
    ['HubSpot Conversations', /js\.hs-scripts\.com|hubspot.*conversations/i],
    ['Blip (Take)', /blip\.ai|take\.net|msging\.net/i],
    ['Zenvia', /zenvia\.com/i],
    ['Octadesk', /octadesk\.com/i],
    ['Botpress', /botpress\.cloud|cdn\.botpress/i],
    ['Chatwoot', /chatwoot/i],
    ['Tidio', /tidio\.co/i],
    ['Zendesk', /zdassets\.com|zendesk\.com/i],
    ['Freshchat', /freshchat|wchat\.freshchat/i],
    ['Drift', /drift\.com/i],
    ['Kommo / amoCRM', /amocrm|kommo\.com/i],
    ['Cloudia', /cloudia\.com\.br/i],
    ['Widget de WhatsApp (Elfsight ou similar)', /elfsight|getbutton\.io|whatshelp/i],
  ];
  const chatCorpus = corpus + '\n' + iframes.join('\n') + '\n' + html.slice(0, 200000);
  const chats = CHAT_SIGNATURES.filter(([, re]) => re.test(chatCorpus)).map(([name]) => name);
  // Chat próprio da página: painel com formulário dentro de container fixo com sinal de whatsapp/chat
  const customChat = matching((el) => el.getAttribute && isFixed(el) && /chat|whats|wac|bot/i.test(signal(el)) && el.querySelector && (el.querySelector('form, input, textarea') || el.querySelector('[role="dialog"]')))
    .map((el) => ({ label: (el.getAttribute('aria-label') || String(el.className && el.className.baseVal === undefined ? el.className : '') || el.id).slice(0, 60), hasForm: !!el.querySelector('form, input, textarea') }))
    .slice(0, 3);
  if (customChat.length) chats.push(`Chat próprio da página (${customChat.map((c) => c.label).join(', ')})`);

  const tel = uniq(matching((el) => el.tagName === 'A' && /^tel:/i.test(el.getAttribute('href') || '')).map((a) => digits(a.getAttribute('href'))));
  const bodyText = doc.body ? text(doc.body).slice(0, 200000) : '';
  const phonesInText = uniq((bodyText.match(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g) || []).map(digits).filter((d) => d.length >= 10 && d.length <= 13)).slice(0, 15);

  // ---------- Formulários ----------
  // Caminho CSS estável o bastante para reencontrar o elemento no teste de envio.
  const cssPath = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== doc.documentElement && parts.length < 12) {
      let part = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift(`#${node.id}`); break; }
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };
  const submitRe = /enviar|cadastr|quero|receber|solicitar|falar|continuar|avançar|avancar|começar|comecar|agendar|garantir|baixar|inscre|submit|send/i;
  // Campo de contato: o que distingue um formulário de lead de uma etapa de quiz ou de uma busca.
  const contactRe = /^(email|tel)$|nome|name|e-?mail|telefone|phone|fone|whats|celular|zap|cpf|cnpj|empresa|company/i;
  const isContactField = (el) => contactRe.test([el.type, el.name, el.id, el.placeholder, el.getAttribute('autocomplete'), el.getAttribute('aria-label')].join(' '));
  const captcha =/challenges\.cloudflare\.com\/turnstile|cf-turnstile/i.test(corpus + html) ? 'Cloudflare Turnstile'
    : /google\.com\/recaptcha|grecaptcha/i.test(corpus + html) ? 'reCAPTCHA'
      : /hcaptcha\.com/i.test(corpus + html) ? 'hCaptcha' : '';
  const formEls = matching((el) => el.tagName === 'FORM');
  // Formulário sem <form>: inputs soltos (React, Vue, widget do LeadConnector/GoHighLevel).
  // Sobe do primeiro input solto até o container que também tem o botão de envio.
  const looseInputs = matching((el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !['hidden', 'submit', 'button', 'reset', 'image'].includes((el.type || '').toLowerCase()) && !(el.closest && el.closest('form')));
  const virtualContainers = [];
  for (const input of looseInputs) {
    if (!isContactField(input)) continue; // etapa de quiz, busca ou filtro não é formulário de lead
    if (virtualContainers.some((c) => c.contains(input))) continue;
    let node = input.parentElement;
    let found = null;
    for (let depth = 0; node && node !== doc.body && depth < 10; depth++, node = node.parentElement) {
      const btn = Array.from(node.querySelectorAll('button, input[type="submit"], [role="button"], a.btn, a[class*="button"]')).find((b) => (b.type === 'submit') || submitRe.test(text(b) || b.value || ''));
      if (btn) { found = node; break; }
    }
    if (found && !virtualContainers.includes(found)) virtualContainers.push(found);
  }
  const describe = (container, index, virtual) => {
    const form = container;
    const fields = Array.from(form.querySelectorAll('input, select, textarea'))
      .filter((f) => !['submit', 'button', 'reset', 'image'].includes((f.type || '').toLowerCase()))
      .map((f) => ({
        tag: f.tagName.toLowerCase(),
        type: (f.type || 'text').toLowerCase(),
        name: f.name || f.id || '',
        placeholder: f.placeholder || '',
        required: !!f.required,
        value: (f.type || '').toLowerCase() === 'hidden' ? String(f.value || '').slice(0, 120) : undefined,
      }));
    const visibleFields = fields.filter((f) => f.type !== 'hidden');
    const hidden = fields.filter((f) => f.type === 'hidden');
    const lead = Array.from(form.querySelectorAll('input, select, textarea')).some((el) => !['hidden', 'submit', 'button'].includes((el.type || '').toLowerCase()) && isContactField(el));
    const action = virtual ? '' : (form.getAttribute('action') || '');
    const cls = (String(form.className || '')) + ' ' + (form.id || '');
    const provider =
      virtual && /leadconnector|gohighlevel|ghl|hl-app/i.test(cls + ' ' + loc.hostname + ' ' + srcs.join(' ')) ? 'GoHighLevel / LeadConnector (widget sem <form>)' :
      virtual ? 'JavaScript sem <form> (React, Vue ou widget)' :
      /elementor/i.test(cls) ? 'Elementor' :
      /wpcf7/i.test(cls) ? 'Contact Form 7' :
      /hsform|hubspot/i.test(cls + action) ? 'HubSpot' :
      /rdstation|rd-station/i.test(cls + action) ? 'RD Station' :
      /gravity|gform/i.test(cls) ? 'Gravity Forms' :
      /wpforms/i.test(cls) ? 'WPForms' :
      /leadconnector|gohighlevel|ghl/i.test(cls + action + loc.hostname) ? 'GoHighLevel / LeadConnector' :
      /n8n|webhook/i.test(action) ? 'Webhook (n8n ou similar)' :
      /typebot/i.test(cls + action) ? 'Typebot' :
      /wac|chat/i.test(cls) ? 'Chat da página' :
      !action ? 'JavaScript (sem action; provável Lovable, React ou similar)' : 'HTML padrão';
    const submit = form.querySelector('button[type="submit"], input[type="submit"]') || Array.from(form.querySelectorAll('button, [role="button"], a.btn, a[class*="button"]')).find((b) => submitRe.test(text(b) || b.value || '')) || form.querySelector('button:not([type])');
    const inChat = !!(form.closest && form.closest('[class*=chat], [class*=wac], [role="dialog"]'));
    return {
      index,
      virtual: !!virtual,
      lead,
      path: cssPath(form),
      id: form.id || '',
      name: form.getAttribute('name') || '',
      action: action ? abs(action) : '',
      actionHost: action ? (() => { try { return new URL(abs(action)).hostname; } catch { return ''; } })() : '',
      method: (form.getAttribute('method') || 'get').toUpperCase(),
      provider,
      captcha,
      visibleFields: visibleFields.length,
      hiddenFields: hidden.length,
      fields: visibleFields.slice(0, 30),
      hidden: hidden.slice(0, 30),
      utmHidden: hidden.filter((f) => /utm|gclid|fbclid|ttclid|origem|source|campaign/i.test(f.name)),
      submitLabel: submit ? text(submit).slice(0, 60) || submit.value || '' : '',
      position: place(form),
      visible: visible(form),
      inChat,
    };
  };
  const forms = [
    ...formEls.map((form, index) => describe(form, index, false)),
    ...virtualContainers.map((c, i) => describe(c, formEls.length + i, true)),
  ];
  const embeddedForms = iframeEls
    .map((f) => f.src || '')
    .filter((src) => /typebot|hsforms|hubspot|jotform|rdstation|forms\.gle|docs\.google\.com\/forms|calendly|tally\.so|leadconnectorhq|gohighlevel|widget\/form|form_embed|respondi|formcrafts/i.test(src))
    .map((src) => ({ src, provider: /leadconnector|gohighlevel|widget\/form/i.test(src) ? 'GoHighLevel / LeadConnector' : (src.match(/typebot|hsforms|hubspot|jotform|rdstation|forms\.gle|google\.com\/forms|calendly|tally|respondi|formcrafts/i) || ['iframe'])[0] }));

  // ---------- UTM ----------
  const sp = new URLSearchParams(loc.search);
  const utm = {};
  for (const [k, v] of sp.entries()) if (/^(utm_|gclid|fbclid|ttclid|gbraid|wbraid)/i.test(k)) utm[k] = v;
  const utmValues = Object.values(utm).filter((v) => v && v.length > 2).map((v) => v.toLowerCase());
  const propagated = {
    whatsapp: whatsapp.map((l) => {
      const hay = (l.href + ' ' + (l.message || '')).toLowerCase();
      return utmValues.some((v) => hay.includes(v)) || /utm_/i.test(l.href);
    }),
    hiddenFilled: forms.map((f) => f.utmHidden.filter((h) => h.value && h.value.length > 0).length),
  };

  // Origem guardada por JavaScript: chaves de storage ou cookie com UTM/click id.
  const originStorage = [];
  try {
    for (const [label, s] of [['localStorage', w.localStorage], ['sessionStorage', w.sessionStorage]]) {
      if (!s) continue;
      for (let i = 0; i < s.length; i++) { const k = s.key(i); if (/utm|fbclid|gclid|ttclid|origem|first_touch|last_touch/i.test(k)) originStorage.push(`${label}.${k}`); }
    }
    for (const c of (doc.cookie || '').split(';')) { const k = c.trim().split('=')[0]; if (/utm|fbclid|gclid|ttclid|origem|first_touch|last_touch/i.test(k)) originStorage.push(`cookie.${k}`); }
  } catch { /* storage bloqueado */ }

  // ---------- Loja e página de vendas ----------
  // Reconhece a plataforma, os links de checkout (e se levam a origem), os botões
  // de compra e os eventos de funil já vistos nesta visita (fbq, dataLayer, gtag).
  const checkoutPlatforms = [
    ['Hotmart', /hotmart\.com/i], ['Kiwify', /kiwify\.(app|com\.br)/i], ['Eduzz', /eduzz\.com/i], ['Monetizze', /monetizze\.com/i],
    ['Braip', /braip\.com/i], ['Ticto', /ticto\.com/i], ['PerfectPay', /perfectpay\.com/i], ['Cakto', /cakto\.com/i], ['Pepper', /pepper\.com\.br/i],
    ['Lastlink', /lastlink\.com/i], ['Greenn', /greenn\.com/i], ['Kirvano', /kirvano\.com/i], ['Hubla', /hubla\.com/i], ['Payt', /payt\.com/i],
    ['Yampi', /yampi\.com/i], ['Cartpanda', /cartpanda\.com/i], ['Mercado Pago', /mercadopago\.com/i], ['PagSeguro', /pagseguro\.uol|pagbank/i], ['Appmax', /appmax\.com/i], ['Stripe', /checkout\.stripe\.com/i],
  ];
  const internalCheckoutRe = /\/(checkout|cart|carrinho|finalizar-compra|finalizar|comprar|pagamento|pedido)(\/|\?|#|$)/i;
  const platformOf = (href) => { const p = checkoutPlatforms.find(([, re]) => re.test(href)); return p ? p[0] : ''; };
  const metaOf = (name) => { const m = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`); return m ? (m.getAttribute('content') || '') : ''; };
  const storeDetect = () => {
    const hay = corpus + '\n' + (doc.body ? doc.body.className : '') + '\n' + (metaOf('generator') || '');
    if (w.Shopify || /cdn\.shopify\.com|myshopify\.com/i.test(hay)) return 'Shopify';
    if (/woocommerce/i.test(hay)) return 'WooCommerce';
    if (/nuvemshop|tiendanube/i.test(hay) || (w.LS && w.LS.store)) return 'Nuvemshop';
    if (/tray\.com\.br|traycommerce|tcdn\.com\.br/i.test(hay)) return 'Tray';
    if (/vtex/i.test(hay)) return 'VTEX';
    if (/lojaintegrada/i.test(hay)) return 'Loja Integrada';
    if (/yampi/i.test(hay)) return 'Yampi';
    if (/cartpanda/i.test(hay)) return 'Cartpanda';
    if (/bagy\.com/i.test(hay)) return 'Bagy';
    if (/wixstores|wix-ecommerce/i.test(hay)) return 'Wix Stores';
    if (/magento|mage\//i.test(hay)) return 'Magento';
    return '';
  };
  // Só palavras de compra de verdade: "quero receber", "garanta sua vaga no webinar" são de lead, não de venda.
  const buyRe = /\b(comprar|compre|adquirir|assinar|assine|matricul|checkout|finalizar (a )?compra|adicionar ao carrinho|add to cart|buy now|pagar agora|garantir (minha|sua|a) vaga|garanta (sua|a) vaga|acesso imediato|liberar acesso)\b/i;
  const originKeys = (href) => { try { return Array.from(new URL(href).searchParams.keys()).filter((k) => /^(utm_|src$|sck$|xcod$|ref$|fbclid|gclid|ttclid|affiliate|aff|bid)/i.test(k)); } catch { return []; } };
  const buyButtons = [];
  for (const el of matching((e) => /^(A|BUTTON)$/.test(e.tagName) || e.getAttribute('role') === 'button' || (e.tagName === 'INPUT' && /submit|button/i.test(e.type)))) {
    const label = text(el) || el.value || el.getAttribute('aria-label') || '';
    const href = el.tagName === 'A' && el.getAttribute('href') ? abs(el.getAttribute('href')) : '';
    const platform = href ? platformOf(href) : '';
    const internal = href ? internalCheckoutRe.test(href) : false;
    const isBuy = buyRe.test(label) || !!platform || internal || /add-to-cart|single_add_to_cart|buy-button|checkout/i.test((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('name') || ''));
    if (!isBuy) continue;
    if (href && /(wa\.me|api\.whatsapp\.com|whatsapp:\/\/|mailto:|tel:)/i.test(href)) continue;
    buyButtons.push({
      text: label.slice(0, 60), href: href.slice(0, 300), host: href ? (() => { try { return new URL(href).hostname; } catch { return ''; } })() : '',
      platform, internal, external: !!href && !internal && (platform ? true : (() => { try { return new URL(href).hostname !== loc.hostname; } catch { return false; } })()),
      originKeys: href ? originKeys(href) : [], position: place(el), visible: visible(el), path: cssPath(el),
    });
    if (buyButtons.length >= 20) break;
  }
  const checkoutLinks = buyButtons.filter((b) => b.platform || b.internal);
  let product = null;
  try {
    for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
      const j = JSON.parse(s.textContent || 'null');
      const items = Array.isArray(j) ? j : (j && j['@graph']) ? j['@graph'] : [j];
      const p = items.find((x) => x && /product/i.test(String(x['@type'] || '')));
      if (p) { const o = Array.isArray(p.offers) ? p.offers[0] : p.offers; product = { name: String(p.name || '').slice(0, 80), price: o && o.price != null ? String(o.price) : '', currency: o && o.priceCurrency ? String(o.priceCurrency) : '' }; break; }
    }
  } catch { /* JSON-LD inválido */ }
  if (!product && (metaOf('product:price:amount') || /^product/i.test(metaOf('og:type')))) product = { name: metaOf('og:title').slice(0, 80), price: metaOf('product:price:amount'), currency: metaOf('product:price:currency') };
  const storePlatform = storeDetect();
  const funnelRe = /^(viewcontent|addtocart|initiatecheckout|addpaymentinfo|purchase|view_item|add_to_cart|begin_checkout|add_payment_info|purchase|view_item_list|select_item)$/i;
  const funnelEvents = uniq([
    ...(log.fbq || []).map((c) => c.args).filter((a) => a && /^track/i.test(String(a[0])) && funnelRe.test(String(a[1] || ''))).map((a) => `fbq:${a[1]}`),
    ...(log.dataLayer || []).map((p) => p.args && p.args[0] && p.args[0].event).filter((e) => e && funnelRe.test(e)).map((e) => `dataLayer:${e}`),
    ...(log.gtag || []).map((c) => c.args).filter((a) => a && a[0] === 'event' && funnelRe.test(String(a[1] || ''))).map((a) => `gtag:${a[1]}`),
  ]);
  const commerceKind = storePlatform || buyButtons.some((b) => /carrinho|cart/i.test(b.text + ' ' + b.href)) ? 'loja'
    : (checkoutLinks.length || (product && buyButtons.length)) ? 'vendas' : '';
  const commerce = {
    kind: commerceKind,
    platform: storePlatform || uniq(checkoutLinks.map((b) => b.platform)).join(', '),
    product,
    buyButtons,
    checkoutLinks,
    funnelEvents,
  };

  // ---------- Saúde básica ----------
  const linkCss = matching((el) => el.tagName === 'LINK' && /stylesheet/i.test(el.getAttribute('rel') || '')).map((l) => abs(l.href));
  let resources = [];
  try {
    resources = (w.performance && w.performance.getEntriesByType ? w.performance.getEntriesByType('resource') : [])
      .map((r) => ({ name: r.name, type: r.initiatorType, status: typeof r.responseStatus === 'number' ? r.responseStatus : null, size: r.transferSize || 0 }));
  } catch { /* sem performance API */ }
  const failedResources = resources.filter((r) => r.status && r.status >= 400).slice(0, 20);
  const cssFailed = failedResources.filter((r) => /\.css(\?|$)/i.test(r.name) || r.type === 'link');
  let bodyFont = '';
  try { bodyFont = w.getComputedStyle(doc.body).fontFamily; } catch { /* sem body */ }
  let nav = null;
  try {
    const n = w.performance.getEntriesByType('navigation')[0];
    if (n) nav = { ttfb: Math.round(n.responseStart), domLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize || 0, protocol: n.nextHopProtocol || '' };
  } catch { /* idem */ }

  const metaTag = (name) => { const m = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`); return m ? (m.getAttribute('content') || '') : ''; };
  const h1 = Array.from(doc.querySelectorAll('h1')).map(text).filter(Boolean);

  return {
    scannedAt: now,
    isTop,
    url: loc.href,
    host: loc.hostname,
    https: loc.protocol === 'https:',
    title: doc.title || '',
    h1: h1.slice(0, 3),
    meta: {
      description: metaTag('description'),
      viewport: metaTag('viewport'),
      robots: metaTag('robots'),
      canonical: (doc.querySelector('link[rel="canonical"]') || {}).href || '',
      favicon: !!doc.querySelector('link[rel~="icon"]'),
      ogTitle: metaTag('og:title'),
      generator: metaTag('generator'),
    },
    tags,
    runtimeFlags,
    scriptHosts: uniq(srcs.map((s) => { try { return new URL(s, loc.href).hostname; } catch { return ''; } })).slice(0, 60),
    iframes: iframes.slice(0, 30),
    whatsapp,
    whatsappWidgets,
    chats,
    tel,
    phonesInText,
    forms,
    embeddedForms,
    utm,
    propagated,
    commerce,
    originStorage: uniq(originStorage).slice(0, 20),
    health: {
      linkCss: linkCss.length,
      styleSheets: doc.styleSheets ? doc.styleSheets.length : null,
      cssFailed,
      failedResources,
      bodyFont,
      nav,
      errors: (log.errors || []).slice(0, 20),
      errorCount: (log.errors || []).length,
    },
    log: {
      dataLayerPushes: (log.dataLayer || []).length,
      dataLayerEvents: uniq((log.dataLayer || []).map((p) => (p.args && p.args[0] && p.args[0].event) || '')).slice(0, 40),
      fbqCalls: (log.fbq || []).map((c) => c.args).slice(0, 60),
      gtagCalls: (log.gtag || []).map((c) => c.args).slice(0, 60),
      submits: log.forms || [],
      hooked: !!w.__trackEye,
    },
  };
}

// Sonda de bloqueio: tenta baixar os scripts dos rastreadores a partir da
// própria página. Bloqueador de anúncios ou Brave Shields derrubam o fetch com
// TypeError; sem bloqueio a resposta vem opaca (no-cors) mas sem erro.
// Autocontida, injetada no mundo MAIN. te_probe=1 marca a requisição para o
// background ignorá-la.
export async function trackEyeProbe() {
  const targets = [
    ['googletagmanager.com', 'https://www.googletagmanager.com/gtm.js?id=GTM-PROBE&te_probe=1'],
    ['google-analytics.com', 'https://www.google-analytics.com/analytics.js?te_probe=1'],
    ['connect.facebook.net', 'https://connect.facebook.net/en_US/fbevents.js?te_probe=1'],
    ['clarity.ms', 'https://www.clarity.ms/tag/probe?te_probe=1'],
  ];
  const blocked = [], ok = [];
  await Promise.all(targets.map(async ([host, url]) => {
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' });
      ok.push(host);
    } catch {
      blocked.push(host);
    }
  }));
  return { blocked, ok, brave: !!navigator.brave, probedAt: Date.now() };
}

// Leitura dos scripts da própria página (mesma origem): WhatsApp montado em
// runtime, endpoints de envio. Só lê, nada é executado. Autocontida.
export async function trackEyeDeep() {
  const same = Array.from(document.scripts).map((s) => s.src).filter((s) => { try { return new URL(s).origin === location.origin; } catch { return false; } }).slice(0, 8);
  const inline = Array.from(document.scripts).filter((s) => !s.src).map((s) => s.textContent || '').join('\n');
  const texts = [inline];
  const read = [];
  await Promise.all(same.map(async (src) => {
    try {
      const r = await fetch(src, { credentials: 'omit' });
      const len = Number(r.headers.get('content-length') || 0);
      if (len > 1_500_000) return;
      const t = await r.text();
      if (t.length <= 1_500_000) { texts.push(t); read.push(src.replace(location.origin, '')); }
    } catch { /* script inacessível */ }
  }));
  const all = texts.join('\n');
  const uniq = (a) => Array.from(new Set(a));
  const waInJs = uniq(all.match(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send|whatsapp:\/\/send)[^"'`\s)]{0,80}/g) || []).slice(0, 10);
  const numbersInJs = uniq((all.match(/\b55\d{10,11}\b/g) || [])).slice(0, 10);
  const endpoints = uniq((all.match(/(?:fetch|axios(?:\.post|\.get)?|\$\.(?:post|ajax|get))\(\s*["'`]([^"'`]{3,120})["'`]/g) || []).map((m) => m.replace(/^.*?\(\s*["'`]/, '').replace(/["'`]$/, ''))).filter((u) => !/googletagmanager|google-analytics|facebook|clarity/i.test(u)).slice(0, 12);
  const whatsVars = uniq((all.match(/\b(whats\w*|zap\w*)\s*[=:]\s*[^,;\n]{0,60}/gi) || [])).slice(0, 5);
  return { scriptsRead: read, inlineLen: inline.length, waInJs, numbersInJs, endpoints, whatsVars };
}

// Preenche um formulário com dados de teste e envia. Também autocontida
// (injetada no mundo MAIN, no frame certo). Marca tudo como TESTE TRACK EYE
// para o comercial reconhecer e apagar o lead. Recusa formulário oculto.
// `path` (caminho CSS da varredura) reencontra formulários sem <form>;
// data.dryRun preenche sem enviar, para conferir o mapeamento dos campos.
export function trackEyeFillAndSubmit(formIndex, data, path) {
  const forms = Array.from(document.querySelectorAll('form'));
  let form = null;
  if (path) { try { form = document.querySelector(path); } catch { form = null; } }
  if (!form) form = forms[formIndex];
  if (!form) return { ok: false, error: 'Formulário não encontrado (índice ' + formIndex + ').' };
  const submitRe = /enviar|cadastr|quero|receber|solicitar|falar|continuar|avançar|avancar|começar|comecar|agendar|garantir|baixar|inscre|submit|send/i;
  const rect = form.getBoundingClientRect();
  const hidden = (rect.width === 0 && rect.height === 0) || getComputedStyle(form).display === 'none' || getComputedStyle(form).visibility === 'hidden';
  if (hidden) {
    return { ok: false, hidden: true, error: 'O formulário está oculto nesta etapa da página (provável quiz ou etapa anterior). Navegue até ele aparecer na tela e rode o teste de novo.' };
  }
  const successRe = /obrigad|sucesso|recebemos|em breve|enviado|retornaremos|entraremos em contato|mensagem enviada/i;
  const successBefore = Array.from(document.querySelectorAll('h1,h2,h3,p,div,span')).filter((el) => successRe.test(el.textContent || '') && (el.textContent || '').length < 200 && el.getBoundingClientRect().height > 0).map((el) => (el.textContent || '').trim().slice(0, 120)).slice(0, 5);
  const filled = [];
  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };
  const guess = (el) => {
    const hint = [el.type, el.name, el.id, el.placeholder, el.getAttribute('autocomplete'), el.getAttribute('aria-label'), (el.labels && el.labels[0] && el.labels[0].textContent) || '']
      .join(' ').toLowerCase();
    if (el.type === 'email' || /e-?mail/.test(hint)) return data.email;
    if (el.type === 'tel' || /tel|phone|fone|whats|celular|zap/.test(hint)) return data.phone;
    if (/cnpj/.test(hint)) return '00000000000191';
    if (/cpf/.test(hint)) return '00000000000';
    if (/empresa|company|negócio|negocio|loja/.test(hint)) return 'TESTE TRACK EYE';
    if (/cidade|city/.test(hint)) return 'Cidade Teste';
    if (/cep|zip/.test(hint)) return '00000000';
    if (/site|url|instagram|@/.test(hint)) return 'trackeye.teste';
    if (/nome|name|first|last/.test(hint)) return data.name;
    if (el.type === 'number') return '1';
    if (el.type === 'url') return 'https://trackeye.teste';
    if (el.type === 'date') return '2026-01-01';
    return data.name;
  };
  const fields = Array.from(form.querySelectorAll('input, select, textarea'));
  for (const el of fields) {
    const type = (el.type || '').toLowerCase();
    if (['submit', 'button', 'reset', 'image', 'hidden', 'file'].includes(type)) continue;
    if (el.disabled || el.readOnly) continue;
    try {
      if (type === 'checkbox') {
        if (!el.checked && (el.required || /aceit|termo|lgpd|privac|consent|autoriz/i.test(el.name + ' ' + (el.labels && el.labels[0] ? el.labels[0].textContent : '')))) { el.click(); filled.push({ name: el.name || el.id, value: 'marcado' }); }
        continue;
      }
      if (type === 'radio') {
        const group = Array.from(form.querySelectorAll('input[type="radio"]')).filter((r) => r.name === el.name);
        if (group.length && !group.some((r) => r.checked)) { group[0].click(); filled.push({ name: el.name, value: group[0].value }); }
        continue;
      }
      if (el.tagName === 'SELECT') {
        const opt = Array.from(el.options).find((o) => o.value && !o.disabled);
        if (opt) { setValue(el, opt.value); filled.push({ name: el.name || el.id, value: opt.textContent.trim() }); }
        continue;
      }
      if (el.tagName === 'TEXTAREA') { setValue(el, data.message); filled.push({ name: el.name || el.id, value: data.message }); continue; }
      const v = guess(el);
      setValue(el, v);
      filled.push({ name: el.name || el.id || el.placeholder, value: v });
    } catch (e) {
      filled.push({ name: el.name || el.id, error: String(e.message || e) });
    }
  }
  if (data.dryRun) return { ok: true, dryRun: true, filled, startedAt: Date.now(), url: location.href, successBefore };
  let submittedVia = '';
  const btn = form.querySelector('button[type="submit"], input[type="submit"]')
    || Array.from(form.querySelectorAll('button, [role="button"], a.btn, a[class*="button"]')).find((b) => submitRe.test((b.textContent || b.value || '')))
    || form.querySelector('button:not([type="button"])');
  const btnLabel = btn ? (btn.textContent || btn.value || '').trim().slice(0, 40) : '';
  try {
    if (btn) { btn.click(); submittedVia = 'clique no botão "' + btnLabel + '"'; }
    else if (form.requestSubmit) { form.requestSubmit(); submittedVia = 'requestSubmit()'; }
    else if (form.submit) { form.submit(); submittedVia = 'submit()'; }
    else return { ok: false, filled, error: 'Não achei o botão de envio deste formulário.' };
  } catch (e) {
    return { ok: false, filled, error: 'Falha ao enviar: ' + String(e.message || e) };
  }
  return { ok: true, filled, submittedVia, startedAt: Date.now(), url: location.href, successBefore };
}

// O formulário está visível agora? (usado pelo modo de espera)
export function trackEyeIsVisible(formIndex, path) {
  let form = null;
  if (path) { try { form = document.querySelector(path); } catch { form = null; } }
  if (!form) form = Array.from(document.querySelectorAll('form'))[formIndex];
  if (!form) return { exists: false, visible: false };
  const r = form.getBoundingClientRect();
  const cs = getComputedStyle(form);
  return { exists: true, visible: !(r.width === 0 && r.height === 0) && cs.display !== 'none' && cs.visibility !== 'hidden' };
}

// Percorre um quiz ou fluxo em etapas até o formulário de lead aparecer:
// em cada rodada escolhe a primeira opção visível do fluxo e, se houver,
// clica em "Continuar". Genérico de propósito; para quando não há progresso.
export async function trackEyeReachForm(formIndex, path, maxSteps) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return !(r.width === 0 && r.height === 0) && cs.display !== 'none' && cs.visibility !== 'hidden' && !el.disabled;
  };
  let form = null;
  if (path) { try { form = document.querySelector(path); } catch { form = null; } }
  if (!form) form = Array.from(document.querySelectorAll('form'))[formIndex];
  if (!form) return { reached: false, steps: 0, log: ['formulário não encontrado'] };
  if (visible(form)) return { reached: true, steps: 0, log: [] };

  // Container do fluxo: sobe do formulário até um ancestral que tenha algo visível além dele.
  let flow = form.parentElement;
  while (flow && flow !== document.body && !Array.from(flow.querySelectorAll('button, [role="button"], [role="radio"], [role="option"], input, label, a')).some((el) => !form.contains(el) && visible(el))) flow = flow.parentElement;
  if (!flow || flow === document.body) flow = document.body;

  const nextRe = /continuar|avançar|avancar|próximo|proximo|seguir|next|ok\b|confirmar|começar|comecar|iniciar|quero|ver\b/i;
  const backRe = /voltar|anterior|refazer|back|cancel/i;
  const isOption = (el) => {
    if (form.contains(el)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) return !el.checked;
    if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'option') return true;
    if (el.hasAttribute('aria-pressed') || el.hasAttribute('data-valor') || el.hasAttribute('data-value') || el.hasAttribute('data-option') || el.hasAttribute('data-answer')) return true;
    if (/\b(opt|option|opcao|opção|choice|answer|resposta|alternativa)\b/i.test(el.className + ' ' + (el.parentElement ? el.parentElement.className : ''))) return tag === 'BUTTON' || tag === 'LABEL' || tag === 'DIV' || tag === 'LI';
    return false;
  };
  const log = [];
  let lastSig = '';
  let steps = 0;
  for (let i = 0; i < (maxSteps || 12); i++) {
    if (visible(form)) return { reached: true, steps, log };
    const all = Array.from(flow.querySelectorAll('button, a, label, input, div, li, [role="button"], [role="radio"], [role="option"]')).filter(visible);
    const sig = all.map((el) => el.tagName + ':' + text(el).slice(0, 20)).join('|');
    if (sig === lastSig) { log.push('sem progresso'); break; }
    lastSig = sig;
    const options = all.filter(isOption);
    const selected = options.some((el) => el.getAttribute('aria-pressed') === 'true' || el.checked || /selected|active|checked|ativo|selecionad/i.test(el.className));
    let acted = false;
    if (options.length && !selected) {
      const opt = options[0];
      opt.click();
      log.push('opção: ' + (text(opt).slice(0, 40) || opt.value || opt.name));
      acted = true;
      steps++;
      await sleep(450);
      if (visible(form)) return { reached: true, steps, log };
    }
    const next = all.find((el) => (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') && !form.contains(el) && nextRe.test(text(el)) && !backRe.test(text(el)) && !isOption(el));
    if (next) {
      next.click();
      log.push('avançar: ' + text(next).slice(0, 40));
      acted = true;
      steps++;
      await sleep(650);
      continue;
    }
    if (!acted) { log.push('nada para clicar'); break; }
  }
  return { reached: visible(form), steps, log };
}

// Teste de clique de compra: encontra o botão pelo caminho CSS da varredura,
// confere se está visível, rola até ele e clica. Não preenche nem paga nada;
// o background observa o que a página dispara e para onde o clique leva.
export function trackEyeClickBuy(path, expectedHref) {
  let el = null;
  try { el = path ? document.querySelector(path) : null; } catch { el = null; }
  if (!el && expectedHref) el = Array.from(document.querySelectorAll('a[href]')).find((a) => a.href === expectedHref) || null;
  if (!el) return { ok: false, error: 'Botão de compra não encontrado (a página mudou desde a varredura).' };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if ((r.width === 0 && r.height === 0) || cs.display === 'none' || cs.visibility === 'hidden') return { ok: false, error: 'O botão está oculto nesta etapa da página.' };
  try { el.scrollIntoView({ block: 'center' }); } catch { /* sem scroll */ }
  const href = el.tagName === 'A' ? el.href : '';
  const startedAt = Date.now();
  try { el.click(); } catch (e) { return { ok: false, error: 'Falha ao clicar: ' + String(e.message || e) }; }
  return { ok: true, startedAt, url: location.href, href, text: (el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
}

// Depois do teste: mensagem de sucesso visível e campos marcados como inválidos.
export function trackEyeAfterSubmit(formIndex, path) {
  const successRe = /obrigad|sucesso|recebemos|em breve|enviado|retornaremos|entraremos em contato|mensagem enviada/i;
  const successNow = Array.from(document.querySelectorAll('h1,h2,h3,p,div,span')).filter((el) => successRe.test(el.textContent || '') && (el.textContent || '').length < 200 && el.getBoundingClientRect().height > 0).map((el) => (el.textContent || '').trim().slice(0, 120)).slice(0, 5);
  let form = null;
  if (path) { try { form = document.querySelector(path); } catch { form = null; } }
  if (!form) form = Array.from(document.querySelectorAll('form'))[formIndex];
  const invalid = form ? Array.from(form.querySelectorAll('[aria-invalid="true"], .error, .is-invalid, :invalid')).map((el) => el.name || el.id || el.className).filter(Boolean).slice(0, 5) : [];
  const stillVisible = form ? form.getBoundingClientRect().height > 0 : false;
  const log = window.__trackEye;
  const dataLayerEvents = log ? Array.from(new Set(log.dataLayer.map((p) => p.args && p.args[0] && p.args[0].event).filter(Boolean))) : [];
  const submits = log ? log.forms.length : 0;
  return { successNow, invalid, stillVisible, dataLayerEvents, submits, url: location.href };
}
