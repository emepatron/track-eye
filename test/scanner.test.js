import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { trackEyeScan, trackEyeFillAndSubmit } from '../src/scanner.js';

const load = (file, url) => {
  const html = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  return dom.window;
};

test('LP completa: encontra GTM, GA4, Meta, Ads e Clarity no código', () => {
  const scan = trackEyeScan(load('lp-completa.html', 'https://lp.exemplo.com.br/oferta?utm_source=instagram&utm_campaign=lancamento'));
  assert.deepEqual(scan.tags.gtm.code, ['GTM-ABC1234']);
  assert.deepEqual(scan.tags.ga4.code, ['G-XYZ98765']);
  assert.deepEqual(scan.tags.meta.code, ['1234567890123456']);
  assert.deepEqual(scan.tags.ads.code, ['AW-123456789']);
  assert.deepEqual(scan.tags.clarity.code, ['abcd1234ef']);
  assert.equal(scan.https, true);
  assert.equal(scan.title, 'LP Completa — Teste');
  assert.deepEqual(scan.h1, ['Resolva seu problema hoje']);
});

test('LP completa: links de WhatsApp com número, mensagem e origem', () => {
  const scan = trackEyeScan(load('lp-completa.html', 'https://lp.exemplo.com.br/'));
  assert.equal(scan.whatsapp.length, 2);
  const [top, foot] = scan.whatsapp;
  assert.equal(top.phone, '5535999990000');
  assert.equal(top.hasMessage, true);
  assert.equal(top.hasOrigin, true);
  assert.match(top.message, /campanha do Instagram/);
  assert.equal(foot.phone, '5535999990000');
  assert.equal(foot.hasMessage, false);
  assert.deepEqual(scan.tel, ['553533330000']);
});

test('LP completa: formulário com provedor, campos e UTM ocultos', () => {
  const scan = trackEyeScan(load('lp-completa.html', 'https://lp.exemplo.com.br/?utm_source=instagram'));
  assert.equal(scan.forms.length, 1);
  const f = scan.forms[0];
  assert.equal(f.id, 'lead-form');
  assert.equal(f.provider, 'Elementor');
  assert.equal(f.visibleFields, 3);
  assert.equal(f.hiddenFields, 2);
  assert.equal(f.utmHidden.length, 2);
  assert.equal(f.actionHost, 'hooks.n8n.cloud');
  assert.equal(f.submitLabel, 'Quero uma proposta');
  assert.deepEqual(scan.utm, { utm_source: 'instagram' });
  assert.deepEqual(scan.propagated.hiddenFilled, [0]);
});

test('LP quebrada: dois pixels, WhatsApp sem número, form longo em HTTP e iframe', () => {
  const scan = trackEyeScan(load('lp-quebrada.html', 'https://ruim.exemplo.com/'));
  assert.deepEqual(scan.tags.meta.code, ['1111111111111111', '2222222222222222']);
  assert.deepEqual(scan.tags.gtm.code, []);
  assert.equal(scan.whatsapp.length, 2);
  assert.equal(scan.whatsapp[1].phone, '');
  assert.equal(scan.forms[0].visibleFields, 7);
  assert.match(scan.forms[0].action, /^http:/);
  assert.equal(scan.embeddedForms.length, 1);
  assert.equal(scan.embeddedForms[0].provider, 'typebot');
  assert.equal(scan.title, '');
  assert.equal(scan.meta.viewport, '');
});

test('preenche e envia o formulário com dados de teste', () => {
  const win = load('lp-completa.html', 'https://lp.exemplo.com.br/');
  globalThis.document = win.document;
  globalThis.location = win.location;
  globalThis.HTMLTextAreaElement = win.HTMLTextAreaElement;
  globalThis.HTMLSelectElement = win.HTMLSelectElement;
  globalThis.HTMLInputElement = win.HTMLInputElement;
  globalThis.Event = win.Event;
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  let submitted = false;
  const form = win.document.getElementById('lead-form');
  form.getBoundingClientRect = () => ({ top: 400, width: 600, height: 300 }); // jsdom não calcula layout
  form.addEventListener('submit', (e) => { submitted = true; e.preventDefault(); });
  const r = trackEyeFillAndSubmit(0, { name: 'TESTE TRACK EYE', email: 'teste@trackeye.teste', phone: '35999999999', message: 'teste' });
  assert.equal(r.ok, true);
  assert.equal(win.document.querySelector('[name=email]').value, 'teste@trackeye.teste');
  assert.equal(win.document.querySelector('[name=whatsapp]').value, '35999999999');
  assert.equal(win.document.querySelector('[name=nome]').value, 'TESTE TRACK EYE');
  assert.equal(submitted, true);
  assert.match(r.submittedVia, /Quero uma proposta/);
  delete globalThis.document; delete globalThis.location; delete globalThis.getComputedStyle;
});
