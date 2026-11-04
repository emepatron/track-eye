# Guia de uso

O Track Eye tem três abas e uma engrenagem. Este guia explica o que cada uma faz e quando usar.

## Aba Varredura

É a aba de trabalho. O painel mostra a página que está aberta na aba do navegador: título, URL e o projeto reconhecido pelo domínio (se você cadastrou).

**Varrer página.** Injeta o scanner na página e cruza três fontes:

1. O que está no código: IDs de GTM, GA4, pixel, links, formulários.
2. O que a página fez em tempo de execução: objetos que as tags criam, `dataLayer`, chamadas `fbq`.
3. As requisições de rede que o Track Eye observou desde que a aba carregou.

Por isso ele distingue "está no código" de "disparou de verdade".

**Recarregar e varrer.** Limpa o que foi observado, recarrega a página e varre 4 segundos depois. Use na primeira varredura e sempre que a página já estava aberta antes da extensão, porque o observador precisa estar presente desde o carregamento para capturar pixel e `dataLayer`.

**Abrir com UTM de teste.** Quando você não tem o link final do anúncio, o painel monta um: pega a URL da aba (ou uma que você cole), acrescenta os parâmetros de origem do modelo (por padrão `utm_source=trackeye&utm_medium=teste&utm_campaign=auditoria&utm_content={data}`, com `{data}` virando a data do dia) e abre. "Abrir aqui e varrer" troca a página na aba e varre 4 segundos depois; "Nova aba" abre ao lado; "Copiar" só copia a URL. UTMs que já estavam na URL são substituídas pelas de teste. O modelo fica na engrenagem.

**Veredito.** Sai das checagens: qualquer item crítico dá vermelho, qualquer atenção dá amarelo, o resto é verde. Os filtros (Tudo, Achados, Em ordem, Não conferido) separam a lista. Cada item abre com evidência e o que fazer.

**Teste de envio do formulário.** Escolha o formulário (se houver mais de um), clique em enviar e confirme. O Track Eye:

- se o formulário estiver oculto atrás de um quiz ou de etapas, percorre o fluxo sozinho (primeira opção de cada pergunta, "Continuar" quando existe);
- se não conseguir chegar, espera até 3 minutos enquanto você responde as etapas na página, e envia assim que o formulário aparece;
- preenche com dados marcados como `TESTE TRACK EYE` (nome, e-mail e telefone de teste configuráveis na engrenagem);
- envia e observa por 12 segundos: requisição de envio, redirecionamento, mensagem de sucesso, `Lead` na Meta, `generate_lead` no GA4, conversão do Google Ads, eventos do `dataLayer`, e se as chaves de UTM foram no corpo do envio.

O resultado entra no laudo como bloco "Teste de envio". Lembre: é um lead de verdade no CRM do projeto. Apague depois.

**Inventário e eventos observados.** IDs encontrados, links, formulários, scripts, e a linha do tempo das requisições de rastreamento. É a prova bruta, para quem quiser conferir.

**Exportar.** Copiar laudo (markdown completo), Copiar resumo (versão curta para grupo ou Discord), Baixar .md, Print da página (PNG) e Salvar no histórico.

**Testar clique de compra.** Aparece quando a varredura encontra botão de compra ou link de checkout (loja ou página de vendas). Escolha o botão, confirme, e o Track Eye clica nele e observa por 8 segundos: `InitiateCheckout` (ou `AddToCart`) na Meta, `begin_checkout` no GA4, para onde o checkout foi e se a origem (`utm`, `src`, `sck`) chegou na URL. Nada é preenchido nem pago; a aba para no checkout. O evento de compra (`Purchase`) só aparece no laudo se for observado numa compra de teste feita por você com o painel aberto; sem isso fica como "não deu para conferir".

## Aba Projetos

É o que transforma a varredura em comparação. Cada projeto tem:

- **Nome.**
- **Domínios das LPs**, um por linha. Com isso o painel reconhece o projeto ao abrir a aba.
- **Números de WhatsApp esperados**, um por linha. Qualquer botão com número diferente vira crítico no laudo.
- **Observações** livres (pixel oficial, GTM oficial, quem aprova).

Ao criar um projeto com uma LP já varrida, o formulário vem preenchido com o domínio da aba e os números encontrados na página. Confira e salve.

O cadastro fica no navegador de cada pessoa. Para o time usar o mesmo: **Exportar JSON**, compartilhe o arquivo, e cada um faz **Importar JSON**. A importação mescla pelo nome e nunca apaga o que já existe. Um exemplo está em [clientes-exemplo.json](../clientes-exemplo.json).

## Aba Histórico

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
