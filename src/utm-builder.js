// Gerador de UTM: monta a URL de campanha e os parâmetros que vão no campo de cada
// plataforma de anúncio. Macros como {{campaign.name}} ficam intactas, porque quem
// as substitui é a plataforma, na hora do clique.

export const UTM_FIELDS = ['source', 'medium', 'campaign', 'content', 'term'];
export const REQUIRED_FIELDS = ['source', 'medium', 'campaign'];

const P = (id, name, defaults, suggestions = {}) => ({ id, name, defaults, suggestions });

export const PLATFORMS = [
  P('default', 'Genérico', {}, { medium: ['cpc', 'cpm', 'organic', 'email', 'social', 'affiliate', 'referral'] }),
  P('meta', 'Meta Ads', { source: 'facebook', medium: 'paid_social', campaign: '{{campaign.name}}', content: '{{ad.name}}', term: '{{adset.name}}' }, {
    source: ['{{site_source_name}}', 'facebook', 'instagram'],
    medium: ['paid_social', 'paidsocial', 'cpc', 'ads'],
    campaign: ['{{campaign.name}}', '{{campaign.id}}'],
    content: ['{{ad.name}}', '{{ad.id}}', '{{placement}}', '{{adset.name}}', '{{adset.id}}'],
    term: ['{{adset.name}}', '{{adset.id}}'],
  }),
  P('google', 'Google Ads', { source: 'google', medium: 'cpc', campaign: '{campaignid}', content: '{creative}', term: '{keyword}' }, {
    source: ['{network}', 'google'],
    medium: ['cpc', '{ifsearch:[valor]}', '{ifcontent:[valor]}'],
    campaign: ['{campaignid}'],
    content: ['{creative}', '{adgroupid}', '{feeditemid}', '{targetid}', '{loc_interest_ms}', '{loc_physical_ms}', '{matchtype}', '{network}', '{placement}', '{target}'],
    term: ['{keyword}', '{device}', '{devicemodel}', '{adposition}'],
  }),
  P('linkedin', 'LinkedIn Ads', { source: 'linkedin', medium: 'cpc', campaign: '{{CAMPAIGN_NAME}}', content: '{{CREATIVE_ID}}' }, {
    source: ['linkedin'],
    medium: ['cpc', 'paidsocial'],
    campaign: ['{{CAMPAIGN_NAME}}', '{{CAMPAIGN_ID}}'],
    content: ['{{CREATIVE_ID}}', '{{CAMPAIGN_GROUP_NAME}}', '{{CAMPAIGN_GROUP_ID}}'],
    term: ['{{CAMPAIGN_GROUP_NAME}}'],
  }),
  P('tiktok', 'TikTok Ads', { source: 'tiktok', medium: 'paid_social', campaign: '__CAMPAIGN_NAME__', content: '__CID_NAME__', term: '__AID_NAME__' }, {
    source: ['tiktok', '__PLACEMENT__'],
    medium: ['paid_social', 'cpc', 'cpm', 'video'],
    campaign: ['__CAMPAIGN_NAME__', '__CAMPAIGN_ID__'],
    content: ['__CID_NAME__', '__CID__', '__ADID_V2_NAME__', '__ADID_V2__'],
    term: ['__AID_NAME__', '__AID__'],
  }),
  P('twitter', 'X Ads', { source: 'twitter', medium: 'paid_social', campaign: '{campaign_name}', content: '{ad_id}', term: '{keyword}' }, {
    source: ['twitter', 'x'],
    campaign: ['{campaign_id}', '{campaign_name}'],
    content: ['{ad_id}', '{ad_group_id}'],
    term: ['{keyword}', '{target_id}'],
  }),
  P('youtube', 'YouTube Ads', { source: 'youtube', medium: 'video', campaign: '{campaignid}', content: '{creative}', term: '{keyword}' }, {
    campaign: ['{campaignid}', '{adgroupid}'],
    content: ['{creative}', '{adgroupid}', '{placement}', '{target}'],
    term: ['{keyword}', '{device}', '{devicemodel}'],
  }),
  P('pinterest', 'Pinterest Ads', { source: 'pinterest', medium: 'paid_social', campaign: '[campaign_name]', content: '[adgroup_name]', term: '[creative_id]' }, {
    source: ['pinterest'],
    campaign: ['[campaign_id]', '[campaign_name]'],
    content: ['[adgroup_id]', '[adgroup_name]', '[ad_id]'],
    term: ['[creative_id]', '[placement]'],
  }),
  P('bing', 'Bing Ads', { source: 'bing', medium: 'cpc', campaign: '{campaignid}', content: '{adgroupid}', term: '{keyword}' }, {
    source: ['bing', '{network}'],
    medium: ['cpc', '{ifsearch:cpc}', '{ifcontent:display}'],
    campaign: ['{campaign}', '{campaignid}'],
    content: ['{adgroup}', '{adgroupid}', '{adid}', '{creative}', '{targetid}', '{bidmatchtype}', '{placement}'],
    term: ['{keyword}', '{matchtype}', '{device}', '{devicemodel}'],
  }),
  P('taboola', 'Taboola', { source: 'taboola', medium: 'native', campaign: '{campaign_id}', content: '{ad_id}', term: '{site_id}' }, {
    source: ['taboola', '{site}'],
    campaign: ['{campaign_id}', '{campaign_item_id}'],
    content: ['{ad_id}', '{thumbnail_id}', '{platform}'],
    term: ['{site_id}', '{section_id}', '{section_name}'],
  }),
  P('analytics', 'Analytics / SEO', { source: 'google', medium: 'organic', campaign: 'seo-mensal' }, { medium: ['organic', 'cpc', 'referral'] }),
  P('email', 'E-mail', { source: 'newsletter', medium: 'email', campaign: 'news-mes-ano' }, { source: ['rdstation', 'mailchimp', 'hubspot', 'activecampaign', 'brevo'] }),
  P('whatsapp', 'WhatsApp', { source: 'whatsapp', medium: 'message', campaign: 'disparo-base' }),
  P('affiliate', 'Afiliados', { source: 'influencer', medium: 'affiliate', campaign: 'nome-da-acao' }, { source: ['instagram-bio', 'blog-post', 'youtube-description', 'podcast'] }),
];

export const getPlatform = (id) => PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];

// Formatos de macro: {{x}} (Meta, LinkedIn), {x} (Google, Bing, X, Taboola),
// [x] (Pinterest) e __X__ (TikTok, sempre em maiúsculas).
const MACRO = /(\{\{[^{}]+\}\}|\{[^{}]+\}|\[[^[\]]+\]|__[A-Z0-9_]+__)/;

const slug = (text) => text
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9\-_.]/g, '')
  .replace(/-+/g, '-');

// Padroniza o texto e deixa as macros como estão: "Promo Verão {{ad.name}}" vira
// "promo-verao-{{ad.name}}". O split com grupo põe as macros nas posições ímpares.
export function normalizeUtmValue(value) {
  return String(value ?? '').trim()
    .split(MACRO)
    .map((part, i) => (i % 2 ? part : slug(part)))
    .join('')
    .replace(/^-+|-+$/g, '');
}

// A macro precisa chegar literal à plataforma: só o que quebraria a URL é codificado.
const encodeValue = (value) => value.replace(/[^A-Za-z0-9\-_.~{}[\]:|]/g, encodeURIComponent);

function normalizedParams(params) {
  return UTM_FIELDS.map((f) => [`utm_${f}`, normalizeUtmValue(params[f])]).filter(([, v]) => v);
}

export function missingFields(params) {
  return REQUIRED_FIELDS.filter((f) => !normalizeUtmValue(params[f]));
}

export function buildUtmQuery(params) {
  return normalizedParams(params).map(([k, v]) => `${k}=${encodeValue(v)}`).join('&');
}

// URL de campanha: as UTMs que já estavam na URL saem (uma origem antiga não pode
// se misturar com a nova) e o resto da URL, inclusive a âncora, fica como está.
export function buildUtmUrl(url, params) {
  const text = String(url || '').trim();
  if (!text) throw new Error('Informe a URL da página.');
  // O Chrome aceitaria "meu site" como host (https://meu%20site/), mas essa URL não abre.
  if (/\s/.test(text)) throw new Error('URL inválida.');
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new Error('URL inválida.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Só páginas http ou https.');
  for (const f of UTM_FIELDS) u.searchParams.delete(`utm_${f}`);
  const query = buildUtmQuery(params);
  const rest = u.search.replace(/^\?/, '');
  u.search = [rest, query].filter(Boolean).join('&');
  return u.toString();
}

// Só os parâmetros, para colar no campo da plataforma. Google e Bing usam o modelo
// de acompanhamento ({lpurl}?...), e o LinkedIn pede o account_id junto.
export function buildPlatformParams(platformId, params) {
  const query = buildUtmQuery(params);
  if (platformId === 'google' || platformId === 'bing') return `{lpurl}?${query}`;
  if (platformId === 'linkedin') return `account_id={{ACCOUNT_ID}}&${query}`;
  return query;
}
