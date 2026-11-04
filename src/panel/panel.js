// Painel lateral do Track Eye.
import { evaluate, GROUP_LABELS, STATUS_LABELS, formatPhone } from '../rules.js';
import { toMarkdown, toShort, fmtDate } from '../report.js';
import * as db from '../clients.js';
import { withTestUtm, DEFAULT_UTM_TEMPLATE } from '../utm.js';

if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.id) {
  // Pré-visualização fora da extensão (navegador comum): carrega um chrome falso.
  await import('./mock-chrome.js');
}

const $ = (id) => document.getElementById(id);
const VERSION = chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '0.1.0';
$('version').textContent = `v${VERSION} · alfa`;

const state = {
  tab: null,          // aba ativa
  client: null,       // projeto detectado ou escolhido
  clients: [],
  scan: null,
  events: [],
  navs: [],
  test: null,
  result: null,
  filter: 'all',
  editingClient: null,
  historyOpen: null,
};

const send = (msg) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage(msg, (r) => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (r && r.error) return reject(new Error(r.error));
    resolve(r);
  });
});

let toastTimer;
function toast(text, err = false) {
  const el = $('toast');
  el.textContent = text; el.hidden = false; el.classList.toggle('err', err);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- navegação entre views ----------------
for (const b of document.querySelectorAll('.tab')) {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${b.dataset.view}`));
    if (b.dataset.view === 'clients') renderClients();
    if (b.dataset.view === 'history') renderHistory();
  });
}

// ---------------- aba ativa ----------------
async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const changed = !state.tab || !tab || state.tab.id !== tab.id || state.tab.url !== tab.url;
  state.tab = tab || null;
  if (changed) {
    const host = (() => { try { return new URL(tab.url).hostname; } catch { return ''; } })();
    state.client = host ? await db.findClientByHost(host) : null;
    if (state.scan && state.scan.url !== (tab && tab.url) && !state.testRunning) {
      // outra página: zera o resultado anterior
      state.scan = null; state.result = null; state.test = null;
      $('scan-result').hidden = true; $('scan-empty').hidden = false;
    }
  }
  renderPage();
}
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete' || info.url) refreshTab(); });

async function renderPage() {
  const t = state.tab;
  const ok = t && /^https?:/.test(t.url || '');
  $('page-title').textContent = ok ? (t.title || t.url) : 'Nenhuma página web na aba ativa';
  $('page-url').textContent = ok ? t.url : 'Abra uma landing page e volte aqui.';
  $('btn-scan').disabled = !ok; $('btn-reload').disabled = !ok;
  if (ok && !state.utmEdited) { $('utm-url').value = t.url; renderUtmPreview(); }
  state.clients = await db.listClients();
  const box = $('page-client');
  const opts = ['<option value="">Sem projeto</option>', ...state.clients.map((c) => `<option value="${c.id}" ${state.client && state.client.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`)].join('');
  box.innerHTML = (state.client
    ? `<span class="badge brand"><span class="dot"></span>${esc(state.client.name)}</span>`
    : `<span class="badge">Projeto não identificado</span>`) + `<select class="inline" id="client-pick">${opts}</select>`;
  $('client-pick').addEventListener('change', (e) => {
    state.client = state.clients.find((c) => c.id === e.target.value) || null;
    renderPage();
    if (state.scan) { reevaluate(); }
  });
}

// ---------------- varredura ----------------
async function runScan() {
  if (!state.tab) return;
  $('btn-scan').disabled = true;
  $('btn-scan').textContent = 'Varrendo…';
  try {
    const r = await send({ type: 'scan', tabId: state.tab.id });
    if (!r || !r.scan) throw new Error('A página não respondeu. Recarregue e tente de novo.');
    state.scan = r.scan; state.probe = r.probe || null; state.deep = r.deep || null; state.events = r.events || []; state.navs = r.navs || []; state.test = null; state.buy = null;
    reevaluate();
    $('scan-empty').hidden = true; $('scan-result').hidden = false;
    toast('Varredura concluída');
  } catch (e) {
    toast(e.message, true);
  } finally {
    $('btn-scan').disabled = false;
    $('btn-scan').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg> Varrer página';
  }
}
$('btn-scan').addEventListener('click', runScan);
$('btn-reload').addEventListener('click', async () => {
  if (!state.tab) return;
  await send({ type: 'clear', tabId: state.tab.id });
  await chrome.tabs.reload(state.tab.id);
  toast('Recarregando… varro em 4 s');
  setTimeout(runScan, 4000);
});

// ---------------- abrir com UTM de teste ----------------
// A URL vem da aba ativa (ou colada) e os parâmetros do modelo da engrenagem.
db.getSettings().then((s) => { $('utm-template').value = s.utmTemplate || DEFAULT_UTM_TEMPLATE; renderUtmPreview(); });
function testUrl() {
  return withTestUtm($('utm-url').value, $('utm-template').value || DEFAULT_UTM_TEMPLATE);
}
function renderUtmPreview() {
  const el = $('utm-preview');
  try { el.textContent = testUrl(); el.classList.remove('err'); }
  catch (e) { el.textContent = e.message; el.classList.add('err'); }
}
$('utm-url').addEventListener('input', () => { state.utmEdited = $('utm-url').value.trim() !== (state.tab && state.tab.url); renderUtmPreview(); });
$('utm-template').addEventListener('input', renderUtmPreview);
$('btn-utm-open').addEventListener('click', async () => {
  let url;
  try { url = testUrl(); } catch (e) { return toast(e.message, true); }
  if (!state.tab) return toast('Nenhuma aba ativa.', true);
  await send({ type: 'clear', tabId: state.tab.id });
  await chrome.tabs.update(state.tab.id, { url });
  state.utmEdited = false;
  toast('Abrindo com UTM… varro em 4 s');
  setTimeout(runScan, 4000);
});
$('btn-utm-new').addEventListener('click', async () => {
  try { await chrome.tabs.create({ url: testUrl() }); } catch (e) { toast(e.message, true); }
});
$('btn-utm-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(testUrl()); toast('URL de teste copiada'); } catch (e) { toast(e.message, true); }
});

function reevaluate() {
  state.result = evaluate({ scan: state.scan, probe: state.probe, deep: state.deep, events: state.events, navs: state.navs, client: state.client, test: state.test, buy: state.buy });
  renderResult();
}

// ---------------- teste de clique de compra ----------------
$('btn-buy').addEventListener('click', async () => {
  if (!state.tab || !state.scan) return;
  const b = ((state.scan.commerce || {}).buyButtons || [])[Number($('buy-button').value)];
  if (!b) return;
  const ok = confirm(`Clicar em "${b.text || b.host}" nesta página e observar por 8 segundos? Nada é preenchido nem pago; se o botão levar ao checkout, a aba vai para lá.`);
  if (!ok) return;
  state.testRunning = true; state.buy = null;
  $('btn-buy').disabled = true; $('buy-progress').hidden = false;
  try {
    const clicked = await send({ type: 'clickBuy', tabId: state.tab.id, path: b.path, href: b.href });
    if (!clicked.ok) { state.buy = { ...clicked, startedAt: Date.now() }; reevaluate(); toast(clicked.error, true); return; }
    await new Promise((r) => setTimeout(r, 8000));
    const r = await send({ type: 'events', tabId: state.tab.id });
    state.events = r.events || state.events; state.navs = r.navs || state.navs;
    state.buy = { ...clicked, button: b };
    reevaluate();
    toast('Clique observado');
  } catch (e) {
    toast(e.message, true);
  } finally {
    state.testRunning = false;
    $('btn-buy').disabled = false; $('buy-progress').hidden = true;
  }
});

const VERDICT_TEXT = { verde: 'Pode subir campanha', amarelo: 'Sobe com ressalvas; corrigir em seguida', vermelho: 'Corrigir antes de subir campanha' };
function renderResult() {
  const r = state.result; if (!r) return;
  const v = $('verdict');
  v.className = `verdict ${r.verdict}`;
  $('verdict-label').textContent = r.verdict.toUpperCase();
  $('verdict-text').textContent = VERDICT_TEXT[r.verdict];
  $('counts').innerHTML = ['fail', 'warn', 'pass', 'unknown'].filter((k) => r.counts[k]).map((k) => `<span class="count ${k}"><b>${r.counts[k]}</b> ${({ fail: 'crítico', warn: 'atenção', pass: 'em ordem', unknown: 'não conferido' })[k]}</span>`).join('');

  const f = state.filter;
  const keep = (c) => f === 'all' || (f === 'issues' && (c.status === 'fail' || c.status === 'warn')) || (f === 'pass' && c.status === 'pass') || (f === 'unknown' && (c.status === 'unknown' || c.status === 'info'));
  const order = { fail: 0, warn: 1, unknown: 2, info: 3, pass: 4 };
  const groups = ['teste', 'compra', 'tags', 'whatsapp', 'forms', 'utm', 'saude'];
  let html = '';
  for (const g of groups) {
    const items = r.checks.filter((c) => c.group === g && keep(c)).sort((a, b) => order[a.status] - order[b.status]);
    if (!items.length) continue;
    html += `<div class="group-title">${GROUP_LABELS[g]}</div>`;
    for (const c of items) {
      const open = c.status === 'fail' ? 'open' : '';
      html += `<details class="check ${c.status}" ${open}><summary><span class="dot"></span><div><div class="check-title">${esc(c.title)}</div><div class="check-tag">${STATUS_LABELS[c.status]}</div></div><svg class="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="check-body">${c.evidence ? `<div class="ev">${esc(c.evidence)}</div>` : ''}${c.fix ? `<div class="fix"><b>Fazer:</b><span>${esc(c.fix)}</span></div>` : ''}${!c.evidence && !c.fix ? '<span class="muted">Sem detalhes.</span>' : ''}</div></details>`;
    }
  }
  $('checks').innerHTML = html || '<p class="muted">Nada neste filtro.</p>';

  // formulários disponíveis para o teste
  const sel = $('test-form');
  const forms = state.scan.forms || [];
  sel.innerHTML = forms.length ? forms.map((x) => `<option value="${x.key || `0:${x.index}`}">${esc(x.id || x.name || `Formulário ${x.index + 1}`)} · ${x.visibleFields} campos · ${esc(x.provider)}${x.visible === false ? ' · oculto' : ''}</option>`).join('') : '<option value="">Nenhum formulário na página</option>';
  $('btn-test').disabled = !forms.length || state.testRunning;

  // botões de compra disponíveis para o teste de clique
  const cm = state.scan.commerce || { buyButtons: [] };
  const buyCard = $('buy-card');
  buyCard.hidden = !(cm.buyButtons && cm.buyButtons.length);
  if (!buyCard.hidden) {
    $('buy-button').innerHTML = cm.buyButtons.map((b, i) => `<option value="${i}">${esc(b.text || b.host || `Botão ${i + 1}`)}${b.platform ? ` · ${esc(b.platform)}` : b.host ? ` · ${esc(b.host)}` : ''} · ${esc(b.position)}</option>`).join('');
    $('btn-buy').disabled = !!state.testRunning;
  }

  renderInventory();
}
for (const chip of document.querySelectorAll('#filters .chip')) chip.addEventListener('click', () => {
  document.querySelectorAll('#filters .chip').forEach((x) => x.classList.toggle('is-active', x === chip));
  state.filter = chip.dataset.filter; renderResult();
});

function renderInventory() {
  const s = state.scan; const t = s.tags;
  const ids = (k) => Array.from(new Set([...(t[k].code || []), ...(t[k].runtime || [])])).join(', ') || '—';
  const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join('')}</div>`;
  const ev = (state.events || []).slice(-40).reverse();
  const navs = (state.navs || []).slice(-10);
  const timeline = [...ev.map((e) => ({ t: e.t, k: e.kind, txt: e.kind === 'ga4' ? `${e.params.en || '(sem evento)'} · ${e.params.tid}` : e.kind === 'meta' ? `${e.params.ev} · ${e.params.id}` : e.kind === 'ads' ? `${e.params.id} ${e.params.label || ''}` : e.params.id || e.url.slice(0, 60) })), ...navs.map((n) => ({ t: n.t, k: 'nav', txt: n.url }))]
    .sort((a, b) => b.t - a.t).slice(0, 50);
  const base = timeline.length ? Math.min(...timeline.map((x) => x.t)) : 0;
  $('inventory').innerHTML = `<div class="inv">
    <h4>IDs encontrados</h4>${kv([['GTM', ids('gtm')], ['GA4', ids('ga4')], ['Meta', ids('meta')], ['Google Ads', ids('ads')], ['Clarity', ids('clarity')], ['Hotjar', ids('hotjar')], ['TikTok', ids('tiktok')]])}
    <h4>WhatsApp, chat e telefone</h4>${(s.whatsapp || []).length || (s.tel || []).length || (s.whatsappWidgets || []).length || (s.chats || []).length ? kv([...(s.whatsapp || []).map((l) => [l.position, `${formatPhone(l.phone)}${l.hasMessage ? ' · "' + l.message.slice(0, 50) + '"' : ' · sem mensagem'}`]), ...(s.whatsappWidgets || []).map((x) => [x.position, `botão "${x.label}" sem link direto`]), ...(s.chats || []).map((c) => ['chat', c]), ...(s.tel || []).map((n) => ['tel:', formatPhone(n)])]) : '<span class="muted small">Nenhum.</span>'}
    <h4>Formulários</h4>${(s.forms || []).length || (s.embeddedForms || []).length ? kv([...s.forms.map((f) => [f.id || `#${f.index + 1}`, `${f.provider} · ${f.visibleFields} visíveis, ${f.hiddenFields} ocultos${f.actionHost ? ' → ' + f.actionHost : ''}${f.visible === false ? ' · oculto' : ''} · ${f.fields.map((x) => x.name || x.placeholder || x.type).join(', ')}`]), ...(s.embeddedForms || []).map((e) => ['iframe', `${e.provider} · ${e.src.slice(0, 80)}`])]) : '<span class="muted small">Nenhum.</span>'}
    ${s.commerce && (s.commerce.kind || s.commerce.buyButtons.length) ? `<h4>Compra</h4>${kv([['Tipo', `${s.commerce.kind === 'loja' ? 'loja' : s.commerce.kind === 'vendas' ? 'página de vendas' : 'botão de compra'}${s.commerce.platform ? ' · ' + s.commerce.platform : ''}`], ...(s.commerce.product ? [['Produto', `${s.commerce.product.name}${s.commerce.product.price ? ' · ' + (s.commerce.product.currency || '') + ' ' + s.commerce.product.price : ''}`]] : []), ...s.commerce.buyButtons.slice(0, 8).map((b) => [b.position, `"${b.text}"${b.href ? ' → ' + b.href.slice(0, 90) : ''}${b.originKeys.length ? ' · origem: ' + b.originKeys.join(', ') : ''}`]), ['Funil visto', s.commerce.funnelEvents.length ? s.commerce.funnelEvents.join(', ') : 'nenhum evento de funil nesta visita']])}` : ''}
    <h4>Página</h4>${kv([['H1', (s.h1 || []).join(' | ') || '—'], ['Scripts de', (s.scriptHosts || []).slice(0, 12).join(', ') || '—'], ['Iframes', (s.frames || []).length ? s.frames.map((f) => `${f.host} (${f.forms} form)`).join(', ') : '—'], ['No JS', state.deep ? [...(state.deep.waInJs || []), ...(state.deep.endpoints || [])].slice(0, 8).join(', ') || 'nada relevante' : '—'], ['dataLayer', s.log.dataLayerEvents.length ? s.log.dataLayerEvents.join(', ') : `${s.log.dataLayerPushes} push(es)`], ['Erros JS', String(s.health.errorCount || 0)]])}
    <h4>Eventos observados (${timeline.length})</h4>${timeline.length ? `<div class="timeline">${timeline.map((x) => `<div><span class="${x.k === 'nav' ? 'nav' : 'k'}">${x.k === 'nav' ? 'página' : x.k}</span><span>+${((x.t - base) / 1000).toFixed(1)}s ${esc(x.txt)}</span></div>`).join('')}</div>` : '<span class="muted small">Nenhuma requisição de rastreamento observada. Se a página já estava aberta, use Recarregar e varrer.</span>'}
  </div>`;
}

// ---------------- teste de envio ----------------
$('btn-test').addEventListener('click', async () => {
  if (!state.tab || !state.scan) return;
  const [frameId, idx] = String($('test-form').value).split(':').map(Number);
  const formMeta = (state.scan.forms || []).find((f) => (f.key || `0:${f.index}`) === $('test-form').value) || {};
  const path = formMeta.path || '';
  const settings = await db.getSettings();
  const ok = confirm('Enviar um lead de TESTE pelo formulário desta página? Ele vai entrar no CRM do projeto como "TESTE TRACK EYE".');
  if (!ok) return;
  const data = {
    name: 'TESTE TRACK EYE',
    email: settings.testEmail || 'teste.trackeye@exemplo.com',
    phone: (settings.testPhone || '').replace(/\D+/g, '') || '11999999999',
    message: 'Lead de teste do Track Eye. Pode apagar.',
  };
  state.testRunning = true;
  $('btn-test').disabled = true; $('test-progress').hidden = false;
  const progressText = $('test-progress').querySelector('span');
  progressText.textContent = 'Procurando o formulário e percorrendo etapas…';
  try {
    let started = await send({ type: 'startTest', tabId: state.tab.id, frameId, formIndex: idx, path, data });
    if (started && started.hidden) {
      // O avanço automático não chegou lá: o analista percorre o fluxo e o
      // Track Eye envia assim que o formulário aparecer (até 3 minutos).
      progressText.textContent = 'Não cheguei ao formulário sozinho. Responda as etapas na página; eu envio quando ele aparecer (até 3 min).';
      toast('Avance na página até o formulário aparecer', true);
      const deadline = Date.now() + 180000;
      let visible = false;
      while (Date.now() < deadline && state.testRunning) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const v = await send({ type: 'isVisible', tabId: state.tab.id, frameId, formIndex: idx, path });
          if (v && v.visible) { visible = true; break; }
        } catch { /* a página pode ter recarregado */ }
      }
      if (!visible) {
        state.test = { ok: false, hidden: true, error: started.error, startedAt: Date.now(), url: state.scan.url, filled: [], advanced: started.advanced };
        reevaluate();
        throw new Error('O formulário não apareceu a tempo. Chegue até ele e rode o teste de novo.');
      }
      progressText.textContent = 'Formulário na tela: preenchendo e enviando…';
      started = await send({ type: 'startTest', tabId: state.tab.id, frameId, formIndex: idx, path, data, autoAdvance: false });
    }
    if (!started || !started.ok) {
      throw new Error((started && started.error) || 'Não consegui preencher o formulário.');
    }
    progressText.textContent = 'Enviado. Observando a página por 12 s…';
    await new Promise((r) => setTimeout(r, 12000));
    const after = await send({ type: 'afterTest', tabId: state.tab.id, frameId, formIndex: idx, path, startedAt: started.startedAt });
    state.events = after.events || state.events; state.navs = after.navs || state.navs;
    state.test = { ...started, frameId, submissions: after.submissions || [], after: after.after || {}, dataLayerEvents: (after.after && after.after.dataLayerEvents) || [] };
    reevaluate();
    $('test-card').open = false;
    toast('Teste concluído: veja o bloco "Teste de envio"');
  } catch (e) {
    toast(e.message, true);
  } finally {
    state.testRunning = false;
    $('test-progress').hidden = true; $('btn-test').disabled = false;
  }
});

// ---------------- exportação ----------------
async function buildMd() {
  const settings = await db.getSettings();
  return toMarkdown({ scan: state.scan, result: state.result, client: state.client, analyst: settings.analyst, version: VERSION });
}
const copy = async (text) => { await navigator.clipboard.writeText(text); toast('Copiado'); };
$('btn-copy-md').addEventListener('click', async () => copy(await buildMd()));
$('btn-copy-short').addEventListener('click', () => copy(toShort({ scan: state.scan, result: state.result, client: state.client })));
const fileStem = () => `track-eye-${(state.client ? state.client.name : state.scan.host).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
function download(name, blobOrUrl) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = name; a.click();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('btn-download-md').addEventListener('click', async () => download(`${fileStem()}.md`, new Blob([await buildMd()], { type: 'text/markdown' })));
$('btn-shot').addEventListener('click', async () => {
  try {
    const r = await send({ type: 'capture', windowId: state.tab.windowId });
    download(`${fileStem()}.png`, r.dataUrl);
    toast('Print salvo nos downloads');
  } catch (e) { toast(e.message, true); }
});
$('btn-save').addEventListener('click', async () => {
  const md = await buildMd();
  await db.saveAudit({ clientId: state.client ? state.client.id : '', clientName: state.client ? state.client.name : state.scan.host, url: state.scan.url, verdict: state.result.verdict, date: Date.now(), markdown: md, counts: state.result.counts });
  toast('Salvo no histórico');
});

// ---------------- projetos (clientes no código) ----------------
async function renderClients() {
  state.clients = await db.listClients();
  const q = ($('client-search').value || '').toLowerCase();
  const list = state.clients.filter((c) => !q || c.name.toLowerCase().includes(q) || c.domains.join(' ').includes(q));
  $('client-list').innerHTML = list.length ? list.map((c) => `<div class="item" data-id="${c.id}"><div><div class="name">${esc(c.name)}</div><div class="sub">${esc(c.domains.join(' · ') || 'sem domínio')} · ${esc(c.whatsapp.map(formatPhone).join(', ') || 'sem WhatsApp')}</div></div><span class="muted">›</span></div>`).join('') : '<p class="muted small">Nenhum projeto ainda. Clique em Novo ou importe um JSON.</p>';
  for (const el of $('client-list').querySelectorAll('.item')) el.addEventListener('click', () => openClientForm(state.clients.find((c) => c.id === el.dataset.id)));
}
$('client-search').addEventListener('input', renderClients);
function openClientForm(c) {
  state.editingClient = c || null;
  $('client-form').hidden = false;
  $('client-form-title').textContent = c ? `Editar ${c.name}` : 'Novo projeto';
  $('cf-id').value = c ? c.id : '';
  $('cf-name').value = c ? c.name : '';
  $('cf-domains').value = c ? c.domains.join('\n') : (state.tab && /^https?:/.test(state.tab.url) ? db.normalizeDomain(new URL(state.tab.url).hostname) : '');
  $('cf-whatsapp').value = c ? c.whatsapp.map(formatPhone).join('\n') : (state.scan ? Array.from(new Set((state.scan.whatsapp || []).map((l) => l.phone).filter(Boolean))).map(formatPhone).join('\n') : '');
  $('cf-notes').value = c ? c.notes : '';
  $('cf-delete').hidden = !c;
  $('cf-name').focus();
}
$('btn-new-client').addEventListener('click', () => openClientForm(null));
$('cf-cancel').addEventListener('click', () => { $('client-form').hidden = true; });
$('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const saved = await db.saveClient({ id: $('cf-id').value || undefined, name: $('cf-name').value, domains: $('cf-domains').value, whatsapp: $('cf-whatsapp').value, notes: $('cf-notes').value });
    $('client-form').hidden = true;
    toast(`${saved.name} salvo`);
    await renderClients();
    await refreshTab();
  } catch (err) { toast(err.message, true); }
});
$('cf-delete').addEventListener('click', async () => {
  const c = state.editingClient; if (!c) return;
  if (!confirm(`Excluir ${c.name} do cadastro? O histórico de laudos fica.`)) return;
  await db.removeClient(c.id);
  $('client-form').hidden = true;
  toast('Projeto excluído');
  await renderClients(); await refreshTab();
});
$('btn-export').addEventListener('click', async () => download(`track-eye-projetos-${new Date().toISOString().slice(0, 10)}.json`, new Blob([await db.exportClients()], { type: 'application/json' })));
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const r = await db.importClients(await file.text());
    toast(`Importado: ${r.added} novo(s), ${r.updated} atualizado(s)`);
    await renderClients(); await refreshTab();
  } catch (err) { toast('Arquivo inválido: ' + err.message, true); }
  e.target.value = '';
});

// ---------------- histórico ----------------
async function renderHistory() {
  const audits = await db.listAudits();
  $('history-detail').hidden = true;
  $('history-list').hidden = false;
  $('history-list').innerHTML = audits.length ? audits.map((a) => `<div class="item" data-id="${a.id}"><div><div class="name">${esc(a.clientName)}</div><div class="sub">${fmtDate(a.date)} · ${esc(a.url)}</div></div><span class="v ${a.verdict}"></span></div>`).join('') : '<p class="muted small">Nenhum laudo salvo. Depois de varrer, clique em "Salvar no histórico".</p>';
  for (const el of $('history-list').querySelectorAll('.item')) el.addEventListener('click', () => {
    const a = audits.find((x) => x.id === el.dataset.id);
    state.historyOpen = a;
    $('hd-title').textContent = `${a.clientName} · ${fmtDate(a.date)}`;
    $('hd-md').textContent = a.markdown;
    $('history-list').hidden = true; $('history-detail').hidden = false;
  });
}
$('hd-back').addEventListener('click', renderHistory);
$('hd-copy').addEventListener('click', () => copy(state.historyOpen.markdown));
$('hd-delete').addEventListener('click', async () => {
  if (!confirm('Excluir este laudo do histórico?')) return;
  await db.removeAudit(state.historyOpen.id); renderHistory();
});

// ---------------- configurações ----------------
$('btn-settings').addEventListener('click', async () => {
  const s = await db.getSettings();
  $('st-analyst').value = s.analyst; $('st-email').value = s.testEmail; $('st-phone').value = s.testPhone; $('st-utm').value = s.utmTemplate || DEFAULT_UTM_TEMPLATE;
  $('settings').showModal();
});
$('settings').addEventListener('close', async () => {
  if ($('settings').returnValue !== 'save') return;
  const utmTemplate = $('st-utm').value.trim();
  await db.saveSettings({ analyst: $('st-analyst').value.trim(), testEmail: $('st-email').value.trim(), testPhone: $('st-phone').value.trim(), utmTemplate: utmTemplate === DEFAULT_UTM_TEMPLATE ? '' : utmTemplate });
  $('utm-template').value = utmTemplate || DEFAULT_UTM_TEMPLATE; renderUtmPreview();
  toast('Configurações salvas');
});

// ---------------- início ----------------
refreshTab();
send({ type: 'ping' }).catch(() => {});
