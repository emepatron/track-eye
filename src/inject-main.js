// Roda no mundo da página (MAIN), antes de qualquer script dela.
// Só observa: registra o que passa pelo dataLayer, pelo fbq e pelo gtag,
// mais erros de console, em window.__trackEye. Não altera comportamento.
(() => {
  if (window.__trackEye) return;
  const log = {
    startedAt: Date.now(),
    dataLayer: [],
    fbq: [],
    gtag: [],
    errors: [],
    forms: [],
  };
  Object.defineProperty(window, '__trackEye', { value: log, enumerable: false });

  const snapshot = (args) => {
    try {
      return JSON.parse(JSON.stringify(args, (k, v) => (typeof v === 'function' ? '[fn]' : v)));
    } catch {
      return args.map((a) => String(a));
    }
  };
  const push = (list, args) => {
    if (list.length < 500) list.push({ t: Date.now(), args: snapshot(Array.from(args)) });
  };

  // dataLayer: o GTM troca o push pelo dele, então re-embrulha quando mudar.
  const wrapDataLayer = () => {
    const dl = window.dataLayer;
    if (!Array.isArray(dl)) return;
    if (dl.push.__trackEye) return;
    const original = dl.push;
    const wrapped = function (...args) {
      push(log.dataLayer, args);
      return original.apply(this, args);
    };
    wrapped.__trackEye = true;
    dl.push = wrapped;
    if (!dl.__trackEyeSeeded) {
      dl.__trackEyeSeeded = true;
      for (const item of dl) push(log.dataLayer, [item]);
    }
  };
  const wrapFbq = () => {
    const f = window.fbq;
    if (typeof f !== 'function' || f.__trackEye) return;
    const wrapped = function (...args) {
      push(log.fbq, args);
      return f.apply(this, args);
    };
    for (const k of Object.keys(f)) wrapped[k] = f[k];
    wrapped.__trackEye = true;
    wrapped.__original = f;
    window.fbq = wrapped;
    if (window._fbq === f) window._fbq = wrapped;
    if (Array.isArray(f.queue) && !f.__trackEyeSeeded) {
      f.__trackEyeSeeded = true;
      for (const item of f.queue) push(log.fbq, Array.from(item));
    }
  };
  const wrapGtag = () => {
    const g = window.gtag;
    if (typeof g !== 'function' || g.__trackEye) return;
    const wrapped = function (...args) {
      push(log.gtag, args);
      return g.apply(this, args);
    };
    wrapped.__trackEye = true;
    window.gtag = wrapped;
  };
  const tick = () => { wrapDataLayer(); wrapFbq(); wrapGtag(); };
  tick();
  const timer = setInterval(tick, 300);
  setTimeout(() => clearInterval(timer), 60_000);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);

  window.addEventListener('error', (e) => {
    if (log.errors.length < 50) {
      log.errors.push({
        t: Date.now(),
        message: String(e.message || e.error || 'erro'),
        source: e.filename ? `${e.filename}:${e.lineno}` : '',
        resource: e.target && e.target !== window ? (e.target.src || e.target.href || e.target.tagName) : '',
      });
    }
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    if (log.errors.length < 50) {
      log.errors.push({ t: Date.now(), message: 'Promise: ' + String(e.reason && e.reason.message || e.reason), source: '' });
    }
  });

  // Envio de formulário: registra o momento, para cruzar com os eventos.
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    log.forms.push({
      t: Date.now(),
      id: form.id || '',
      action: form.getAttribute('action') || '',
      fields: form.querySelectorAll('input,select,textarea').length,
    });
  }, true);
})();
