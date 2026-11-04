import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { trackEyeScan } from '../src/scanner.js';
import { evaluate, samePhone, normalizePhone, currentPageEvents } from '../src/rules.js';
import { toMarkdown, toShort } from '../src/report.js';

const scanOf = (file, url) => {
  const html = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const win = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true }).window;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  return trackEyeScan(win);
};
const byId = (res, id) => res.checks.find((c) => c.id === id);
const t0 = 1_000_000;
const ev = (kind, params, dt = 100) => ({ t: t0 + dt, kind, url: '', params });

test('telefones: normaliza 55, DDD e nono dígito', () => {
  assert.equal(normalizePhone('+55 (35) 99999-0000'), '35999990000');
  assert.equal(samePhone('5535999990000', '(35) 99999-0000'), true);
  assert.equal(samePhone('35999990000', '3599990000'), true);
  assert.equal(samePhone('35999990000', '31999990000'), false);
});

test('eventos da visita atual: só depois da última navegação', () => {
  const events = [ev('meta', {}, -5000), ev('meta', {}, 50)];
  const navs = [{ t: t0, url: 'https://x' }];
  assert.equal(currentPageEvents(events, navs).length, 1);
});

test('LP completa com tudo disparando e cliente certo fica verde ou amarela', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/?utm_source=instagram');
  scan.propagated.hiddenFilled = [1];
  scan.forms[0].utmHidden[0].value = 'instagram';
  const events = [
    ev('gtm', { id: 'GTM-ABC1234' }), ev('ga4', { tid: 'G-XYZ98765', en: 'page_view' }),
    ev('meta', { id: '1234567890123456', ev: 'PageView' }), ev('clarity', { id: 'abcd1234ef' }),
  ];
  const res = evaluate({ scan, events, navs: [{ t: t0, url: scan.url }], client: { name: 'Exemplo', whatsapp: ['35999990000'] } });
  assert.equal(byId(res, 'gtm').status, 'pass');
  assert.equal(byId(res, 'ga4').status, 'pass');
  assert.equal(byId(res, 'meta-1234567890123456').status, 'pass');
  assert.equal(byId(res, 'clarity').status, 'pass');
  assert.equal(byId(res, 'wa-5535999990000').status, 'pass');
  assert.equal(byId(res, 'utm-wa').status, 'warn'); // rodapé sem UTM
  assert.equal(byId(res, 'utm-form-0').status, 'pass');
  assert.equal(byId(res, 'https').status, 'pass');
  assert.equal(res.counts.fail, 0);
  assert.equal(res.verdict, 'amarelo');
});

test('número de WhatsApp diferente do cadastro é crítico', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/');
  const res = evaluate({ scan, client: { name: 'Exemplo', whatsapp: ['31988880000'] } });
  const c = byId(res, 'wa-5535999990000');
  assert.equal(c.status, 'fail');
  assert.match(c.evidence, /\(31\) 98888-0000/);
  assert.equal(res.verdict, 'vermelho');
});

test('pixel presente sem PageView vira atenção; GTM no código sem carregar também', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/');
  const res = evaluate({ scan, events: [] });
  assert.equal(byId(res, 'gtm').status, 'warn');
  assert.equal(byId(res, 'meta-1234567890123456').status, 'warn');
  assert.equal(byId(res, 'ga4').status, 'warn');
  assert.equal(byId(res, 'utm').status, 'unknown');
});

test('PageView duplicado e dois pixels são achados', () => {
  const scan = scanOf('lp-quebrada.html', 'https://ruim.exemplo.com/');
  const events = [ev('meta', { id: '1111111111111111', ev: 'PageView' }), ev('meta', { id: '1111111111111111', ev: 'PageView' }, 200)];
  const res = evaluate({ scan, events });
  assert.equal(byId(res, 'meta-1111111111111111').status, 'warn');
  assert.match(byId(res, 'meta-1111111111111111').title, /duplicado/);
  assert.equal(byId(res, 'meta-multi').status, 'warn');
  assert.equal(byId(res, 'ga4').status, 'fail');
  assert.equal(byId(res, 'wa-nonumber').status, 'warn');
  assert.equal(byId(res, 'form-0-http').status, 'fail');
  assert.equal(byId(res, 'form-0-long').status, 'warn');
  assert.equal(byId(res, 'form-0-utm').status, 'warn');
  assert.equal(byId(res, 'embed-typebot').status, 'unknown');
  assert.equal(byId(res, 'title').status, 'warn');
  assert.equal(res.verdict, 'vermelho');
});

test('teste de envio: Lead na Meta e redirect para obrigado', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/');
  const started = t0 + 1000;
  const events = [ev('meta', { id: '1234567890123456', ev: 'PageView' }), { t: started + 800, kind: 'meta', url: '', params: { id: '1234567890123456', ev: 'Lead' } }, { t: started + 900, kind: 'ga4', url: '', params: { tid: 'G-XYZ98765', en: 'generate_lead' } }];
  const navs = [{ t: t0, url: scan.url }, { t: started + 700, url: 'https://lp.exemplo.com.br/obrigado' }];
  const test = { ok: true, startedAt: started, url: scan.url, filled: [{ name: 'nome', value: 'TESTE TRACK EYE' }], submittedVia: 'clique', dataLayerEvents: ['form_submit'] };
  const res = evaluate({ scan, events, navs, test });
  assert.equal(byId(res, 'test-thanks').status, 'pass');
  assert.equal(byId(res, 'meta-1234567890123456').status, 'pass', 'PageView da página de origem continua valendo depois do redirect');
  assert.equal(byId(res, 'test-meta').status, 'pass');
  assert.equal(byId(res, 'test-ga4').status, 'pass');
  assert.equal(byId(res, 'test-ads').status, 'warn');
  assert.match(byId(res, 'test-dl').title, /form_submit/);
});

test('bloqueador de anúncios: tags viram "não deu para conferir", sem vermelho', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/');
  const probe = { blocked: ['googletagmanager.com', 'google-analytics.com', 'connect.facebook.net', 'clarity.ms'], ok: [], brave: true };
  const res = evaluate({ scan, probe, events: [] });
  assert.equal(byId(res, 'blocked').status, 'warn');
  assert.match(byId(res, 'blocked').evidence, /Brave/);
  assert.equal(byId(res, 'gtm').status, 'unknown');
  assert.equal(byId(res, 'ga4').status, 'unknown');
  assert.equal(byId(res, 'meta-1234567890123456').status, 'warn', 'pixel no código continua sendo relatado como presente sem PageView');
  assert.equal(byId(res, 'clarity').status, 'pass', 'Clarity no código continua valendo como evidência');
  assert.notEqual(res.verdict, 'vermelho');
  const quebrada = evaluate({ scan: scanOf('lp-quebrada.html', 'https://ruim.exemplo.com/'), probe, events: [] });
  assert.equal(byId(quebrada, 'clarity').status, 'unknown');
  assert.equal(byId(quebrada, 'ga4').status, 'unknown');
});

test('formulário em JavaScript sem campos ocultos: origem vira "não deu para conferir", ou pass se há UTM em storage', () => {
  const html = '<!doctype html><html><head><title>Quiz</title></head><body><form id="form-contato"><input name="nome"><input type="tel" name="whatsapp"><button type="submit">Receber</button></form></body></html>';
  const win = new JSDOM(html, { url: 'https://quiz.exemplo.com/', pretendToBeVisual: true }).window;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [] };
  let res = evaluate({ scan: trackEyeScan(win) });
  assert.equal(byId(res, 'form-0-utm').status, 'unknown');
  win.localStorage.setItem('utm_source', 'fb');
  res = evaluate({ scan: trackEyeScan(win) });
  assert.equal(byId(res, 'form-0-utm').status, 'pass');
  assert.match(byId(res, 'form-0-utm').evidence, /localStorage\.utm_source/);
});

test('GA4 com hits sem nome legível conta como disparando', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/');
  const res = evaluate({ scan, events: [ev('ga4', { tid: 'G-XYZ98765', en: '' }), ev('ga4', { tid: 'G-XYZ98765', en: '' }, 300)] });
  assert.equal(byId(res, 'ga4').status, 'pass');
  assert.match(byId(res, 'ga4').evidence, /2 hit/);
});

test('laudo em markdown e versão curta', () => {
  const scan = scanOf('lp-quebrada.html', 'https://ruim.exemplo.com/');
  const result = evaluate({ scan, client: { name: 'Cliente Ruim', whatsapp: ['31988887777'] } });
  const md = toMarkdown({ scan, result, client: { name: 'Cliente Ruim' }, analyst: 'Pedro', version: '0.1.0' });
  assert.match(md, /# Track Eye/);
  assert.match(md, /Cliente Ruim/);
  assert.match(md, /## Achados/);
  assert.match(md, /VERMELHO/);
  assert.match(md, /Analista:\*\* Pedro/);
  const short = toShort({ scan, result, client: { name: 'Cliente Ruim' } });
  assert.match(short, /Achados:/);
});
