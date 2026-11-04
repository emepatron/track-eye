import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { trackEyeScan, trackEyeFillAndSubmit } from '../src/scanner.js';
import { evaluate } from '../src/rules.js';

const winOf = (file, url) => {
  const html = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const win = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true }).window;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  return win;
};
const byId = (res, id) => res.checks.find((c) => c.id === id);

test('Fibra: iframe do GoHighLevel, chat do LeadConnector e botão flutuante sem link', () => {
  const win = winOf('lp-widgets.html', 'https://lp.exemplo-fibra.com.br/');
  // jsdom não calcula layout: simula o botão como visível e fixo
  const fab = win.document.querySelector('.wac-fab');
  fab.getBoundingClientRect = () => ({ top: 500, width: 56, height: 56 });
  const scan = trackEyeScan(win);
  assert.equal(scan.embeddedForms.length, 1);
  assert.equal(scan.embeddedForms[0].provider, 'GoHighLevel / LeadConnector');
  assert.ok(scan.chats.some((c) => /LeadConnector/.test(c)), 'chat widget do LeadConnector reconhecido');
  assert.equal(scan.whatsapp.length, 0);
  assert.equal(scan.whatsappWidgets.length, 1);
  assert.equal(scan.whatsappWidgets[0].label, 'Falar no WhatsApp');
  assert.equal(scan.whatsappWidgets[0].position, 'flutuante');

  const res = evaluate({ scan, client: { name: 'Fibra', whatsapp: ['11999990000'] } });
  assert.equal(byId(res, 'wa-none'), undefined, 'não diz "sem WhatsApp" quando há botão');
  assert.ok(res.checks.some((c) => c.id.startsWith('wa-widget-') && c.status === 'unknown'));
  assert.ok(res.checks.some((c) => c.id.startsWith('chat-') && c.status === 'info'));
  assert.equal(byId(res, 'embed-GoHighLevel / LeadConnector').status, 'unknown');
});

test('widget do GoHighLevel sem <form>: vira formulário virtual com caminho, captcha e provedor', () => {
  const win = winOf('crm-widget.html', 'https://api.crmexemplo.com/widget/form/telg');
  const scan = trackEyeScan(win);
  assert.equal(scan.forms.length, 1);
  const f = scan.forms[0];
  assert.equal(f.virtual, true);
  assert.match(f.provider, /GoHighLevel/);
  assert.equal(f.visibleFields, 3);
  assert.equal(f.captcha, 'Cloudflare Turnstile');
  assert.equal(f.submitLabel, 'ENVIAR');
  assert.ok(f.path && win.document.querySelector(f.path), 'o caminho CSS reencontra o container');
  assert.ok(win.document.querySelector(f.path).classList.contains('form-builder--wrap') || win.document.querySelector(f.path).classList.contains('hl-app'));

  // preenchimento em modo de ensaio pelo caminho, sem enviar
  globalThis.document = win.document; globalThis.location = win.location; globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.HTMLTextAreaElement = win.HTMLTextAreaElement; globalThis.HTMLSelectElement = win.HTMLSelectElement; globalThis.HTMLInputElement = win.HTMLInputElement; globalThis.Event = win.Event;
  win.document.querySelector(f.path).getBoundingClientRect = () => ({ width: 500, height: 400 });
  const r = trackEyeFillAndSubmit(0, { name: 'TESTE TRACK EYE', email: 'x@y', phone: '35999999999', message: 'm', dryRun: true }, f.path);
  assert.equal(r.ok, true); assert.equal(r.dryRun, true);
  assert.equal(win.document.getElementById('full_name').value, 'TESTE TRACK EYE');
  assert.equal(win.document.getElementById('phone').value, '35999999999');
  delete globalThis.document; delete globalThis.location; delete globalThis.getComputedStyle;

  const res = evaluate({ scan });
  assert.ok(res.checks.some((c) => c.id.endsWith('-captcha') && /Turnstile/.test(c.title)));
  assert.equal(byId(res, 'form-0-utm').status, 'unknown');
});

test('etapa de quiz e busca não viram formulário de lead; container com e-mail vira', () => {
  const html = `<!doctype html><html><body>
    <div class="quiz-step"><input type="number" name="entrada" placeholder="Valor de entrada"><button>Continuar →</button></div>
    <div class="estoque"><input type="search" name="q" placeholder="Buscar carro"><button>TODOS</button></div>
    <form role="search" id="busca"><input name="s" placeholder="Buscar"><button type="submit">Buscar</button></form>
    <div class="cta"><input type="email" name="email" placeholder="Seu e-mail"><button>Quero receber</button></div>
  </body></html>`;
  const win = new JSDOM(html, { url: 'https://quiz.exemplo.com/', pretendToBeVisual: true }).window;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  const scan = trackEyeScan(win);
  assert.equal(scan.forms.length, 2, 'o <form> de busca e o container com e-mail');
  assert.equal(scan.forms[0].id, 'busca'); assert.equal(scan.forms[0].lead, false);
  assert.equal(scan.forms[1].virtual, true); assert.equal(scan.forms[1].lead, true);
  const res = evaluate({ scan });
  assert.equal(res.checks.filter((c) => c.id.endsWith('-utm')).length, 1, 'origem só é avaliada no formulário de lead');
  assert.equal(byId(res, 'form-0'), undefined, 'busca não entra no laudo');
});

test('pixel disparado dentro de iframe não vira "mais de um pixel" na página', () => {
  const win = winOf('lp-widgets.html', 'https://lp.exemplo-fibra.com.br/');
  const scan = trackEyeScan(win);
  const events = [
    { t: 2000, kind: 'meta', frameId: 0, url: '', params: { id: '1111000011110000', ev: 'PageView' } },
    { t: 2100, kind: 'meta', frameId: 7, url: '', params: { id: '2222000022220000', ev: 'PageView' } },
  ];
  const res = evaluate({ scan, events, navs: [{ t: 1000, url: scan.url }] });
  assert.equal(byId(res, 'meta-multi'), undefined);
  assert.equal(byId(res, 'meta-1111000011110000').status, 'pass');
  assert.match(byId(res, 'meta-iframe').title, /2222000022220000/);
});

test('WhatsApp montado por JavaScript aparece como "não deu para conferir", não como ausente', () => {
  const win = winOf('lp-widgets.html', 'https://lp.exemplo.com/');
  const scan = trackEyeScan(win);
  scan.whatsappWidgets = [];
  const res = evaluate({ scan, deep: { waInJs: ['wa.me/${whatsNumero}?text='], numbersInJs: [], endpoints: ['/api/quiz'] } });
  assert.equal(byId(res, 'wa-js').status, 'unknown');
  assert.equal(byId(res, 'wa-none'), undefined);
});

test('teste de envio recusa formulário oculto e o laudo explica', () => {
  const html = '<!doctype html><html><body><form id="f" style="display:none"><input name="nome"><button type="submit">Enviar</button></form></body></html>';
  const win = new JSDOM(html, { url: 'https://quiz.exemplo.com/', pretendToBeVisual: true }).window;
  globalThis.document = win.document; globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.HTMLTextAreaElement = win.HTMLTextAreaElement; globalThis.HTMLSelectElement = win.HTMLSelectElement; globalThis.HTMLInputElement = win.HTMLInputElement; globalThis.Event = win.Event;
  const r = trackEyeFillAndSubmit(0, { name: 'T', email: 'e', phone: '1', message: 'm' });
  assert.equal(r.ok, false); assert.equal(r.hidden, true);
  delete globalThis.document; delete globalThis.getComputedStyle;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  const res = evaluate({ scan: trackEyeScan(win), test: { ok: false, hidden: true, error: r.error } });
  assert.equal(byId(res, 'test-fill').status, 'unknown');
  assert.match(byId(res, 'test-fill').title, /oculto/);
});

test('teste de envio sem nenhum sinal de envio vira crítico; com requisição observada vira pass', () => {
  const win = winOf('lp-widgets.html', 'https://lp.exemplo.com/');
  const scan = trackEyeScan(win);
  const started = 5000;
  const base = { ok: true, startedAt: started, url: scan.url, filled: [{ name: 'nome', value: 'T' }], submittedVia: 'clique', successBefore: [], after: { successNow: [], invalid: ['whatsapp'], stillVisible: true } };
  let res = evaluate({ scan, test: { ...base, submissions: [] }, navs: [{ t: 1000, url: scan.url }] });
  assert.equal(byId(res, 'test-sent').status, 'fail');
  assert.match(byId(res, 'test-sent').evidence, /whatsapp/);
  assert.equal(byId(res, 'test-meta').status, 'unknown');
  res = evaluate({ scan, test: { ...base, submissions: [{ t: started + 300, host: 'api.crmexemplo.com', path: '/widget/form/submit', method: 'POST' }], after: { successNow: ['Obrigado! Recebemos seus dados'], invalid: [] } }, navs: [{ t: 1000, url: scan.url }] });
  assert.equal(byId(res, 'test-sent').status, 'pass');
  assert.equal(byId(res, 'test-success').status, 'pass');
  assert.equal(byId(res, 'test-thanks').status, 'info');
});

test('origem no corpo do envio fecha a dúvida do formulário em JavaScript', () => {
  const html = '<!doctype html><html><body><form id="form-contato"><input name="nome"><input type="tel" name="whatsapp"><button type="submit">Receber</button></form></body></html>';
  const win = new JSDOM(html, { url: 'https://quiz.exemplo.com/?utm_source=teste&utm_medium=trackeye', pretendToBeVisual: true }).window;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  const scan = trackEyeScan(win);
  const started = 5000;
  const base = { ok: true, startedAt: started, url: scan.url, filled: [], submittedVia: 'clique', successBefore: [], after: { successNow: [], invalid: [] } };
  let res = evaluate({ scan, test: { ...base, submissions: [{ t: started + 200, host: 'quiz.exemplo.com', path: '/api/quiz', method: 'POST', utmKeys: ['utm_source', 'utm_medium'] }] }, navs: [{ t: 1000, url: scan.url }] });
  assert.equal(byId(res, 'test-origin').status, 'pass');
  assert.equal(byId(res, 'form-0-utm').status, 'pass');
  res = evaluate({ scan, test: { ...base, submissions: [{ t: started + 200, host: 'quiz.exemplo.com', path: '/api/quiz', method: 'POST', utmKeys: [] }] }, navs: [{ t: 1000, url: scan.url }] });
  assert.equal(byId(res, 'test-origin').status, 'warn');
  assert.equal(byId(res, 'form-0-utm').status, 'unknown');
});
