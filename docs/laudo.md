# Como ler o laudo

## Veredito

| Cor | Significa | O que fazer |
|---|---|---|
| 🟢 **Verde** | Nenhum item crítico ou de atenção | Pode subir campanha |
| 🟡 **Amarelo** | Há itens de atenção, nenhum crítico | Sobe com ressalvas; corrige em seguida |
| 🔴 **Vermelho** | Há pelo menos um item crítico | Corrige antes de subir |

## Os cinco status

- ✅ **Em ordem**: passou, com evidência.
- ⚠️ **Atenção**: funciona, mas está perdendo informação ou dinheiro (sem Clarity, link de WhatsApp sem mensagem, formulário longo).
- 🔴 **Crítico**: manda lead para o lugar errado ou torna a campanha cega (número de WhatsApp diferente do cadastro, sem GA4, formulário em HTTP, UTM que não chega).
- ℹ️ **Informação**: fato útil sem julgamento (chat na página, tag do Google Ads ausente quando o cliente não roda Google).
- ⬜ **Não deu para conferir**: o Track Eye não teve evidência. Nunca vira achado. Diz o que faltou e como conferir na mão.

## Blocos do laudo em markdown

1. **Achados**: críticos e atenções, cada um com evidência e "o que fazer".
2. **Em ordem**: o que passou. Vale como prova de trabalho.
3. **Não deu para conferir e observações**: limites e informações.
4. **Inventário**: IDs, links, formulários e UTM encontrados.

## Itens mais comuns e o que significam

**"GTM no código, mas não carregou."** O snippet está na página e o `gtm.js` não baixou. Primeiro suspeito: bloqueador de anúncios ou Brave Shields no seu navegador (o laudo avisa quando detecta). Depois: snippet incompleto ou container não publicado.

**"GA4 presente, mas sem `page_view` observado."** O ID existe, mas nenhuma chamada ao GA4 saiu. Teste em janela sem bloqueador; se persistir, confira a tag de configuração no GTM.

**"Pixel duplicado."** O mesmo pixel mandou `PageView` mais de uma vez na mesma visita. Costuma ser pixel no GTM e no código ao mesmo tempo. Eventos dobrados inflam o gerenciador.

**"Mais de um pixel" ou "mais de um container".** Normalmente agência antiga mais agência nova. Confirme qual é o oficial e remova o outro.

**"WhatsApp não bate com o cadastro."** O botão aponta para um número diferente do que você cadastrou para o cliente. Corrija antes de subir campanha.

**"Botão de WhatsApp sem link direto."** O botão abre o WhatsApp ou um chat por JavaScript; o número não está no HTML. Clique e confira na mão.

**"WhatsApp montado por JavaScript."** O link `wa.me` aparece no código JS, não no HTML. Costuma surgir depois de uma etapa (quiz). Complete a etapa e varra de novo.

**"Formulário não guarda a origem."** Sem campos ocultos de UTM, o CRM não sabe de qual campanha o lead veio. Em formulário por JavaScript o laudo diz "não dá para ver" e manda confirmar com o teste de envio, que lê as chaves de UTM no corpo da requisição.

**"UTM não chega nos links de WhatsApp."** O visitante clica e a origem se perde antes de chegar ao comercial. Solução: script que injeta a UTM na mensagem, ou mensagem fixa por campanha.

**"Navegador bloqueando rastreadores."** Seu navegador barrou o GTM, o GA4, a Meta ou o Clarity. O que aparece como não carregado pode ser só isso. Desligue o bloqueio para o site, recarregue e varra de novo.

**"Nenhum sinal de envio."** No teste, nenhuma requisição saiu, não houve redirect nem mensagem de sucesso. Validação, captcha ou etapa obrigatória barrou. Preencha na mão uma vez e observe o que falta.

**"Origem foi junto no envio."** As chaves `utm_` apareceram no corpo da requisição ao CRM. O lead chega sabendo de qual campanha veio.

## Como usar o laudo com o cliente

Copie o **resumo** para o grupo quando quiser mostrar que a LP foi conferida. Copie o **laudo completo** quando precisar justificar uma correção ou provar que o problema não era o tráfego. Salve no **histórico** antes e depois de corrigir: a diferença é o trabalho feito.
