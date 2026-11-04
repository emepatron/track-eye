import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { trackEyeReachForm, trackEyeFillAndSubmit, trackEyeIsVisible } from '../src/scanner.js';

// jsdom não calcula layout: um elemento é "visível" se nem ele nem um
// ancestral estiver com display:none.
function setupWindow(file) {
  const html = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const win = new JSDOM(html, { url: 'https://quiz.exemplo.com/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
  win.Element.prototype.getBoundingClientRect = function () {
    let n = this;
    while (n && n.nodeType === 1) {
      if ((n.style && n.style.display === 'none') || n.hidden) return { top: 0, left: 0, width: 0, height: 0 };
      n = n.parentElement;
    }
    return { top: 100, left: 0, width: 300, height: 40 };
  };
  globalThis.document = win.document; globalThis.location = win.location; globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.HTMLTextAreaElement = win.HTMLTextAreaElement; globalThis.HTMLSelectElement = win.HTMLSelectElement; globalThis.HTMLInputElement = win.HTMLInputElement; globalThis.Event = win.Event;
  return win;
}
const teardown = () => { for (const k of ['document', 'location', 'getComputedStyle', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLInputElement', 'Event']) delete globalThis[k]; };

test('quiz: avança sozinho até o formulário, preenche e envia', async () => {
  const win = setupWindow('lp-quiz.html');
  try {
    assert.equal(trackEyeIsVisible(0, '#form-contato').visible, false);
    const r = await trackEyeReachForm(0, '#form-contato', 10);
    assert.equal(r.reached, true, JSON.stringify(r));
    assert.ok(r.steps >= 3, 'opção da etapa 1, opção da etapa 2 e Continuar');
    assert.match(r.log.join(' | '), /Até R\$ 80 mil/);
    assert.match(r.log.join(' | '), /Continuar/);
    assert.equal(trackEyeIsVisible(0, '#form-contato').visible, true);
    const fill = trackEyeFillAndSubmit(0, { name: 'TESTE TRACK EYE', email: 'x@y', phone: '35999999999', message: 'm' }, '#form-contato');
    assert.equal(fill.ok, true);
    assert.equal(JSON.stringify(win.__submitted), JSON.stringify({ nome: 'TESTE TRACK EYE', whatsapp: '35999999999' }));
  } finally { teardown(); }
});

test('quiz sem saída: para sem progresso e informa', async () => {
  const win = setupWindow('lp-quiz.html');
  try {
    // quebra o fluxo: a etapa 2 nunca aparece
    win.document.querySelectorAll('[data-etapa="1"] [data-valor]').forEach((b) => { const c = b.cloneNode(true); b.replaceWith(c); });
    const r = await trackEyeReachForm(0, '#form-contato', 6);
    assert.equal(r.reached, false);
    assert.ok(r.log.some((l) => /sem progresso|nada para clicar/.test(l)), JSON.stringify(r.log));
  } finally { teardown(); }
});
