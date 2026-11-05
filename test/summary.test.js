import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, TRACK_STATE } from '../src/summary.js';

const empty = () => ({ code: [], runtime: [] });
const scanWith = (tags = {}, hooked = true) => ({
  log: { hooked },
  tags: { gtm: empty(), ga4: empty(), meta: empty(), ads: empty(), clarity: empty(), hotjar: empty(), tiktok: empty(), ...tags },
});
const ev = (kind, params = {}, extra = {}) => ({ t: 1000, kind, params, url: '', ...extra });
const row = (s, platform) => s.rows.filter((r) => r.platform === platform);

test('pixel disparado na rede vira rastreada, com o código na lista', () => {
  const s = summarize({ scan: scanWith({ meta: { code: ['111'], runtime: ['111'] } }), events: [ev('meta', { id: '111', ev: 'PageView' })] });
  assert.equal(s.status, 'rastreada');
  assert.deepEqual(row(s, 'meta'), [{ platform: 'meta', label: 'Meta Pixel', id: '111', state: TRACK_STATE.fired }]);
  assert.ok(s.notFound.includes('Google Analytics 4'));
  assert.ok(!s.notFound.includes('Meta Pixel'));
});

test('GTM carregado sozinho não conta como rastreada', () => {
  const s = summarize({ scan: scanWith({ gtm: { code: ['GTM-A'], runtime: ['GTM-A'] } }), events: [ev('gtm', { id: 'GTM-A' })] });
  assert.equal(s.status, 'parcial');
  assert.match(s.detail, /GTM carregou/);
});

test('tag só no código fica como parcial, nunca como disparada', () => {
  const s = summarize({ scan: scanWith({ ga4: { code: ['G-ABC123'], runtime: [] } }) });
  assert.equal(s.status, 'parcial');
  assert.equal(row(s, 'ga4')[0].state, TRACK_STATE.code);
});

test('sem tag e sem disparo vira sem rastreamento', () => {
  const s = summarize({ scan: scanWith() });
  assert.equal(s.status, 'sem');
  assert.equal(s.rows.length, 0);
  assert.equal(s.notFound.length, 7);
});

test('bloqueador nunca vira sem rastreamento', () => {
  const s = summarize({ scan: scanWith(), probe: { blocked: ['googletagmanager.com'], brave: true } });
  assert.equal(s.status, 'indefinido');
  assert.ok(s.needsReload);
  assert.match(s.detail, /Brave/);
});

test('bloqueio só do Clarity não invalida o resultado', () => {
  const s = summarize({ scan: scanWith(), probe: { blocked: ['clarity.ms'] } });
  assert.equal(s.status, 'sem');
});

test('bloqueador com disparo observado é rastreada, com aviso', () => {
  const s = summarize({ scan: scanWith(), events: [ev('meta', { id: '1' })], probe: { blocked: ['googletagmanager.com'] } });
  assert.equal(s.status, 'rastreada');
  assert.match(s.note, /bloqueador/);
});

test('página aberta antes da extensão pede recarga', () => {
  const s = summarize({ scan: scanWith({}, false) });
  assert.equal(s.status, 'indefinido');
  assert.ok(s.needsReload);
});

test('disparo só dentro de iframe não conta como rastreada, mas aparece', () => {
  const s = summarize({ scan: scanWith(), events: [ev('meta', { id: '9' }, { frameId: 4 })] });
  assert.equal(s.status, 'parcial');
  assert.equal(row(s, 'meta')[0].state, TRACK_STATE.frame);
  assert.match(s.detail, /iframe/);
});

test('requisição sem ID é atribuída ao único código conhecido', () => {
  const s = summarize({ scan: scanWith({ hotjar: { code: ['123456'], runtime: [] } }), events: [ev('hotjar')] });
  assert.deepEqual(row(s, 'hotjar').map((r) => [r.id, r.state]), [['123456', TRACK_STATE.fired]]);
});

test('requisição sem ID com dois códigos não afirma qual disparou', () => {
  const s = summarize({ scan: scanWith({ ga4: { code: ['G-AAAAAA', 'G-BBBBBB'], runtime: [] } }), events: [ev('ga4', { tid: '' })] });
  const rows = row(s, 'ga4');
  assert.equal(rows.find((r) => r.id === 'G-AAAAAA').state, TRACK_STATE.code);
  assert.equal(rows.find((r) => r.id === 'G-BBBBBB').state, TRACK_STATE.code);
  assert.equal(rows.find((r) => r.id === '').state, TRACK_STATE.fired);
});

test('dois pixels: cada código mostra o próprio estado', () => {
  const s = summarize({ scan: scanWith({ meta: { code: ['1', '2'], runtime: [] } }), events: [ev('meta', { id: '2' })] });
  const rows = row(s, 'meta');
  assert.equal(rows.find((r) => r.id === '1').state, TRACK_STATE.code);
  assert.equal(rows.find((r) => r.id === '2').state, TRACK_STATE.fired);
});

test('gtag.js baixado é carregado, não disparo', () => {
  const s = summarize({ scan: scanWith(), events: [ev('gtag', { id: 'G-XYZ123' })] });
  assert.equal(row(s, 'ga4')[0].state, TRACK_STATE.loaded);
  assert.equal(s.status, 'parcial');
});

test('eventos de visita anterior não contam', () => {
  const s = summarize({ scan: scanWith(), events: [ev('meta', { id: '1' }, { t: 100 })], navs: [{ t: 50000, url: 'https://x.com' }] });
  assert.equal(s.status, 'sem');
});
