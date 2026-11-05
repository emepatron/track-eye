# Guia de uso

O Track Eye tem quatro abas e uma engrenagem, na ordem do que se usa com mais frequência: conferir rápido, diagnosticar, gerar UTM e consultar projetos e histórico. Este guia explica o que cada uma faz e quando usar.

## Aba Início

É a verificação rápida. Abra o painel e ele varre sozinho, sem clique: também varre de novo quando a página termina de carregar ou quando você muda de aba. A varredura só lê a página, não envia nem clica em nada. Se preferir varrer só no clique, desligue "Varrer sozinho" na engrenagem.

**Status.** Responde se a página está rastreada:

- **Rastreada:** pelo menos uma plataforma disparou na rede nesta visita. O GTM sozinho não conta, porque ele só carrega as outras tags.
- **Sem disparo confirmado:** há tags na página, mas nenhum disparo foi visto. Se a página tem aviso de cookies, aceite e varra de novo.
- **Sem rastreamento:** nenhuma tag no código e nenhum disparo na rede.
- **Não deu para conferir:** um bloqueador está barrando os rastreadores ou a página abriu antes da extensão. O painel diz o que fazer, e isso nunca vira "sem rastreamento".

**Plataformas e códigos.** Cada código encontrado aparece com o próprio estado (disparou, carregou, só no código ou só em iframe) e um botão de copiar. As plataformas que não apareceram ficam resumidas em uma linha.

**Varrer de novo.** O botão circular repete a leitura sem recarregar. A varredura cruza três fontes:

1. O que está no código: IDs de GTM, GA4, pixel, links, formulários.
2. O que a página fez em tempo de execução: objetos que as tags criam, `dataLayer`, chamadas `fbq`.
3. As requisições de rede que o Track Eye observou desde que a aba carregou.

Por isso ele distingue "está no código" de "disparou de verdade".

**Recarregar a página e varrer.** Limpa o que foi observado, recarrega a página e varre quando ela termina de carregar. Use sempre que a página já estava aberta antes da extensão, porque o observador precisa estar presente desde o carregamento para capturar pixel e `dataLayer`.

## Aba Diagnóstico

### Achados

**Veredito.** Sai das checagens: qualquer item crítico dá vermelho, qualquer atenção dá amarelo, o resto é verde. Os filtros (Achados, Em ordem, Não conferido, Tudo) separam a lista, que abre em Achados. Cada item abre com evidência e o que fazer.

**Projeto.** Escolha o projeto se ele não foi reconhecido pelo domínio. Com projeto, os números de WhatsApp são comparados com os esperados.

**Exportar laudo.** Copiar laudo (markdown completo), Copiar resumo (versão curta para grupo ou Discord), Baixar .md, Print da página (PNG) e Salvar no histórico.

### Testes

**Abrir com UTM de teste.** Quando você não tem o link final do anúncio, o painel monta um: pega a URL da aba (ou uma que você cole), acrescenta os parâmetros de origem do modelo (por padrão `utm_source=trackeye&utm_medium=teste&utm_campaign=auditoria&utm_content={data}`, com `{data}` virando a data do dia) e abre. "Abrir e varrer" troca a página na aba e varre quando ela termina de carregar; "Nova aba" abre ao lado; "Copiar" só copia a URL. UTMs que já estavam na URL são substituídas pelas de teste. O modelo fica na engrenagem.

**Teste de envio do formulário.** Escolha o formulário (se houver mais de um), clique em enviar e confirme. O Track Eye:

- se o formulário estiver oculto atrás de um quiz ou de etapas, percorre o fluxo sozinho (primeira opção de cada pergunta, "Continuar" quando existe);
- se não conseguir chegar, espera até 3 minutos enquanto você responde as etapas na página, e envia assim que o formulário aparece;
- preenche com dados marcados como `TESTE TRACK EYE` (nome, e-mail e telefone de teste configuráveis na engrenagem);
- envia e observa por 12 segundos: requisição de envio, redirecionamento, mensagem de sucesso, `Lead` na Meta, `generate_lead` no GA4, conversão do Google Ads, eventos do `dataLayer`, e se as chaves de UTM foram no corpo do envio.

O resultado entra no laudo como bloco "Teste de envio". Lembre: é um lead de verdade no CRM do projeto. Apague depois.

**Testar clique de compra.** Aparece quando a varredura encontra botão de compra ou link de checkout (loja ou página de vendas). Escolha o botão, confirme, e o Track Eye clica nele e observa por 8 segundos: `InitiateCheckout` (ou `AddToCart`) na Meta, `begin_checkout` no GA4, para onde o checkout foi e se a origem (`utm`, `src`, `sck`) chegou na URL. Nada é preenchido nem pago; a aba para no checkout. O evento de compra (`Purchase`) só aparece no laudo se for observado numa compra de teste feita por você com o painel aberto; sem isso fica como "não deu para conferir".

**Inventário e eventos observados.** IDs encontrados, links, formulários, scripts, e a linha do tempo das requisições de rastreamento. É a prova bruta, para quem quiser conferir.

## Aba UTM

Gera a URL de campanha. A URL vem da aba ativa, e você pode trocá-la.

Escolha a **plataforma** para preencher os campos com o padrão dela. Ao clicar em um campo, aparecem as sugestões de macros daquela plataforma. Source, medium e campaign são obrigatórios.

O texto é padronizado (minúsculas, sem acento, hífen no lugar de espaço), e as macros ficam intactas em todos os formatos: `{{campaign.name}}`, `{campaignid}`, `[campaign_name]` e `__CAMPAIGN_NAME__`. Quem as substitui é a plataforma, na hora do clique. UTMs que já estavam na URL são substituídas; os outros parâmetros e a âncora ficam.

- **Copiar URL:** a URL completa.
- **Copiar parâmetros:** só os parâmetros, para o campo da plataforma. No Google e no Bing vem com `{lpurl}?` na frente, e no LinkedIn com `account_id={{ACCOUNT_ID}}`.

## Aba Mais

### Projetos

É o que transforma a varredura em comparação. Cada projeto tem:

- **Nome.**
- **Domínios das LPs**, um por linha. Com isso o painel reconhece o projeto ao abrir a aba.
- **Números de WhatsApp esperados**, um por linha. Qualquer botão com número diferente vira crítico no laudo.
- **Observações** livres (pixel oficial, GTM oficial, quem aprova).

Ao criar um projeto com uma LP já varrida, o formulário vem preenchido com o domínio da aba e os números encontrados na página. Confira e salve.

O cadastro fica no navegador de cada pessoa. Para o time usar o mesmo: **Exportar JSON**, compartilhe o arquivo, e cada um faz **Importar JSON**. A importação mescla pelo nome e nunca apaga o que já existe. Um exemplo está em [clientes-exemplo.json](../clientes-exemplo.json).

### Histórico

Guarda os laudos que você salvou: projeto, data, URL e a cor do veredito. Abrindo um, dá para reler o markdown, copiar de novo ou excluir. Serve como prova de trabalho ("LP auditada em tal data, estava verde") e para comparar antes e depois de uma correção. Guarda os últimos 100, só no seu navegador.

## Engrenagem

- **Seu nome**: entra no laudo como analista.
- **E-mail e WhatsApp de teste**: usados no teste de envio.
- **UTM de teste (modelo)**: os parâmetros que "Abrir com UTM de teste" acrescenta à URL. Aceita `{data}` (AAAAMMDD) e `{hora}` (HHMM).

## Dicas de rotina

- Abra a LP pelo link final do anúncio, com UTM. Sem UTM na URL o Track Eye não consegue testar a propagação.
- Use o laudo como gate: LP sem verde (ou sem amarelo justificado) não sobe para campanha.
- Guarde o laudo no histórico antes de corrigir e depois. A diferença é a prova de trabalho.
- Brave ou bloqueador de anúncios: desligue para o site antes de varrer. O laudo avisa quando isso aconteceu.
