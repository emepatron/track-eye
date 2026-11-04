// Laudo em markdown, para guardar ou compartilhar.
import { GROUP_LABELS, formatPhone } from './rules.js';

const ICON = { pass: '✅', warn: '⚠️', fail: '🔴', info: 'ℹ️', unknown: '⬜' };
const VERDICT = { verde: '🟢 VERDE: pode subir campanha', amarelo: '🟡 AMARELO: sobe com ressalvas, corrigir em seguida', vermelho: '🔴 VERMELHO: corrigir antes de subir campanha' };

export function fmtDate(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toMarkdown({ scan, result, client, analyst, version }) {
  const lines = [];
  lines.push(`# Track Eye · Laudo de rastreamento`);
  lines.push('');
  lines.push(`- **Projeto:** ${client ? client.name : 'não cadastrado'}`);
  lines.push(`- **Página:** ${scan.url}`);
  if (scan.title) lines.push(`- **Título:** ${scan.title}`);
  lines.push(`- **Data:** ${fmtDate(result.evaluatedAt)}${analyst ? ` · **Analista:** ${analyst}` : ''}`);
  lines.push(`- **Veredito:** ${VERDICT[result.verdict] || result.verdict}`);
  lines.push('');

  const block = (title, filter) => {
    const items = result.checks.filter(filter);
    if (!items.length) return;
    lines.push(`## ${title}`);
    lines.push('');
    for (const c of items) {
      lines.push(`- ${ICON[c.status]} **${c.title}** _(${GROUP_LABELS[c.group] || c.group})_`);
      if (c.evidence) lines.push(`  - Evidência: ${c.evidence.replace(/\n/g, '; ')}`);
      if (c.fix) lines.push(`  - O que fazer: ${c.fix}`);
    }
    lines.push('');
  };
  block('Achados', (c) => c.status === 'fail' || c.status === 'warn');
  block('Em ordem', (c) => c.status === 'pass');
  block('Não deu para conferir e observações', (c) => c.status === 'unknown' || c.status === 'info');

  lines.push('## Inventário');
  lines.push('');
  const t = scan.tags;
  const ids = (k) => Array.from(new Set([...(t[k].code || []), ...(t[k].runtime || [])])).join(', ') || '—';
  lines.push(`- GTM: ${ids('gtm')} · GA4: ${ids('ga4')} · Meta: ${ids('meta')} · Google Ads: ${ids('ads')} · Clarity: ${ids('clarity')}`);
  if (scan.whatsapp && scan.whatsapp.length) lines.push(`- WhatsApp: ${scan.whatsapp.map((l) => `${formatPhone(l.phone)} (${l.position}${l.hasMessage ? ', com mensagem' : ', sem mensagem'})`).join('; ')}`);
  if (scan.forms && scan.forms.length) lines.push(`- Formulários: ${scan.forms.map((f) => `${f.id || `#${f.index + 1}`} ${f.provider}, ${f.visibleFields} campos${f.actionHost ? ` → ${f.actionHost}` : ''}`).join('; ')}`);
  if (scan.utm && Object.keys(scan.utm).length) lines.push(`- UTM na URL: ${Object.entries(scan.utm).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  lines.push('');
  lines.push(`_Gerado pelo Track Eye v${version || '0.1.0'}. Só afirma o que teve evidência no navegador; CAPI e disparos condicionais do GTM ficam fora._`);
  return lines.join('\n');
}

// Versão curta para mensagem: veredito e achados.
export function toShort({ scan, result, client }) {
  const found = result.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const lines = [`Track Eye · ${client ? client.name : scan.host} · ${fmtDate(result.evaluatedAt)}`, VERDICT[result.verdict] || result.verdict, scan.url, ''];
  if (found.length) {
    lines.push('Achados:');
    for (const c of found) lines.push(`${ICON[c.status]} ${c.title}`);
  } else lines.push('Nenhum achado. Tags, WhatsApp e formulários em ordem.');
  return lines.join('\n');
}
