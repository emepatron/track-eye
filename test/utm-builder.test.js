import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS, getPlatform, normalizeUtmValue, missingFields, buildUtmQuery, buildUtmUrl, buildPlatformParams } from '../src/utm-builder.js';

const params = { source: 'google', medium: 'cpc', campaign: 'black-friday' };

test('padroniza texto: minúsculas, sem acento, espaço vira hífen', () => {
  assert.equal(normalizeUtmValue('  Black Friday Promoção! '), 'black-friday-promocao');
  assert.equal(normalizeUtmValue('a -- b'), 'a-b');
  assert.equal(normalizeUtmValue('paid_social.v2'), 'paid_social.v2');
  assert.equal(normalizeUtmValue(''), '');
  assert.equal(normalizeUtmValue(undefined), '');
});

test('preserva as macros de cada plataforma', () => {
  for (const macro of ['{{campaign.name}}', '{{CAMPAIGN_NAME}}', '{campaignid}', '{ifsearch:cpc}', '{ifsearch:[valor]}', '[campaign_name]', '__CAMPAIGN_NAME__']) {
    assert.equal(normalizeUtmValue(macro), macro);
  }
});

test('mistura texto e macro, padronizando só o texto', () => {
  assert.equal(normalizeUtmValue('Promo Verão {{ad.name}}'), 'promo-verao-{{ad.name}}');
  assert.equal(normalizeUtmValue('{campaignid} Fim'), '{campaignid}-fim');
  assert.equal(normalizeUtmValue('lp__CID__x'), 'lp__CID__x');
});

test('__minúsculo__ não é macro do TikTok: vira texto comum', () => {
  assert.equal(normalizeUtmValue('__Teste__'), '__teste__');
});

test('URL completa mantém as macros literais', () => {
  const url = buildUtmUrl('https://lp.exemplo.com/oferta', { source: 'bing', medium: '{ifsearch:cpc}', campaign: '[campaign_name]', content: '__CID_NAME__', term: '{{adset.name}}' });
  assert.equal(url, 'https://lp.exemplo.com/oferta?utm_source=bing&utm_medium={ifsearch:cpc}&utm_campaign=[campaign_name]&utm_content=__CID_NAME__&utm_term={{adset.name}}');
});

test('substitui UTM antiga e preserva os outros parâmetros e a âncora', () => {
  const url = buildUtmUrl('https://x.com/p?utm_source=velho&utm_term=velho&ref=abc&gclid=123#form', params);
  assert.equal(url, 'https://x.com/p?ref=abc&gclid=123&utm_source=google&utm_medium=cpc&utm_campaign=black-friday#form');
});

test('campo opcional vazio fica de fora', () => {
  assert.equal(buildUtmQuery({ ...params, content: '   ', term: '' }), 'utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
});

test('aceita URL sem protocolo e host com porta', () => {
  assert.equal(buildUtmUrl('exemplo.com/p', params), 'https://exemplo.com/p?utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
  assert.equal(buildUtmUrl('localhost:3000/p', params), 'https://localhost:3000/p?utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
});

test('recusa URL vazia, inválida e de outro protocolo', () => {
  assert.throws(() => buildUtmUrl('', params), /Informe a URL/);
  assert.throws(() => buildUtmUrl('não é url', params), /inválida/);
  assert.throws(() => buildUtmUrl('https://meu site.com', params), /inválida/);
  assert.throws(() => buildUtmUrl('ftp://x.com', params), /http/);
  assert.throws(() => buildUtmUrl('javascript://x.com/%0aalert(1)', params), /http/);
});

test('caractere que quebraria a URL dentro de macro é codificado', () => {
  const q = buildUtmQuery({ ...params, content: '{a&b=c#d}' });
  assert.equal(q, 'utm_source=google&utm_medium=cpc&utm_campaign=black-friday&utm_content={a%26b%3Dc%23d}');
  assert.equal(new URL(`https://x.com/?${q}`).searchParams.get('utm_content'), '{a&b=c#d}');
});

test('texto malicioso não injeta parâmetro', () => {
  const q = buildUtmQuery({ ...params, campaign: 'x&utm_source=hack#y' });
  assert.equal(new URLSearchParams(q).getAll('utm_source').length, 1);
  assert.ok(!q.includes('&utm_source=hack'));
});

test('parâmetros por plataforma: prefixos de Google, Bing e LinkedIn', () => {
  assert.equal(buildPlatformParams('google', params), '{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
  assert.equal(buildPlatformParams('bing', params), '{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
  assert.equal(buildPlatformParams('linkedin', params), 'account_id={{ACCOUNT_ID}}&utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
  assert.equal(buildPlatformParams('meta', params), 'utm_source=google&utm_medium=cpc&utm_campaign=black-friday');
});

test('campos obrigatórios: valor que some na padronização conta como vazio', () => {
  assert.deepEqual(missingFields(params), []);
  assert.deepEqual(missingFields({ source: 'a' }), ['medium', 'campaign']);
  assert.deepEqual(missingFields({ source: '!!!', medium: 'cpc', campaign: 'x' }), ['source']);
});

test('as 14 plataformas têm padrão utilizável, e toda macro sobrevive à padronização', () => {
  assert.equal(PLATFORMS.length, 14);
  assert.equal(new Set(PLATFORMS.map((p) => p.id)).size, 14);
  for (const p of PLATFORMS) {
    if (p.id !== 'default') assert.deepEqual(missingFields(p.defaults), [], p.id);
    const values = [...Object.values(p.defaults), ...Object.values(p.suggestions).flat()];
    for (const v of values) assert.equal(normalizeUtmValue(v), v, `${p.id}: ${v}`);
  }
});

test('plataforma desconhecida cai na genérica', () => {
  assert.equal(getPlatform('nada').id, 'default');
});
