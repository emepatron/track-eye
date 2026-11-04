// URL de teste com UTM: monta a URL da página com os parâmetros de origem que a
// varredura e o teste de envio vão procurar depois (no link de WhatsApp, nos campos
// ocultos e no corpo do envio ao CRM).

export const DEFAULT_UTM_TEMPLATE = 'utm_source=trackeye&utm_medium=teste&utm_campaign=auditoria&utm_content={data}';

// Substitui {data} por AAAAMMDD e {hora} por HHMM, para o lead de teste ficar fácil de achar no CRM.
function fillPlaceholders(template, date) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hora = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return template.replace(/\{data\}/gi, data).replace(/\{hora\}/gi, hora);
}

// Aceita o modelo como querystring ("a=1&b=2", com ou sem "?") e devolve pares [chave, valor].
export function parseTemplate(template) {
  const raw = (template || '').trim().replace(/^\?/, '');
  if (!raw) return [];
  return raw.split('&').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
  });
}

// Devolve a URL com os parâmetros de teste. Os que já existirem na URL são substituídos
// (uma UTM antiga não pode contaminar o teste); o resto da URL fica como está.
export function withTestUtm(url, template = DEFAULT_UTM_TEMPLATE, date = new Date()) {
  const text = String(url || '').trim();
  if (!text) throw new Error('Cole a URL da página.');
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { throw new Error('URL inválida.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Só páginas http ou https.');
  const pairs = parseTemplate(fillPlaceholders(template || DEFAULT_UTM_TEMPLATE, date));
  if (!pairs.length) throw new Error('Informe pelo menos um parâmetro (ex.: utm_source=teste).');
  for (const [k, v] of pairs) u.searchParams.set(k, v);
  return u.toString();
}
