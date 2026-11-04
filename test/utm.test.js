import test from 'node:test';
import assert from 'node:assert/strict';
import { withTestUtm, parseTemplate, DEFAULT_UTM_TEMPLATE } from '../src/utm.js';

const date = new Date(2026, 10, 4, 9, 7); // 04/11/2026 09:07

test('monta a URL de teste com o modelo padrão e a data', () => {
  const out = withTestUtm('https://lp.exemplo.com.br/oferta', DEFAULT_UTM_TEMPLATE, date);
  assert.equal(out, 'https://lp.exemplo.com.br/oferta?utm_source=trackeye&utm_medium=teste&utm_campaign=auditoria&utm_content=20261104');
});

test('substitui UTM que já existia e preserva os outros parâmetros e a âncora', () => {
  const out = withTestUtm('https://lp.exemplo.com.br/?utm_source=instagram&ref=abc#form', 'utm_source=teste&utm_campaign=x', date);
  const u = new URL(out);
  assert.equal(u.searchParams.get('utm_source'), 'teste');
  assert.equal(u.searchParams.get('utm_campaign'), 'x');
  assert.equal(u.searchParams.get('ref'), 'abc');
  assert.equal(u.hash, '#form');
});

test('aceita URL sem protocolo, modelo com "?" e placeholder {hora}', () => {
  const out = withTestUtm('exemplo.com/p', '?utm_source=t&utm_content={data}-{hora}', date);
  assert.equal(out, 'https://exemplo.com/p?utm_source=t&utm_content=20261104-0907');
});

test('recusa URL vazia, inválida e modelo vazio', () => {
  assert.throws(() => withTestUtm(''), /Cole a URL/);
  assert.throws(() => withTestUtm('não é uma url'), /inválida/);
  assert.throws(() => withTestUtm('https://exemplo.com', '   '), /pelo menos um/);
  assert.throws(() => withTestUtm('ftp://exemplo.com'), /http/);
});

test('parseTemplate separa pares e tolera valor vazio', () => {
  assert.deepEqual(parseTemplate('a=1&b=&c'), [['a', '1'], ['b', ''], ['c', '']]);
  assert.deepEqual(parseTemplate(''), []);
});
