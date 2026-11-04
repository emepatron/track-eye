import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { trackEyeScan } from '../src/scanner.js';
import { evaluate } from '../src/rules.js';
import { toMarkdown } from '../src/report.js';

const scanOf = (file, url, hooks = {}) => {
  const html = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const win = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true }).window;
  win.__trackEye = { dataLayer: [], fbq: [], gtag: [], errors: [], forms: [], ...hooks };
  return trackEyeScan(win);
};
const byId = (res, id) => res.checks.find((c) => c.id === id);
const t0 = 1_000_000;
const ev = (kind, params, dt = 100) => ({ t: t0 + dt, kind, url: '', params });

test('página de vendas: reconhece Hotmart, produto, botões e quem leva a origem', () => {
  const scan = scanOf('lp-vendas.html', 'https://curso.exemplo.com.br/?utm_source=instagram', { fbq: [{ t: 1, args: ['track', 'ViewContent', { value: 497 }] }] });
  const cm = scan.commerce;
  assert.equal(cm.kind, 'vendas');
  assert.equal(cm.platform, 'Hotmart');
  assert.equal(cm.product.name, 'Curso Exemplo');
  assert.equal(cm.product.price, '497.00');
  assert.equal(cm.checkoutLinks.length, 2);
  assert.deepEqual(cm.checkoutLinks.map((b) => b.originKeys.length), [2, 0]);
  assert.ok(!cm.buyButtons.some((b) => /whatsapp/i.test(b.href)), 'link de WhatsApp não é botão de compra');
  assert.ok(cm.funnelEvents.includes('fbq:ViewContent'));
});

test('loja WooCommerce: reconhece a plataforma, o carrinho e o checkout interno', () => {
  const scan = scanOf('loja.html', 'https://lojaexemplo.com.br/produto/tenis-exemplo/');
  const cm = scan.commerce;
  assert.equal(cm.kind, 'loja');
  assert.equal(cm.platform, 'WooCommerce');
  assert.equal(cm.product.name, 'Tênis Exemplo');
  assert.ok(cm.buyButtons.some((b) => /carrinho/i.test(b.text)));
  assert.ok(cm.checkoutLinks.some((b) => b.internal && /\/checkout\//.test(b.href)));
});

test('página comum não ganha grupo Compra', () => {
  const scan = scanOf('lp-completa.html', 'https://lp.exemplo.com.br/');
  const res = evaluate({ scan, events: [], navs: [{ t: t0, url: scan.url }] });
  assert.ok(!res.checks.some((c) => c.group === 'compra'));
});

test('regras: link de checkout sem origem é crítico quando a página veio com UTM; Purchase fica não conferido', () => {
  const scan = scanOf('lp-vendas.html', 'https://curso.exemplo.com.br/?utm_source=instagram');
  const events = [ev('meta', { id: '1234567890123456', ev: 'PageView' }), ev('meta', { id: '1234567890123456', ev: 'ViewContent' })];
  const res = evaluate({ scan, events, navs: [{ t: t0, url: scan.url }] });
  assert.equal(byId(res, 'buy-view').status, 'pass');
  assert.equal(byId(res, 'buy-origin').status, 'fail');
  assert.match(byId(res, 'buy-origin').title, /1 de 2/);
  assert.equal(byId(res, 'buy-purchase').status, 'unknown');
  assert.match(byId(res, 'buy-purchase').evidence, /Hotmart/);
  assert.equal(res.verdict, 'vermelho');
});

test('regras: sem ViewContent vira atenção; sem UTM na página o link sem origem é atenção', () => {
  const scan = scanOf('lp-vendas.html', 'https://curso.exemplo.com.br/');
  const res = evaluate({ scan, events: [ev('meta', { id: '1234567890123456', ev: 'PageView' })], navs: [{ t: t0, url: scan.url }] });
  assert.equal(byId(res, 'buy-view').status, 'warn');
  assert.equal(byId(res, 'buy-origin').status, 'warn');
});

test('teste de clique: InitiateCheckout, begin_checkout e checkout com origem passam', () => {
  const scan = scanOf('lp-vendas.html', 'https://curso.exemplo.com.br/?utm_source=instagram');
  const startedAt = t0 + 5000;
  const events = [
    ev('meta', { id: '1234567890123456', ev: 'PageView' }),
    ev('meta', { id: '1234567890123456', ev: 'InitiateCheckout' }, 5300),
    ev('ga4', { tid: 'G-XYZ98765', en: 'begin_checkout' }, 5400),
  ];
  const navs = [{ t: t0, url: scan.url }, { t: t0 + 6000, url: 'https://pay.hotmart.com/A1B2C3D4?src=lp-topo&sck=instagram' }];
  const buy = { ok: true, startedAt, url: scan.url, href: 'https://pay.hotmart.com/A1B2C3D4?src=lp-topo&sck=instagram', text: 'Quero garantir minha vaga' };
  const res = evaluate({ scan, events, navs, buy });
  assert.equal(byId(res, 'buy-click-meta').status, 'pass');
  assert.equal(byId(res, 'buy-click-ga4').status, 'pass');
  assert.equal(byId(res, 'buy-click-nav').status, 'pass');
  assert.equal(byId(res, 'buy-click-origin').status, 'pass');
  const md = toMarkdown({ scan, result: res, client: null, analyst: '', version: '0.4.0' });
  assert.match(md, /Compra/);
  assert.match(md, /InitiateCheckout/);
});

test('teste de clique: sem evento e sem navegação é crítico na Meta e atenção na navegação', () => {
  const scan = scanOf('lp-vendas.html', 'https://curso.exemplo.com.br/');
  const startedAt = t0 + 5000;
  const events = [ev('meta', { id: '1234567890123456', ev: 'PageView' })];
  const buy = { ok: true, startedAt, url: scan.url, href: '', text: 'Comprar agora' };
  const res = evaluate({ scan, events, navs: [{ t: t0, url: scan.url }], buy });
  assert.equal(byId(res, 'buy-click-meta').status, 'fail');
  assert.equal(byId(res, 'buy-click-nav').status, 'warn');
});
