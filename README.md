<p align="center">
  <img src="assets/logo.svg" alt="Track Eye" width="560">
</p>

<p align="center">
  <strong>Abra a landing page. Clique no olho. Em segundos você sabe se o rastreamento está certo.</strong>
</p>

<p align="center">
  <a href="https://trackeye.gsgrowthai.com">Site</a> ·
  <a href="#instalar-em-um-minuto">Instalar</a> ·
  <a href="#o-que-ele-confere">O que ele confere</a> ·
  <a href="docs/guia.md">Guia de uso</a> ·
  <a href="docs/laudo.md">Como ler o laudo</a> ·
  <a href="docs/limites.md">Limites</a> ·
  <a href="LICENSE">Licença MIT</a>
</p>

---

## O problema que ele resolve

Todo mundo que já subiu campanha conhece a cena. A página vai ao ar, o anúncio roda, a verba sai, e dias depois alguém descobre que o pixel não disparava, que o botão de WhatsApp apontava para um número antigo, que a página de obrigado parou de contar, que a UTM se perdia no caminho. O veredito vira "o tráfego não converte". Era tracking.

Conferir isso na mão leva meia hora, exige abrir o GTM Preview, o gerenciador de anúncios, o código-fonte, e ninguém tem esse tempo antes de publicar. Então ninguém confere.

**Track Eye** é uma extensão de navegador que faz essa conferência em segundos, na própria aba, e devolve um laudo com veredito, evidência e o que fazer. Grátis, código aberto, sem conta, sem servidor: tudo roda no seu navegador.

## O que ele faz

- **Vê as tags de verdade.** Não é "está no código": ele observa as requisições de rede e diz se o GTM carregou, se o GA4 mandou `page_view`, se o pixel da Meta disparou, se tem duplicado.
- **Confere o WhatsApp.** Todos os botões e links, com número, mensagem pré-preenchida e identificação de origem. Cadastre o projeto e qualquer número diferente vira crítico.
- **Entende o formulário.** Elementor, Contact Form 7, HubSpot, RD, GoHighLevel, webhook, React, quiz, widget em iframe, formulário sem `<form>`. Mostra campos, destino e se a origem (UTM) vai junto.
- **Abre a página com UTM de teste.** Um clique monta a URL da aba (ou uma colada) com parâmetros de origem conhecidos, abre e varre. Assim dá para provar se a UTM chega ao WhatsApp, aos campos ocultos e ao CRM.
- **Testa o envio de ponta a ponta.** Preenche com dados marcados como teste, percorre o quiz sozinho se precisar, envia e observa: a requisição saiu? Meta recebeu `Lead`? GA4 recebeu `generate_lead`? Google Ads contou a conversão? A UTM foi no corpo do envio?
- **Olha a saúde básica.** HTTPS, CSS que não carregou, erros de JavaScript, título, viewport, tempo de carregamento.
- **Entrega o laudo pronto.** Verde, amarelo ou vermelho; três blocos (achados, em ordem, não deu para conferir); copia como markdown ou resumo curto; salva print e histórico.

E uma regra que vale para tudo: **o laudo só afirma o que teve evidência**. O que não deu para conferir fica dito como "não deu para conferir". Nunca vira achado inventado.

## Para quem é

| Quem | Como usa |
|---|---|
| **Quem roda o próprio tráfego** | Não precisa saber o que é GTM Preview. Abre a página, clica no olho e lê, em português, o que está certo e o que falta. |
| **Quem contratou alguém para fazer a LP** | Confere o que foi entregue sem depender de ninguém. Se o pixel não dispara, o laudo mostra, com o ID. |
| **Gestor de tráfego e analista** | Gate antes de subir campanha: LP sem laudo verde não entra em veiculação. O laudo salvo vale como registro do teste. |
| **Dev / implementador de LP** | Checklist de entrega e teste de envio sem precisar do GTM Preview. Em quiz e formulário dentro de iframe também. |

## Instalar em um minuto

Funciona em Chrome, Brave, Edge e qualquer navegador Chromium 116 ou mais novo.

1. **Baixe** este repositório: botão verde **Code → Download ZIP**, e descompacte. (Ou `git clone https://github.com/emepatron/track-eye.git`.)
2. Abra `chrome://extensions` (no Brave, `brave://extensions`; no Edge, `edge://extensions`).
3. Ligue **Modo do desenvolvedor**, no canto superior direito.
4. Clique em **Carregar sem compactação** e escolha a pasta descompactada (`track-eye-main` no ZIP, `track-eye` no clone).
5. Fixe o ícone do olho na barra. Pronto.

Para atualizar: substitua os arquivos da pasta e clique em **Atualizar** na página de extensões.

> **Usa Brave ou bloqueador de anúncios?** Desligue para o site que vai auditar (no Brave, o leão na barra de endereço). Senão o navegador barra o GTM e o laudo avisa "navegador bloqueando rastreadores" em vez de auditar.

## Usar em três passos

1. Abra a landing page, de preferência pelo link final do anúncio (com UTM). Sem o link? Use **Abrir com UTM de teste** no painel: ele monta a URL com origem conhecida, abre e varre.
2. Clique no olho e em **Varrer página**. Se a página já estava aberta antes da extensão, use **Recarregar e varrer**.
3. Leia o veredito. Abra cada item para ver evidência e correção. **Copiar laudo** gera o markdown completo; **Copiar resumo**, a versão curta para mensagem. Cole o laudo na sua IA e peça a correção: ele já vem com a evidência e o que fazer em cada item.

Quer confirmar que o lead chega? Abra **Teste de envio do formulário** e envie. Vai cair um lead `TESTE TRACK EYE` no CRM do projeto, de propósito; apague depois.

O guia completo, aba por aba, está em [docs/guia.md](docs/guia.md).

## O que ele confere

| Grupo | Checagens |
|---|---|
| **Tags** | GTM (no código e carregado; duplicado; mais de um container), GA4 (ID e `page_view`), pixel da Meta (ID, `PageView`, duplicado, mais de um pixel, pixel dentro de iframe), Google Ads, Microsoft Clarity, Hotjar, TikTok |
| **WhatsApp** | Links `wa.me`, `api.whatsapp.com` e `whatsapp://` com número, mensagem e origem; botões sem link direto (abrem por JavaScript, inclusive flutuantes e em shadow DOM); WhatsApp montado no JS; chats e chatbots (LeadConnector, Typebot, ManyChat, Tawk, JivoChat, Crisp, Intercom, HubSpot, Blip, Zenvia, Octadesk, Botpress, Tidio, Zendesk, Kommo e outros); comparação com o cadastro do projeto |
| **Formulários** | Provedor, campos, destino do envio, HTTP sem criptografia, formulário longo, captcha, origem (campos ocultos de UTM, storage ou confirmação pelo teste), iframes varridos frame a frame, formulário sem `<form>`, formulário oculto até uma etapa |
| **UTM** | Parâmetros na URL e propagação para links de WhatsApp e campos ocultos; URL de teste com UTM gerada pelo painel (modelo configurável na engrenagem, `{data}` vira a data do dia) |
| **Saúde** | HTTPS, CSS que não carregou, recursos com erro, erros de JavaScript, title, viewport, description, tempo de carregamento |
| **Teste de envio** | Avanço automático por quiz ou etapas (ou espera o analista chegar ao formulário), preenchimento, sinal real de envio, mensagem de sucesso ou página de obrigado, `Lead` na Meta, `generate_lead` no GA4, conversão no Google Ads, UTM no corpo do envio |

Como ler cada item do laudo: [docs/laudo.md](docs/laudo.md).

## O que fica fora

- API de Conversões (CAPI) e qualquer disparo feito no servidor.
- O que acontece dentro do GTM (tags, gatilhos, Conversion Linker): o Track Eye vê o resultado, não a configuração.
- Dentro de iframes que não respondem à varredura e de captchas.
- Google Meu Negócio e a conta de anúncios.

Detalhes e o porquê de cada limite: [docs/limites.md](docs/limites.md).

## Privacidade

O Track Eye só observa. Não bloqueia requisição, não altera a página, não manda nada para fora do seu navegador: não há servidor, conta nem telemetria. O cadastro de projetos e o histórico ficam no `chrome.storage` do seu navegador, e você exporta um JSON quando quiser compartilhar com o time. A única ação que sai da sua máquina é o teste de envio, feito de propósito, com aviso, e com o corpo da requisição lido só para achar chaves de UTM (nada é guardado).

## Desenvolver

```bash
npm install     # só jsdom, para os testes
npm test        # 35 testes: scanner, regras, rede, laudo, quiz, widgets e UTM de teste
npm run icons   # regenera os ícones PNG
```

Arquitetura, como contribuir e como testar o painel fora da extensão: [docs/desenvolvimento.md](docs/desenvolvimento.md).

## Licença

[MIT](LICENSE). Use, modifique, distribua. Se melhorar, manda um pull request.

Feito por [Emerson Serra](https://github.com/emepatron) para quem já perdeu verba por causa de uma tag que não disparava.
