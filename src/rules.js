// Regras do laudo. Entrada: a varredura (scanner), os eventos de rede
// observados pelo background, o cliente cadastrado (opcional) e o resultado
// do teste de envio (opcional). Saída: lista de checagens com status, evidência
// e correção, mais o veredito. Honestidade: só afirma o que tem evidência; o
// que não deu para conferir fica como "unknown".

export const STATUS = { pass: 'pass', warn: 'warn', fail: 'fail', info: 'info', unknown: 'unknown' };

export function normalizePhone(value) {
  let d = String(value || '').replace(/\D+/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

export function samePhone(a, b) {
  const x = normalizePhone(a), y = normalizePhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // 11 dígitos com o 9 do celular contra 10 sem o 9
  if (x.length === 11 && y.length === 10 && x.slice(0, 2) === y.slice(0, 2) && x.slice(3) === y.slice(2)) return true;
  if (y.length === 11 && x.length === 10 && y.slice(0, 2) === x.slice(0, 2) && y.slice(3) === x.slice(2)) return true;
  return false;
}

export function formatPhone(value) {
  const d = normalizePhone(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '—';
}

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

// Eventos da visita atual: depois da última navegação principal (ou todos,
// quando a lista de navegações está vazia).
export function currentPageEvents(events, navs, sinceTs) {
  const list = events || [];
  if (typeof sinceTs === 'number') return list.filter((e) => e.t >= sinceTs);
  const lastNav = (navs || []).reduce((acc, n) => (n.t > acc ? n.t : acc), 0);
  return list.filter((e) => e.t >= lastNav - 1500);
}

export function lastNavBefore(navs, ts) {
  return (navs || []).filter((n) => n.t <= ts).reduce((acc, n) => (n.t > acc ? n.t : acc), 0);
}

export function evaluate({ scan, probe = null, deep = null, events = [], navs = [], client = null, test = null }) {
  const checks = [];
  const add = (c) => { checks.push({ evidence: '', fix: '', ...c }); return c; };

  // Bloqueador de anúncios ou Brave Shields: o que não carregou é efeito do
  // navegador, não da página. As checagens de tag viram "não deu para conferir".
  const blockedHosts = (probe && probe.blocked) || [];
  const blocked = (host) => blockedHosts.includes(host);
  if (blockedHosts.length) {
    const core = blockedHosts.some((h) => h !== 'clarity.ms');
    add({ id: 'blocked', group: 'saude', status: core ? STATUS.warn : STATUS.info, title: `Navegador bloqueando rastreadores (${blockedHosts.join(', ')})`,
      evidence: core
        ? `${probe.brave ? 'Os Shields do Brave' : 'Um bloqueador de anúncios'} impediram o download desses scripts nesta aba. Tudo que aparece como não carregado nas Tags pode ser só isso.`
        : `${probe.brave ? 'O Brave' : 'O bloqueador'} barrou só o Clarity nesta aba; GTM, GA4 e Meta carregaram normalmente. Afeta apenas a checagem do Clarity.`,
      fix: probe.brave ? 'Clique no leão na barra de endereço, desligue os Shields para este site, recarregue e varra de novo.' : 'Desative o bloqueador para este site (ou use uma janela sem extensões), recarregue e varra de novo.' });
  }
  // Com teste de envio, a "visita atual" é a página de onde o teste partiu,
  // não a página de obrigado para onde ela navegou depois.
  const evAll = currentPageEvents(events, navs, test && test.startedAt ? lastNavBefore(navs, test.startedAt) - 1500 : undefined);
  // Tags da página são as do frame principal; o que dispara dentro de iframes
  // (formulário embutido de CRM, por exemplo) é reportado à parte.
  const ev = evAll.filter((e) => !e.frameId);
  const evFrames = evAll.filter((e) => e.frameId);
  const byKind = (kind) => ev.filter((e) => e.kind === kind);
  const t = scan.tags;
  const gtmLoaded = t.gtm.runtime.length > 0 || byKind('gtm').length > 0;
  const hooked = scan.log && scan.log.hooked;

  if (!hooked) {
    add({ id: 'hook', group: 'saude', status: STATUS.unknown, title: 'Página carregada antes da extensão',
      evidence: 'O observador do Track Eye não estava ativo quando a página abriu. Chamadas de pixel e dataLayer feitas antes disso não foram capturadas.',
      fix: 'Recarregue a página (F5) com a extensão ligada e varra de novo.' });
  }

  // ---------------- Tags ----------------
  const gtmIds = uniq([...t.gtm.code, ...t.gtm.runtime, ...byKind('gtm').map((e) => e.params.id)]);
  if (gtmIds.length === 0) {
    add({ id: 'gtm', group: 'tags', status: STATUS.info, title: 'Sem Google Tag Manager',
      evidence: 'Nenhum container GTM no código nem carregado em runtime. As tags, se existirem, estão direto no código.',
      fix: 'Não é erro. O GTM facilita manutenção; avalie centralizar as tags nele.' });
  } else if (!gtmLoaded && blocked('googletagmanager.com')) {
    add({ id: 'gtm', group: 'tags', status: STATUS.unknown, title: `GTM no código (${gtmIds.join(', ')}), bloqueado pelo navegador`,
      evidence: 'O snippet está na página, mas o gtm.js não baixou por causa do bloqueador. Não dá para dizer se as tags dentro dele funcionam.',
      fix: 'Desligue o bloqueador para este site, recarregue e varra de novo.' });
  } else if (!gtmLoaded) {
    add({ id: 'gtm', group: 'tags', status: STATUS.warn, title: `GTM no código, mas não carregou (${gtmIds.join(', ')})`,
      evidence: 'O ID aparece no HTML, mas o script gtm.js não foi baixado nem criou o objeto google_tag_manager.',
      fix: 'Confira se o snippet está completo e se o container está publicado. Bloqueador de anúncios no navegador também causa isso: teste em janela anônima sem extensões.' });
  } else {
    const loads = byKind('gtm');
    const dup = gtmIds.filter((id) => loads.filter((e) => e.params.id === id).length > 1);
    add({ id: 'gtm', group: 'tags', status: dup.length ? STATUS.warn : STATUS.pass,
      title: dup.length ? `GTM carregado duas vezes (${dup.join(', ')})` : `GTM carregado (${gtmIds.join(', ')})`,
      evidence: dup.length ? 'O mesmo container foi baixado mais de uma vez nesta visita: provável snippet duplicado (tema e plugin, por exemplo).' : `Container${gtmIds.length > 1 ? 's' : ''} ativo${gtmIds.length > 1 ? 's' : ''} com objeto google_tag_manager presente.`,
      fix: dup.length ? 'Deixe um único snippet do GTM no head.' : '' });
    if (gtmIds.length > 1) add({ id: 'gtm-multi', group: 'tags', status: STATUS.warn, title: `Mais de um container GTM (${gtmIds.join(', ')})`,
      evidence: 'Dois containers na mesma página costumam significar agência antiga mais agência nova, cada uma com seus pixels.',
      fix: 'Confirme qual é o container oficial e remova o outro, migrando as tags que ainda importam.' });
  }

  const ga4Fired = byKind('ga4');
  const ga4Ids = uniq([...t.ga4.code, ...t.ga4.runtime, ...ga4Fired.map((e) => e.params.tid)]);
  const ga4PageView = ga4Fired.filter((e) => (e.params.en || '').toLowerCase() === 'page_view');
  const tagsBlocked = blocked('googletagmanager.com') || blocked('google-analytics.com');
  if (ga4PageView.length) {
    add({ id: 'ga4', group: 'tags', status: STATUS.pass, title: `GA4 disparando (${uniq(ga4PageView.map((e) => e.params.tid)).join(', ')})`,
      evidence: `page_view enviado ${ga4PageView.length}x nesta visita.` });
  } else if (tagsBlocked) {
    add({ id: 'ga4', group: 'tags', status: STATUS.unknown, title: ga4Ids.length ? `GA4 no código (${ga4Ids.join(', ')}), bloqueado pelo navegador` : 'GA4 não deu para conferir (navegador bloqueando)',
      evidence: 'Sem o script do Google carregar, nenhuma chamada ao GA4 sai, com ou sem tag na página.', fix: 'Desligue o bloqueador para este site, recarregue e varra de novo.' });
  } else if (ga4Fired.length && ga4Fired.every((e) => !e.params.en)) {
    add({ id: 'ga4', group: 'tags', status: STATUS.pass, title: `GA4 disparando (${uniq(ga4Fired.map((e) => e.params.tid)).filter(Boolean).join(', ') || ga4Ids.join(', ')})`,
      evidence: `${ga4Fired.length} hit(s) enviado(s) ao GA4 nesta visita. O nome do evento não veio legível na requisição (vai no corpo), então o page_view não pôde ser confirmado pelo nome; o primeiro hit da visita é o page_view.` });
  } else if (ga4Ids.length) {
    add({ id: 'ga4', group: 'tags', status: STATUS.warn, title: `GA4 presente, mas sem page_view observado (${ga4Ids.join(', ')})`,
      evidence: ga4Fired.length ? `Houve ${ga4Fired.length} chamada(s) ao GA4, nenhuma de page_view.` : 'O ID está configurado, mas nenhuma chamada ao endpoint /g/collect saiu durante a visita.',
      fix: 'Abra a página em janela anônima sem bloqueador e varra de novo. Se persistir, confira a tag de configuração do GA4 no GTM (gatilho All Pages) ou o snippet gtag.' });
  } else if (gtmLoaded) {
    add({ id: 'ga4', group: 'tags', status: STATUS.warn, title: 'GA4 não observado',
      evidence: 'Há GTM na página, mas nenhum ID G- apareceu e nenhuma chamada ao GA4 saiu. Pode estar no container sem disparar nesta visita, ou não existir.',
      fix: 'Confirme no GTM (Tags → GA4 Configuration, gatilho All Pages). Sem GA4 a página fica invisível no Analytics.' });
  } else {
    add({ id: 'ga4', group: 'tags', status: STATUS.fail, title: 'Sem GA4',
      evidence: 'Nenhum ID G-, nenhum gtag e nenhuma chamada ao GA4.',
      fix: 'Instale o GA4 (de preferência pelo GTM). Sem ele não há funil, origem nem comportamento.' });
  }

  const metaFired = byKind('meta');
  const metaIds = uniq([...t.meta.code, ...t.meta.runtime, ...metaFired.map((e) => e.params.id)]);
  if (metaIds.length === 0 && (blocked('connect.facebook.net') || blocked('googletagmanager.com'))) {
    add({ id: 'meta', group: 'tags', status: STATUS.unknown, title: 'Pixel da Meta não deu para conferir (navegador bloqueando)',
      evidence: 'O fbevents.js ou o GTM não baixaram por causa do bloqueador; sem eles o pixel não aparece nem dispara.', fix: 'Desligue o bloqueador para este site, recarregue e varra de novo.' });
  } else if (metaIds.length === 0) {
    add({ id: 'meta', group: 'tags', status: gtmLoaded ? STATUS.warn : STATUS.fail, title: 'Pixel da Meta não observado',
      evidence: gtmLoaded ? 'Há GTM, mas nenhum fbq init e nenhuma chamada a facebook.com/tr nesta visita.' : 'Nenhum fbq, nenhum ID de pixel, nenhuma chamada a facebook.com/tr.',
      fix: 'Se o cliente roda Meta Ads, a página precisa do pixel base (PageView em todas as páginas). Instale pelo GTM ou pelo snippet oficial.' });
  } else {
    for (const id of metaIds) {
      const pv = metaFired.filter((e) => e.params.id === id && (e.params.ev || '').toLowerCase() === 'pageview');
      const inits = (scan.log.fbqCalls || []).filter((a) => a[0] === 'init' && String(a[1]) === id).length;
      if (pv.length > 1 || inits > 1) {
        add({ id: `meta-${id}`, group: 'tags', status: STATUS.warn, title: `Pixel ${id} duplicado`,
          evidence: `PageView enviado ${pv.length}x e init chamado ${inits}x na mesma visita. Eventos dobrados inflam o gerenciador.`,
          fix: 'Deixe o pixel em um lugar só: ou no GTM ou no código da página, nunca nos dois.' });
      } else if (pv.length === 1) {
        add({ id: `meta-${id}`, group: 'tags', status: STATUS.pass, title: `Pixel da Meta disparando (${id})`, evidence: 'PageView enviado 1x nesta visita.' });
      } else {
        add({ id: `meta-${id}`, group: 'tags', status: STATUS.warn, title: `Pixel ${id} presente, mas sem PageView observado`,
          evidence: metaFired.some((e) => e.params.id === id) ? 'Houve chamada ao pixel, mas não de PageView.' : 'O pixel está inicializado ou no código, mas nenhuma chamada a facebook.com/tr saiu.',
          fix: 'Teste em janela anônima sem bloqueador. Se persistir, confira se fbq("track","PageView") roda depois do init.' });
      }
    }
    if (metaIds.length > 1) add({ id: 'meta-multi', group: 'tags', status: STATUS.warn, title: `Mais de um pixel da Meta (${metaIds.join(', ')})`,
      evidence: 'Dois pixels distintos na mesma página: normalmente um de agência anterior ou da BM errada.',
      fix: 'Confirme com o cliente qual pixel pertence à BM atual e remova o outro.' });
  }

  const adsFired = byKind('ads');
  const adsIds = uniq([...t.ads.code, ...t.ads.runtime]);
  if (adsIds.length || adsFired.length) {
    add({ id: 'ads', group: 'tags', status: STATUS.pass, title: `Tag do Google Ads presente (${uniq([...adsIds, ...adsFired.map((e) => e.params.id)]).join(', ')})`,
      evidence: adsFired.length ? `${adsFired.length} chamada(s) de conversão ou remarketing nesta visita.` : 'Tag configurada; conversão só dispara no envio do formulário (ver teste de envio).' });
  } else {
    add({ id: 'ads', group: 'tags', status: STATUS.info, title: 'Sem tag do Google Ads',
      evidence: 'Nenhum ID AW- nem chamada a googleadservices.',
      fix: 'Sem problema se o cliente não roda Google Ads. Se roda, a conversão precisa estar aqui (ou importada do GA4).' });
  }

  const clarityOn = t.clarity.code.length || t.clarity.runtime.length || scan.runtimeFlags.clarity || byKind('clarity').length;
  add(clarityOn
    ? { id: 'clarity', group: 'tags', status: STATUS.pass, title: `Microsoft Clarity ativo${t.clarity.code.length ? ` (${t.clarity.code.join(', ')})` : ''}`, evidence: 'Gravação de sessão e mapa de calor disponíveis.' }
    : (blocked('clarity.ms') || blocked('googletagmanager.com'))
      ? { id: 'clarity', group: 'tags', status: STATUS.unknown, title: 'Clarity não deu para conferir (navegador bloqueando)', evidence: 'O script do Clarity (ou o GTM que o carrega) foi bloqueado nesta aba.' }
      : { id: 'clarity', group: 'tags', status: STATUS.warn, title: 'Sem Microsoft Clarity', evidence: 'Nenhum script do Clarity observado.', fix: 'Clarity é gratuito e mostra onde o visitante trava. Instale pelo GTM.' });
  const framePixels = uniq(evFrames.filter((e) => e.kind === 'meta').map((e) => e.params.id)).filter((id) => !metaIds.includes(id));
  if (framePixels.length) add({ id: 'meta-iframe', group: 'tags', status: STATUS.info, title: `Pixel da Meta dentro de iframe (${framePixels.join(', ')}), diferente do pixel da página`,
    evidence: 'Dispara de dentro de um formulário ou widget embutido (GoHighLevel, por exemplo). Costuma ser o pixel configurado na conta do widget.',
    fix: 'Confira se esse pixel pertence à BM do cliente. Se o Lead do formulário dispara só por ele, a campanha precisa otimizar por esse pixel.' });
  if (t.hotjar.code.length || scan.runtimeFlags.hotjar) add({ id: 'hotjar', group: 'tags', status: STATUS.info, title: `Hotjar presente${t.hotjar.code.length ? ` (${t.hotjar.code.join(', ')})` : ''}` });
  if (t.tiktok.code.length || scan.runtimeFlags.tiktok) add({ id: 'tiktok', group: 'tags', status: STATUS.info, title: `Pixel do TikTok presente${t.tiktok.code.length ? ` (${t.tiktok.code.join(', ')})` : ''}` });

  // ---------------- WhatsApp ----------------
  const expected = (client && client.whatsapp) || [];
  const links = scan.whatsapp || [];
  const widgets = scan.whatsappWidgets || [];
  const chats = scan.chats || [];
  const waInJs = (deep && deep.waInJs) || [];
  const numbersInJs = (deep && deep.numbersInJs) || [];
  for (const wdg of widgets) {
    add({ id: `wa-widget-${wdg.label.slice(0, 20)}`, group: 'whatsapp', status: STATUS.unknown, title: `Botão de WhatsApp sem link direto: "${wdg.label}" (${wdg.position})`,
      evidence: `Elemento <${wdg.tag}>${wdg.classes ? ' .' + wdg.classes.split(' ')[0] : ''} abre o WhatsApp ou um chat por JavaScript${wdg.frameHost ? `, dentro do iframe ${wdg.frameHost}` : ''}. O número não aparece no HTML, então não dá para conferir com o cadastro.`,
      fix: 'Clique no botão e confira na mão se abre o número certo (ou o chat certo). Se for chatbot próprio, confira se a conversa chega no WhatsApp ou no CRM do cliente.' });
  }
  for (const c of chats) add({ id: `chat-${c.slice(0, 20)}`, group: 'whatsapp', status: STATUS.info, title: `Chat na página: ${c}`,
    evidence: 'Widget de atendimento carregado. Lead que entra por aqui não passa pelo formulário nem pelo link de WhatsApp.', fix: 'Confira se o chat está conectado ao número ou ao CRM certo e se marca a origem da conversa.' });
  if (links.length === 0 && (waInJs.length || numbersInJs.length)) {
    add({ id: 'wa-js', group: 'whatsapp', status: STATUS.unknown, title: 'WhatsApp montado por JavaScript',
      evidence: `O link aparece no código JS e não no HTML: ${[...waInJs, ...numbersInJs].slice(0, 3).join(' · ')}. Costuma surgir depois de uma etapa (quiz, formulário).`,
      fix: 'Complete a etapa na página e varra de novo, ou confira o número no JS.' });
  }
  if (links.length === 0 && !widgets.length && !waInJs.length && !numbersInJs.length) {
    add({ id: 'wa-none', group: 'whatsapp', status: STATUS.info, title: 'Sem link de WhatsApp na página',
      evidence: 'Nenhum wa.me, api.whatsapp.com ou whatsapp:// encontrado' + (chats.length ? ', mas há chat na página.' : '.'), fix: chats.length ? '' : 'Normal em funil só de formulário. Em negócio local, o botão de WhatsApp costuma ser o CTA principal.' });
  } else if (links.length) {
    const noNumber = links.filter((l) => !l.phone);
    if (noNumber.length) add({ id: 'wa-nonumber', group: 'whatsapp', status: STATUS.warn, title: `${noNumber.length} link(s) de WhatsApp sem número`,
      evidence: `Abre o WhatsApp sem número definido (${uniq(noNumber.map((l) => l.position)).join(', ')}).`, fix: 'Use o formato https://wa.me/55DDDNUMERO?text=... para abrir direto na conversa do cliente.' });
    const numbers = uniq(links.map((l) => l.phone));
    for (const n of numbers) {
      const where = uniq(links.filter((l) => l.phone === n).map((l) => l.position)).join(', ');
      if (expected.length) {
        const ok = expected.some((e) => samePhone(e, n));
        add(ok
          ? { id: `wa-${n}`, group: 'whatsapp', status: STATUS.pass, title: `WhatsApp ${formatPhone(n)} confere com o cadastro`, evidence: `Encontrado em: ${where}.` }
          : { id: `wa-${n}`, group: 'whatsapp', status: STATUS.fail, title: `WhatsApp ${formatPhone(n)} não bate com o cadastro do cliente`,
            evidence: `Esperado: ${expected.map(formatPhone).join(' ou ')}. Encontrado em: ${where}.`,
            fix: 'Corrija o número no botão antes de subir campanha. Número errado manda lead para o nada.' });
      } else {
        add({ id: `wa-${n}`, group: 'whatsapp', status: STATUS.info, title: `WhatsApp ${formatPhone(n)} encontrado`,
          evidence: `Em: ${where}. Cadastre o cliente no Track Eye para conferir o número automaticamente.` });
      }
    }
    const noMsg = links.filter((l) => l.phone && !l.hasMessage);
    if (noMsg.length) add({ id: 'wa-msg', group: 'whatsapp', status: STATUS.warn, title: `${noMsg.length} de ${links.length} link(s) de WhatsApp sem mensagem pré-preenchida`,
      evidence: noMsg.map((l) => `"${l.label || 'sem texto'}" (${l.position})`).slice(0, 5).join('; '),
      fix: 'Adicione ?text= com a origem ("Vim pela campanha X do Instagram") para o comercial saber de onde o lead veio.' });
    const noOrigin = links.filter((l) => l.phone && l.hasMessage && !l.hasOrigin);
    if (noOrigin.length) add({ id: 'wa-origin', group: 'whatsapp', status: STATUS.warn, title: `${noOrigin.length} link(s) de WhatsApp com mensagem sem identificar a origem`,
      evidence: noOrigin.map((l) => `"${l.message.slice(0, 60)}"`).slice(0, 3).join('; '),
      fix: 'Inclua na mensagem o nome da campanha ou da página, para atribuição no CRM.' });
  }
  if (expected.length && scan.tel && scan.tel.length) {
    const wrong = scan.tel.filter((n) => !expected.some((e) => samePhone(e, n)));
    if (wrong.length) add({ id: 'tel', group: 'whatsapp', status: STATUS.warn, title: `Link tel: com número fora do cadastro (${wrong.map(formatPhone).join(', ')})`,
      evidence: 'Pode ser telefone fixo legítimo do cliente; confira.', fix: 'Se for número antigo, troque.' });
  }

  // ---------------- Formulários ----------------
  const allForms = scan.forms || [];
  // Só formulário de lead (com campo de contato) entra no laudo; busca, filtro e
  // etapa de quiz ficam no inventário.
  const forms = allForms.filter((f) => f.lead !== false);
  const others = allForms.filter((f) => f.lead === false);
  if (forms.length === 0 && (scan.embeddedForms || []).length === 0) {
    add({ id: 'form-none', group: 'forms', status: STATUS.info, title: 'Sem formulário de lead na página',
      evidence: others.length ? `Há ${others.length} formulário(s) sem campo de contato (busca, filtro ou etapa): ${others.map((o) => o.id || o.submitLabel || `#${o.index + 1}`).join(', ')}.` : 'Nenhum <form> nem iframe de formulário conhecido.' });
  }
  forms.forEach((f) => {
    const label = f.id || f.name || `formulário ${f.index + 1}`;
    add({ id: `form-${f.key || f.index}`, group: 'forms', status: STATUS.info, title: `${label}: ${f.provider}, ${f.visibleFields} campo(s) visível(is)${f.inChat ? ' (dentro do chat)' : ''}`,
      evidence: [f.action ? `Envia para ${f.actionHost} (${f.method})` : 'Sem action: o envio é feito por JavaScript', f.submitLabel ? `botão "${f.submitLabel}"` : '', `posição: ${f.position}${f.visible === false ? ' (aparece depois de uma etapa)' : ''}`, f.frameHost ? `iframe ${f.frameHost}` : ''].filter(Boolean).join(' · ') });
    if (f.captcha) add({ id: `form-${f.key || f.index}-captcha`, group: 'forms', status: STATUS.info, title: `${label} tem ${f.captcha}`,
      evidence: 'Proteção contra robô no envio. O teste automático do Track Eye pode ser barrado por ela.', fix: 'Se o teste não enviar, preencha na mão uma vez para conferir o Lead.' });
    if (f.visibleFields > 6) add({ id: `form-${f.index}-long`, group: 'forms', status: STATUS.warn, title: `${label} é longo (${f.visibleFields} campos)`,
      evidence: f.fields.map((x) => x.name || x.placeholder || x.type).join(', '), fix: 'Cada campo a mais derruba conversão. Peça só o que o comercial usa no primeiro contato.' });
    if (f.action && /^http:/.test(f.action)) add({ id: `form-${f.index}-http`, group: 'forms', status: STATUS.fail, title: `${label} envia por HTTP sem criptografia`, evidence: f.action, fix: 'Troque o action para HTTPS.' });
    if (f.inChat) return; // formulário do chat não é o formulário de lead da página
    if (f.utmHidden.length === 0) {
      const stored = scan.originStorage || [];
      const jsForm = !f.action || !!f.frameHost || f.virtual;
      const sentKeys = uniq(((test && test.submissions) || []).flatMap((s) => s.utmKeys || []));
      if (sentKeys.length) add({ id: `form-${f.index}-utm`, group: 'forms', status: STATUS.pass, title: `${label}: origem vai junto no envio (confirmado pelo teste)`,
        evidence: `Chaves no corpo do envio: ${sentKeys.join(', ')}.` });
      else if (stored.length) add({ id: `form-${f.index}-utm`, group: 'forms', status: STATUS.pass, title: `${label}: origem guardada por JavaScript`,
        evidence: `Sem campos ocultos, mas a página persiste a origem em ${stored.slice(0, 5).join(', ')}. Confirme no CRM que o lead chega com UTM.` });
      else if (jsForm) add({ id: `form-${f.index}-utm`, group: 'forms', status: STATUS.unknown, title: `${label}: não dá para ver se o envio leva a origem`,
        evidence: 'Envio por JavaScript, sem campos ocultos de UTM e sem UTM persistida em storage ou cookie. O script pode ler a URL na hora do envio (comum em quiz e Lovable).',
        fix: 'Faça o teste de envio e confira no CRM se o lead chegou com utm_source, utm_campaign e fbclid. Se chegou, está certo.' });
      else add({ id: `form-${f.index}-utm`, group: 'forms', status: STATUS.warn, title: `${label} não guarda a origem (sem campos ocultos de UTM)`,
        evidence: f.hiddenFields ? `Campos ocultos: ${f.hidden.map((h) => h.name).join(', ')}` : 'Nenhum campo oculto.',
        fix: 'Adicione campos ocultos utm_source, utm_medium, utm_campaign (e gclid/fbclid) preenchidos pela URL. Sem isso o CRM não sabe de qual campanha o lead veio.' });
    }
  });
  for (const e of scan.embeddedForms || []) {
    const scanned = forms.some((f) => f.frameUrl && e.src && f.frameUrl.split('?')[0] === e.src.split('?')[0]);
    if (scanned) continue; // o formulário do iframe já foi varrido e listado acima
    add({ id: `embed-${e.provider}`, group: 'forms', status: STATUS.unknown, title: `Formulário embutido via iframe (${e.provider})`,
      evidence: e.src, fix: 'O conteúdo do iframe não respondeu à varredura. Teste o envio manualmente e confira o evento no GTM Preview.' });
  }

  // ---------------- UTM ----------------
  const utmKeys = Object.keys(scan.utm || {});
  if (utmKeys.length === 0) {
    add({ id: 'utm', group: 'utm', status: STATUS.unknown, title: 'Página aberta sem UTM',
      evidence: 'Sem parâmetros na URL não dá para testar a propagação.', fix: 'Abra a LP pelo link final do anúncio (ou cole uma URL com utm_source=teste) e varra de novo.' });
  } else {
    add({ id: 'utm-present', group: 'utm', status: STATUS.pass, title: `UTM na URL: ${utmKeys.join(', ')}`, evidence: utmKeys.map((k) => `${k}=${scan.utm[k]}`).join(' · ') });
    const waLinks = scan.whatsapp || [];
    if (waLinks.length) {
      const ok = (scan.propagated.whatsapp || []).filter(Boolean).length;
      add(ok === waLinks.length
        ? { id: 'utm-wa', group: 'utm', status: STATUS.pass, title: 'UTM chega nos links de WhatsApp', evidence: `${ok} de ${waLinks.length} link(s) carregam a origem.` }
        : { id: 'utm-wa', group: 'utm', status: ok ? STATUS.warn : STATUS.fail, title: `UTM não chega em ${waLinks.length - ok} de ${waLinks.length} link(s) de WhatsApp`,
          evidence: 'O visitante clica e a origem se perde antes de chegar ao comercial.', fix: 'Script que lê a UTM da URL e injeta na mensagem do wa.me, ou mensagem fixa por campanha.' });
    }
    forms.forEach((f) => {
      if (!f.utmHidden.length) return;
      const filled = (scan.propagated.hiddenFilled || [])[f.index] || 0;
      add(filled > 0
        ? { id: `utm-form-${f.index}`, group: 'utm', status: STATUS.pass, title: `Campos ocultos de UTM preenchidos (${f.id || `formulário ${f.index + 1}`})`, evidence: f.utmHidden.filter((h) => h.value).map((h) => `${h.name}=${h.value}`).join(' · ') }
        : { id: `utm-form-${f.index}`, group: 'utm', status: STATUS.fail, title: `Campos ocultos de UTM existem mas estão vazios (${f.id || `formulário ${f.index + 1}`})`,
          evidence: f.utmHidden.map((h) => h.name).join(', '), fix: 'O script que copia a UTM da URL para os campos não rodou. Confira o plugin ou o snippet.' });
    });
  }

  // ---------------- Saúde ----------------
  add(scan.https
    ? { id: 'https', group: 'saude', status: STATUS.pass, title: 'HTTPS ativo' }
    : { id: 'https', group: 'saude', status: STATUS.fail, title: 'Página sem HTTPS', evidence: scan.url, fix: 'Force HTTPS no servidor e no DNS. Sem isso o navegador avisa "não seguro" e o pixel pode ser bloqueado.' });
  const h = scan.health || {};
  if (h.cssFailed && h.cssFailed.length) add({ id: 'css-fail', group: 'saude', status: STATUS.fail, title: `${h.cssFailed.length} arquivo(s) de CSS não carregou`,
    evidence: h.cssFailed.map((r) => `${r.status} ${r.name}`).slice(0, 5).join('\n'), fix: 'Limpe o cache (LiteSpeed, Elementor, CDN) e confira se o arquivo existe no servidor. Página sem CSS aparece "quebrada" só para o visitante.' });
  else if ((h.linkCss || 0) === 0 && (h.styleSheets || 0) === 0) add({ id: 'css-none', group: 'saude', status: STATUS.warn, title: 'Nenhuma folha de estilo carregada', evidence: 'Sem <link rel="stylesheet"> e sem styleSheets no documento.', fix: 'Confira se o tema ou o builder está entregando o CSS.' });
  else if (/times new roman|^serif$/i.test(h.bodyFont || '')) add({ id: 'css-font', group: 'saude', status: STATUS.warn, title: 'Página parece estar sem CSS (fonte padrão do navegador)', evidence: `font-family do body: ${h.bodyFont}`, fix: 'Sinal clássico de cache de CSS vazio (Elementor Element Caching). Desative e purgue o cache.' });
  const otherFailed = (h.failedResources || []).filter((r) => !(h.cssFailed || []).includes(r));
  if (otherFailed.length) add({ id: 'res-fail', group: 'saude', status: STATUS.warn, title: `${otherFailed.length} recurso(s) com erro HTTP`, evidence: otherFailed.map((r) => `${r.status} ${r.name}`).slice(0, 5).join('\n'), fix: 'Imagens, scripts ou fontes quebradas. Confira os caminhos.' });
  if (h.errorCount) add({ id: 'js-errors', group: 'saude', status: STATUS.warn, title: `${h.errorCount} erro(s) de JavaScript no console`,
    evidence: (h.errors || []).slice(0, 3).map((e) => e.message + (e.source ? ` (${e.source})` : '') + (e.resource ? ` [${e.resource}]` : '')).join('\n'),
    fix: 'Erro de JS pode impedir o formulário de enviar ou o pixel de disparar. Peça ao dev para olhar o console.' });
  if (!scan.title) add({ id: 'title', group: 'saude', status: STATUS.warn, title: 'Página sem <title>', fix: 'Defina um título: aparece na aba, no Google e nos relatórios do GA4.' });
  if (!scan.meta.viewport) add({ id: 'viewport', group: 'saude', status: STATUS.warn, title: 'Sem meta viewport', evidence: 'A página pode não se adaptar ao celular.', fix: 'Adicione <meta name="viewport" content="width=device-width, initial-scale=1">.' });
  if (!scan.meta.description) add({ id: 'description', group: 'saude', status: STATUS.info, title: 'Sem meta description', fix: 'Só importa se a página também busca tráfego orgânico.' });
  if (h.nav && h.nav.load) add({ id: 'load', group: 'saude', status: h.nav.load > 5000 ? STATUS.warn : STATUS.pass, title: `Carregamento completo em ${(h.nav.load / 1000).toFixed(1)} s`,
    evidence: `TTFB ${h.nav.ttfb} ms · DOM pronto ${h.nav.domLoaded} ms · ${h.nav.protocol || ''}`.trim(), fix: h.nav.load > 5000 ? 'Acima de 5 s no desktop costuma passar de 8 s no celular. Comprima imagens e remova scripts que não usa.' : '' });

  // ---------------- Teste de envio ----------------
  if (test && test.hidden) {
    const adv = test.advanced || {};
    add({ id: 'test-fill', group: 'teste', status: STATUS.unknown, title: 'Teste não executado: formulário oculto nesta etapa',
      evidence: [test.error || 'O formulário está em display:none (provável quiz ou etapa anterior).', adv.log && adv.log.length ? `Tentei avançar sozinho: ${adv.log.join(' → ').slice(0, 200)}.` : ''].filter(Boolean).join(' '),
      fix: 'Avance na página até o formulário aparecer na tela e rode o teste de novo; o Track Eye espera até 3 minutos por isso.' });
  } else if (test && test.startedAt) {
    const after = (events || []).filter((e) => e.t >= test.startedAt - 200);
    const navAfter = (navs || []).filter((n) => n.t >= test.startedAt && n.url !== test.url);
    const filled = (test.filled || []).filter((f) => !f.error).length;
    const subs = test.submissions || [];
    if (test.advanced && test.advanced.steps) add({ id: 'test-advance', group: 'teste', status: STATUS.info, title: `Fluxo em etapas percorrido automaticamente (${test.advanced.steps} clique(s))`,
      evidence: (test.advanced.log || []).join(' → ').slice(0, 300), fix: 'As respostas do teste são sempre a primeira opção de cada etapa; o lead de teste chega com essas respostas.' });
    const post = test.after || {};
    const successNew = (post.successNow || []).filter((s) => !(test.successBefore || []).includes(s));
    const invalid = post.invalid || [];
    add({ id: 'test-fill', group: 'teste', status: test.ok ? STATUS.info : STATUS.fail, title: test.ok ? `Formulário preenchido com ${filled} campo(s) de teste e enviado (${test.submittedVia})` : `Não foi possível enviar: ${test.error}`,
      evidence: (test.filled || []).map((f) => `${f.name}: ${f.value || f.error}`).join(' · ') });
    // O envio saiu de verdade?
    const sent = navAfter.length > 0 || subs.length > 0 || successNew.length > 0;
    if (subs.length) add({ id: 'test-sent', group: 'teste', status: STATUS.pass, title: `Envio observado para ${uniq(subs.map((s) => s.host)).join(', ')}`,
      evidence: subs.slice(0, 4).map((s) => `${s.method} ${s.host}${s.path}`).join(' · ') });
    const utmSent = uniq(subs.flatMap((s) => s.utmKeys || []));
    if (subs.length && Object.keys(scan.utm || {}).length) {
      add(utmSent.length
        ? { id: 'test-origin', group: 'teste', status: STATUS.pass, title: `Origem foi junto no envio (${utmSent.join(', ')})`, evidence: 'As chaves de UTM apareceram no corpo da requisição de envio. O CRM recebe de qual campanha o lead veio.' }
        : { id: 'test-origin', group: 'teste', status: STATUS.warn, title: 'Origem não foi junto no envio', evidence: `A página tinha UTM na URL, mas nenhuma chave utm_, fbclid ou gclid apareceu no corpo do envio para ${uniq(subs.map((s) => s.host)).join(', ')}.`, fix: 'Faça o formulário (ou o script de envio) incluir utm_source, utm_medium, utm_campaign e fbclid no que manda ao CRM.' });
    }
    else if (!sent) add({ id: 'test-sent', group: 'teste', status: STATUS.fail, title: 'Nenhum sinal de envio: o formulário provavelmente não enviou',
      evidence: ['Sem requisição de envio, sem redirecionamento e sem mensagem de sucesso em 12 s.', invalid.length ? `Campos marcados como inválidos: ${invalid.join(', ')}.` : '', post.stillVisible === false ? 'O formulário sumiu da tela.' : ''].filter(Boolean).join(' '),
      fix: 'Validação ou etapa obrigatória barrou o envio (quiz incompleto, máscara de telefone, campo obrigatório). Preencha na mão uma vez e observe o que falta; se o formulário envia por JavaScript sem rede visível, confira no CRM.' });
    if (successNew.length) add({ id: 'test-success', group: 'teste', status: STATUS.pass, title: 'Mensagem de sucesso apareceu na página', evidence: successNew.slice(0, 2).join(' · ') });
    if (navAfter.length) add({ id: 'test-thanks', group: 'teste', status: STATUS.pass, title: 'Redirecionou para página de obrigado', evidence: navAfter[navAfter.length - 1].url });
    else if (sent) add({ id: 'test-thanks', group: 'teste', status: STATUS.info, title: 'Sem página de obrigado (sucesso na própria página)',
      evidence: 'Sem redirect, o evento de conversão precisa disparar no envio, não na página seguinte.' });
    const leadMeta = after.filter((e) => e.kind === 'meta' && /^(lead|completeregistration|contact|submitapplication|schedule|subscribe)$/i.test(e.params.ev || ''));
    add(leadMeta.length
      ? { id: 'test-meta', group: 'teste', status: STATUS.pass, title: `Meta recebeu ${uniq(leadMeta.map((e) => e.params.ev)).join(', ')} (${uniq(leadMeta.map((e) => e.params.id)).join(', ')})`, evidence: `${leadMeta.length} evento(s) depois do envio.` }
      : !sent
        ? { id: 'test-meta', group: 'teste', status: STATUS.unknown, title: 'Evento de Lead na Meta não avaliado (o envio não saiu)' }
        : { id: 'test-meta', group: 'teste', status: metaIds.length ? STATUS.fail : STATUS.unknown, title: 'Meta não recebeu evento de Lead após o envio',
        evidence: metaIds.length ? 'O pixel existe, mas nenhum fbq("track","Lead") saiu em até 12 s.' : 'Não há pixel da Meta na página.',
        fix: 'Crie o evento Lead no envio do formulário (GTM: gatilho de formulário ou de página de obrigado). Sem isso a Meta otimiza por clique, não por lead.' });
    const leadGa = after.filter((e) => e.kind === 'ga4' && /lead|form|conversion|contato|cadastro|submit/i.test(e.params.en || ''));
    add(leadGa.length
      ? { id: 'test-ga4', group: 'teste', status: STATUS.pass, title: `GA4 recebeu ${uniq(leadGa.map((e) => e.params.en)).join(', ')}`, evidence: `${leadGa.length} evento(s) depois do envio.` }
      : !sent
        ? { id: 'test-ga4', group: 'teste', status: STATUS.unknown, title: 'Conversão no GA4 não avaliada (o envio não saiu)' }
        : { id: 'test-ga4', group: 'teste', status: ga4Ids.length ? STATUS.warn : STATUS.unknown, title: 'GA4 não recebeu evento de conversão após o envio',
        evidence: ga4Ids.length ? 'Nenhum generate_lead, form_submit ou similar em até 12 s.' : 'Não há GA4 na página.',
        fix: 'Marque o envio como evento no GA4 (generate_lead) e defina como conversão. É o que o Google Ads importa.' });
    const conv = after.filter((e) => e.kind === 'ads' && !e.params.remarketing);
    add(conv.length
      ? { id: 'test-ads', group: 'teste', status: STATUS.pass, title: 'Google Ads recebeu conversão', evidence: uniq(conv.map((e) => e.params.id + (e.params.label ? '/' + e.params.label : ''))).join(', ') }
      : !sent
        ? { id: 'test-ads', group: 'teste', status: STATUS.unknown, title: 'Conversão do Google Ads não avaliada (o envio não saiu)' }
        : { id: 'test-ads', group: 'teste', status: adsIds.length ? STATUS.warn : STATUS.info, title: 'Sem conversão do Google Ads após o envio', evidence: adsIds.length ? 'A tag existe, mas nenhuma chamada de conversão saiu.' : 'Sem tag do Google Ads na página; ok se não roda Google.' });
    const dl = (test.dataLayerEvents || []);
    if (dl.length) add({ id: 'test-dl', group: 'teste', status: STATUS.info, title: `dataLayer recebeu: ${dl.join(', ')}` });
  }

  const counts = { pass: 0, warn: 0, fail: 0, info: 0, unknown: 0 };
  for (const c of checks) counts[c.status] = (counts[c.status] || 0) + 1;
  const verdict = counts.fail ? 'vermelho' : counts.warn ? 'amarelo' : 'verde';
  return { verdict, counts, checks, evaluatedAt: Date.now() };
}

export const GROUP_LABELS = { tags: 'Tags', whatsapp: 'WhatsApp', forms: 'Formulários', utm: 'UTM', saude: 'Saúde da página', teste: 'Teste de envio' };
export const STATUS_LABELS = { pass: 'Em ordem', warn: 'Atenção', fail: 'Crítico', info: 'Informação', unknown: 'Não deu para conferir' };
