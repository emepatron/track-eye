// Service worker do Track Eye: observa as requisições de rastreamento de cada
// aba (só observa, nunca bloqueia), registra navegações e executa a varredura
// e o teste de envio a pedido do painel.
import { trackEyeScan, trackEyeFillAndSubmit, trackEyeProbe, trackEyeDeep, trackEyeAfterSubmit, trackEyeIsVisible, trackEyeReachForm } from './scanner.js';
import { classify, URL_FILTERS, bodyText } from './net.js';

const MAX_EVENTS = 600;
const MAX_AGE_MS = 20 * 60 * 1000;
const TRACKER_HOSTS = /google|gstatic|doubleclick|facebook|fbcdn|clarity\.ms|hotjar|tiktok|bing\.com|linkedin|twitter|x\.com|snapchat|pinterest|cloudflareinsights|sentry|newrelic|datadog/i;
const tabs = new Map(); // tabId -> { events: [], navs: [], submissions: [], testing: null }

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- Persistência leve (sobrevive ao descanso do service worker) ----------
const pending = new Set();
const restoring = new Map(); // tabId -> Promise, para duas chamadas simultâneas não criarem dois estados
let flushTimer = null;
function restore(tabId) {
  if (tabs.has(tabId)) return Promise.resolve(tabs.get(tabId));
  if (!restoring.has(tabId)) {
    restoring.set(tabId, (async () => {
      const key = `tab:${tabId}`;
      let saved = null;
      try { saved = (await chrome.storage.session.get(key))[key]; } catch { /* sem sessão */ }
      const state = { events: [], navs: [], submissions: [], testing: null, ...(saved || {}) };
      if (!tabs.has(tabId)) tabs.set(tabId, state);
      restoring.delete(tabId);
      return tabs.get(tabId);
    })());
  }
  return restoring.get(tabId);
}
function touch(tabId) {
  pending.add(tabId);
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const payload = {};
    for (const id of pending) if (tabs.has(id)) payload[`tab:${id}`] = tabs.get(id);
    pending.clear();
    try { await chrome.storage.session.set(payload); } catch { /* cota */ }
  }, 400);
}
function prune(state) {
  const cutoff = Date.now() - MAX_AGE_MS;
  state.events = state.events.filter((e) => e.t >= cutoff).slice(-MAX_EVENTS);
  state.navs = state.navs.filter((n) => n.t >= cutoff).slice(-50);
  state.submissions = (state.submissions || []).filter((s) => s.t >= cutoff).slice(-100);
}

// ---------- Requisições de rastreamento (ver net.js) ----------
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const items = classify(details);
    if (!items.length) return;
    restore(details.tabId).then((state) => {
      for (const e of items) state.events.push(e);
      prune(state);
      touch(details.tabId);
    });
  },
  { urls: URL_FILTERS },
  ['requestBody'],
);

// ---------- Envios durante o teste: qualquer requisição que não seja rastreador ----------
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const state = tabs.get(details.tabId);
    if (!state || !state.testing) return;
    if (/[?&]te_probe=1/.test(details.url)) return;
    let u;
    try { u = new URL(details.url); } catch { return; }
    if (TRACKER_HOSTS.test(u.hostname)) return;
    if (/\.(js|css|png|jpe?g|gif|webp|svg|woff2?|ttf|ico|mp4|json)(\?|$)/i.test(u.pathname) && details.method === 'GET') return;
    // Só o que interessa do corpo: quais chaves de origem foram junto. O corpo em si não é guardado.
    const body = details.method === 'GET' ? u.search : bodyText(details);
    const utmKeys = Array.from(new Set((body.match(/\b(utm_[a-z]+|fbclid|gclid|ttclid)\b/gi) || []).map((k) => k.toLowerCase())));
    state.submissions.push({ t: details.timeStamp || Date.now(), host: u.hostname, path: u.pathname.slice(0, 120), method: details.method, type: details.type, utmKeys, bodyLen: body.length });
    prune(state);
    touch(details.tabId);
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest', 'ping', 'other', 'main_frame', 'sub_frame'] },
  ['requestBody'],
);

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  restore(details.tabId).then((state) => {
    state.navs.push({ t: details.timeStamp || Date.now(), url: details.url, type: details.transitionType });
    prune(state);
    touch(details.tabId);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  chrome.storage.session.remove(`tab:${tabId}`).catch(() => {});
});

// ---------- Execução na página ----------
async function runInPage(tabId, func, args = [], frameIds = null) {
  const target = { tabId };
  if (frameIds) target.frameIds = frameIds;
  const results = await chrome.scripting.executeScript({ target, world: 'MAIN', func, args });
  return results && results[0] ? results[0].result : null;
}

// Varre todos os frames e junta: tags e saúde vêm do frame principal;
// formulários, links e widgets dos iframes entram marcados com o frame.
async function scanAllFrames(tabId) {
  const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: trackEyeScan });
  const ok = (results || []).filter((r) => r && r.result);
  const top = ok.find((r) => r.frameId === 0) || ok[0];
  if (!top) return null;
  const scan = top.result;
  scan.frames = [];
  for (const r of ok) {
    if (r.frameId === top.frameId) {
      scan.forms = scan.forms.map((f) => ({ ...f, frameId: 0, key: `0:${f.index}` }));
      continue;
    }
    const s = r.result;
    const frame = { frameId: r.frameId, url: s.url, host: s.host, forms: s.forms.length, whatsapp: s.whatsapp.length, widgets: s.whatsappWidgets.length, chats: s.chats };
    scan.frames.push(frame);
    for (const f of s.forms) scan.forms.push({ ...f, frameId: r.frameId, frameUrl: s.url, frameHost: s.host, key: `${r.frameId}:${f.index}`, provider: f.provider === 'HTML padrão' || f.provider.startsWith('JavaScript') ? `${f.provider} em iframe (${s.host})` : `${f.provider} (iframe ${s.host})` });
    for (const l of s.whatsapp) scan.whatsapp.push({ ...l, frameHost: s.host });
    for (const wdg of s.whatsappWidgets) scan.whatsappWidgets.push({ ...wdg, frameHost: s.host });
    for (const c of s.chats) if (!scan.chats.includes(c)) scan.chats.push(c);
    scan.propagated.hiddenFilled.push(...s.propagated.hiddenFilled);
  }
  return scan;
}

const handlers = {
  async ping() { return { ok: true, version: chrome.runtime.getManifest().version }; },
  async scan({ tabId }) {
    // Página recém-carregada: as tags ainda estão disparando. Espera até 3 s
    // depois da última navegação antes de ler os eventos.
    const pre = await restore(tabId);
    const lastNav = pre.navs.reduce((a, n) => (n.t > a ? n.t : a), 0);
    const wait = 3000 - (Date.now() - lastNav);
    if (lastNav && wait > 0) await new Promise((r) => setTimeout(r, wait));
    const [scan, probe, deep] = await Promise.all([
      scanAllFrames(tabId),
      runInPage(tabId, trackEyeProbe).catch(() => null),
      runInPage(tabId, trackEyeDeep).catch(() => null),
    ]);
    const state = await restore(tabId);
    return { scan, probe, deep, events: state.events, navs: state.navs };
  },
  async events({ tabId }) {
    const state = await restore(tabId);
    return { events: state.events, navs: state.navs };
  },
  async clear({ tabId }) {
    const state = await restore(tabId);
    state.events = []; state.navs = []; state.submissions = []; state.testing = null;
    touch(tabId);
    return { ok: true };
  },
  async isVisible({ tabId, frameId = 0, formIndex, path = '' }) {
    return runInPage(tabId, trackEyeIsVisible, [formIndex, path], frameId ? [frameId] : null);
  },
  async startTest({ tabId, frameId = 0, formIndex, path = '', data, autoAdvance = true }) {
    const frames = frameId ? [frameId] : null;
    let advanced = null;
    // Formulário oculto (quiz, etapas): tenta chegar até ele sozinho.
    const vis = await runInPage(tabId, trackEyeIsVisible, [formIndex, path], frames);
    if (vis && vis.exists && !vis.visible && autoAdvance) {
      advanced = await runInPage(tabId, trackEyeReachForm, [formIndex, path, 12], frames);
    }
    const state = await restore(tabId);
    state.submissions = [];
    state.testing = { startedAt: Date.now(), frameId, formIndex };
    touch(tabId);
    const result = await runInPage(tabId, trackEyeFillAndSubmit, [formIndex, data, path], frames);
    if (!result || !result.ok || result.dryRun) { state.testing = null; touch(tabId); }
    return { ...(result || { ok: false, error: 'Sem resposta da página.' }), advanced };
  },
  async afterTest({ tabId, frameId = 0, formIndex, path = '', startedAt }) {
    const state = await restore(tabId);
    let after = null;
    try {
      after = await runInPage(tabId, trackEyeAfterSubmit, [formIndex, path], frameId ? [frameId] : null);
    } catch { /* a página pode ter navegado para outro domínio ou o frame sumiu */ }
    const submissions = (state.submissions || []).filter((s) => s.t >= startedAt - 200);
    state.testing = null;
    touch(tabId);
    return { events: state.events, navs: state.navs, submissions, after: after || {} };
  },
  async capture({ windowId }) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return { dataUrl };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = handlers[msg && msg.type];
  if (!fn) { sendResponse({ error: 'Ação desconhecida: ' + (msg && msg.type) }); return false; }
  fn(msg).then((r) => sendResponse(r ?? {})).catch((e) => sendResponse({ error: String(e && e.message || e) }));
  return true;
});
