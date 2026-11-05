// Resumo da tela Início: a página está rastreada? Com quais plataformas e códigos?
// Mesma regra do laudo: só afirma o que tem evidência. Bloqueador ou página aberta
// antes da extensão viram "indefinido", nunca "sem rastreamento".
import { currentPageEvents, lastNavBefore } from './rules.js';

export const TRACK_STATE = { fired: 'fired', loaded: 'loaded', code: 'code', frame: 'frame' };

export const PLATFORMS = [
  { key: 'gtm', label: 'Google Tag Manager' },
  { key: 'ga4', label: 'Google Analytics 4' },
  { key: 'meta', label: 'Meta Pixel' },
  { key: 'ads', label: 'Google Ads' },
  { key: 'clarity', label: 'Microsoft Clarity' },
  { key: 'hotjar', label: 'Hotjar' },
  { key: 'tiktok', label: 'TikTok Pixel' },
];

const eventId = (e) => (e.kind === 'ga4' ? e.params.tid : e.params.id) || '';

function platformRows({ key, label }, scan, main, frames) {
  const tag = scan.tags[key] || { code: [], runtime: [] };
  const states = new Map();
  for (const id of tag.code) states.set(id, TRACK_STATE.code);
  for (const id of tag.runtime) states.set(id, TRACK_STATE.loaded);
  // gtag.js baixado prova que o script carregou, não que um evento saiu.
  const prefix = { ga4: 'G-', ads: 'AW-' }[key];
  if (prefix) for (const e of main) if (e.kind === 'gtag' && eventId(e).startsWith(prefix)) states.set(eventId(e), TRACK_STATE.loaded);

  const fired = main.filter((e) => e.kind === key);
  for (const e of fired) if (eventId(e)) states.set(eventId(e), TRACK_STATE.fired);
  // Requisição sem ID só é atribuída quando há um único código conhecido; com
  // mais de um, não dá para afirmar qual deles disparou.
  if (fired.some((e) => !eventId(e))) {
    if (states.size === 1) states.set([...states.keys()][0], TRACK_STATE.fired);
    else states.set('', TRACK_STATE.fired);
  }
  for (const e of frames.filter((x) => x.kind === key)) {
    const id = eventId(e);
    if (id ? !states.has(id) : !states.size) states.set(id, TRACK_STATE.frame);
  }
  return [...states].map(([id, state]) => ({ platform: key, label, id, state }));
}

export function summarize({ scan, probe = null, events = [], navs = [], test = null }) {
  const since = test && test.startedAt ? lastNavBefore(navs, test.startedAt) - 1500 : undefined;
  const current = currentPageEvents(events, navs, since);
  const main = current.filter((e) => !e.frameId);
  const frames = current.filter((e) => e.frameId);

  const rows = PLATFORMS.flatMap((p) => platformRows(p, scan, main, frames));
  const notFound = PLATFORMS.filter((p) => !rows.some((r) => r.platform === p.key)).map((p) => p.label);
  // O GTM é só o carregador: sozinho, não prova que alguma plataforma recebeu dados.
  const firing = PLATFORMS.filter((p) => p.key !== 'gtm' && rows.some((r) => r.platform === p.key && r.state === TRACK_STATE.fired));
  const gtmLoaded = rows.some((r) => r.platform === 'gtm' && (r.state === TRACK_STATE.fired || r.state === TRACK_STATE.loaded));
  const blockedHosts = (probe && probe.blocked) || [];
  const blocked = blockedHosts.some((h) => h !== 'clarity.ms');
  const hooked = !!(scan.log && scan.log.hooked);

  let status, detail, needsReload = false;
  if (firing.length) {
    status = 'rastreada';
    detail = `${firing.length === 1 ? '1 plataforma disparou' : `${firing.length} plataformas dispararam`} nesta visita.`;
  } else if (blocked) {
    status = 'indefinido'; needsReload = true;
    detail = `${probe.brave ? 'Os Shields do Brave estão bloqueando' : 'Um bloqueador está barrando'} os rastreadores nesta aba. Desligue para este site e recarregue.`;
  } else if (!hooked) {
    status = 'indefinido'; needsReload = true;
    detail = 'A página abriu antes da extensão, então os disparos não foram observados. Recarregue para conferir.';
  } else if (rows.length) {
    status = 'parcial';
    if (rows.some((r) => r.state === TRACK_STATE.frame)) detail = 'Só houve disparo dentro de iframe, não na página em si.';
    else if (gtmLoaded) detail = 'O GTM carregou, mas nenhuma plataforma disparou nesta visita.';
    else detail = 'Há tags na página, mas nenhum disparo foi visto nesta visita.';
  } else {
    status = 'sem';
    detail = 'Nenhuma tag no código e nenhum disparo na rede.';
  }
  const note = firing.length && blocked ? 'Há um bloqueador ativo nesta aba: outras plataformas podem estar sendo barradas.' : '';
  return { status, detail, note, needsReload, rows, notFound };
}
