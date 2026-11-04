// Cadastro de projetos ("clients" no código) e histórico, guardados no chrome.storage.local.
// Sem Lab nesta versão: o time compartilha o cadastro por arquivo JSON.

const KEY_CLIENTS = 'clients';
const KEY_SETTINGS = 'settings';
const KEY_AUDITS = 'audits';
const MAX_AUDITS = 100;

const store = () => chrome.storage.local;
const get = async (key, fallback) => (await store().get(key))[key] ?? fallback;
const set = (key, value) => store().set({ [key]: value });

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function normalizeDomain(value) {
  let v = String(value || '').trim().toLowerCase();
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return v;
}

export function normalizeClient(c) {
  const split = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,;]+/)).map((s) => s.trim()).filter(Boolean);
  return {
    id: c.id || newId(),
    name: String(c.name || '').trim(),
    domains: split(c.domains).map(normalizeDomain).filter(Boolean),
    whatsapp: split(c.whatsapp).map((s) => s.replace(/\D+/g, '')).filter((s) => s.length >= 8),
    notes: String(c.notes || '').trim(),
    updatedAt: Date.now(),
  };
}

export async function listClients() {
  const list = await get(KEY_CLIENTS, []);
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function saveClient(client) {
  const c = normalizeClient(client);
  if (!c.name) throw new Error('Nome do projeto é obrigatório.');
  const list = await get(KEY_CLIENTS, []);
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  await set(KEY_CLIENTS, list);
  return c;
}

export async function removeClient(id) {
  const list = await get(KEY_CLIENTS, []);
  await set(KEY_CLIENTS, list.filter((x) => x.id !== id));
}

export async function findClientByHost(host) {
  const h = normalizeDomain(host);
  if (!h) return null;
  const list = await get(KEY_CLIENTS, []);
  return list.find((c) => c.domains.some((d) => h === d || h.endsWith('.' + d))) || null;
}

export async function exportClients() {
  const list = await get(KEY_CLIENTS, []);
  return JSON.stringify({ trackEye: 'clients', version: 1, exportedAt: new Date().toISOString(), clients: list }, null, 2);
}

// Importa mesclando pelo nome (sem acento, minúsculo): o arquivo atualiza o
// que já existe e acrescenta o que não existe. Nunca apaga.
export async function importClients(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const incoming = Array.isArray(data) ? data : data.clients;
  if (!Array.isArray(incoming)) throw new Error('Arquivo não tem a lista "clients".');
  const key = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const list = await get(KEY_CLIENTS, []);
  let added = 0, updated = 0;
  for (const raw of incoming) {
    const c = normalizeClient(raw);
    if (!c.name) continue;
    const i = list.findIndex((x) => key(x.name) === key(c.name));
    if (i >= 0) { list[i] = { ...c, id: list[i].id }; updated++; } else { list.push(c); added++; }
  }
  await set(KEY_CLIENTS, list);
  return { added, updated, total: list.length };
}

export async function getSettings() {
  return { analyst: '', testPhone: '', testEmail: '', utmTemplate: '', ...(await get(KEY_SETTINGS, {})) };
}
export async function saveSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await set(KEY_SETTINGS, s);
  return s;
}

export async function listAudits(clientId) {
  const list = await get(KEY_AUDITS, []);
  return list.filter((a) => !clientId || a.clientId === clientId).sort((a, b) => b.date - a.date);
}
export async function saveAudit(audit) {
  const list = await get(KEY_AUDITS, []);
  list.unshift({ id: newId(), ...audit });
  await set(KEY_AUDITS, list.slice(0, MAX_AUDITS));
}
export async function removeAudit(id) {
  const list = await get(KEY_AUDITS, []);
  await set(KEY_AUDITS, list.filter((a) => a.id !== id));
}
