import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/net.js';

const req = (url, extra = {}) => ({ url, timeStamp: 1000, frameId: 0, method: 'GET', ...extra });
const body = (text) => ({ requestBody: { raw: [{ bytes: new TextEncoder().encode(text).buffer }] } });

test('a sonda de bloqueio nunca vira evento', () => {
  assert.deepEqual(classify(req('https://www.googletagmanager.com/gtm.js?id=GTM-PROBE&te_probe=1')), []);
  assert.deepEqual(classify(req('https://www.clarity.ms/tag/probe?te_probe=1')), []);
});

test('GTM, gtag e pixel da Meta', () => {
  assert.equal(classify(req('https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234'))[0].params.id, 'GTM-ABC1234');
  const m = classify(req('https://www.facebook.com/tr/?id=3333000033330000&ev=PageView&dl=x'))[0];
  assert.equal(m.kind, 'meta'); assert.equal(m.params.ev, 'PageView');
});

test('GA4: evento na query, no corpo em lote, e sem nome', () => {
  const a = classify(req('https://analytics.google.com/g/collect?v=2&tid=G-EXEMPLO001&en=page_view'));
  assert.equal(a.length, 1); assert.equal(a[0].params.en, 'page_view');
  const b = classify(req('https://www.google-analytics.com/g/collect?v=2&tid=G-X', { method: 'POST', ...body('en=page_view&ep.a=1\nen=scroll&ep.b=2') }));
  assert.deepEqual(b.map((e) => e.params.en), ['page_view', 'scroll']);
  const c = classify(req('https://stats.g.doubleclick.net/g/collect?v=2&tid=G-X&cid=1'));
  assert.equal(c[0].kind, 'ga4'); assert.equal(c[0].params.en, '');
});

test('ccm/collect vai para Ads ou GA4 conforme o tid; rmkt é remarketing', () => {
  const ads = classify(req('https://www.google.com/ccm/collect?rcb=4&tid=AW-100000001&en=page_view&dl=x'))[0];
  assert.equal(ads.kind, 'ads'); assert.equal(ads.params.id, 'AW-100000001');
  const ga = classify(req('https://www.google.com/ccm/collect?tid=G-EXEMPLO001&en=page_view'))[0];
  assert.equal(ga.kind, 'ga4');
  const r = classify(req('https://www.google.com/rmkt/collect/100000001/?random=1&en=gtag.config'))[0];
  assert.equal(r.kind, 'ads'); assert.equal(r.params.id, 'AW-100000001'); assert.equal(r.params.remarketing, true);
});
