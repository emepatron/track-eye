# Desenvolvimento

## Arquitetura

```
manifest.json                 Manifest V3, painel lateral, permissões
src/inject-main.js            roda no mundo da página antes de tudo: observa dataLayer, fbq, gtag, erros e submits
src/background.js             service worker: observa requisições por aba, registra navegações, executa varredura e teste
src/net.js                    classificação das requisições de rastreamento (testável em Node)
src/scanner.js                funções injetadas na página: varredura, sonda de bloqueio, leitura de scripts, avanço por etapas, preenchimento e envio
src/rules.js                  regras do laudo e veredito
src/report.js                 laudo em markdown e resumo curto
src/clients.js                cadastro de clientes, configurações e histórico (chrome.storage.local)
src/panel/                    interface (HTML, CSS, JS) do painel lateral
src/panel/mock-chrome.js      chrome.* falso para abrir o painel num navegador comum
assets/                       fontes empacotadas, ícones, logo
test/                         testes em Node com jsdom sobre páginas de exemplo
```

Princípios:

- **Só observa.** Nenhuma requisição é bloqueada ou alterada. Nada sai do navegador além do teste de envio.
- **Honestidade.** Toda checagem tem evidência. Sem evidência, o status é `unknown`, nunca `fail`.
- **Funções injetadas são autocontidas.** `trackEyeScan`, `trackEyeProbe`, `trackEyeDeep`, `trackEyeReachForm`, `trackEyeFillAndSubmit`, `trackEyeIsVisible` e `trackEyeAfterSubmit` são serializadas pelo `chrome.scripting.executeScript` e rodam no mundo da página. Não podem referenciar nada fora do próprio corpo.
- **Sem bundler.** JavaScript puro, módulos ES, para carregar "sem compactação" e ler o código sem build.

## Rodar os testes

```bash
npm install
npm test
```

Os testes usam jsdom, que não calcula layout. Onde a visibilidade importa, os testes substituem `getBoundingClientRect`.

## Ver o painel fora da extensão

Sirva a pasta por HTTP e abra `src/panel/panel.html`:

```bash
python -m http.server 8143
```

Sem `chrome.runtime`, o painel carrega o `mock-chrome.js` com uma página fictícia, útil para mexer no visual.

## Adicionar uma checagem

1. Se precisar de dado novo da página, colete em `trackEyeScan` (lembre: autocontida).
2. Escreva a regra em `rules.js` com `id`, `group`, `status`, `title`, `evidence` e `fix`.
3. Cubra com um teste em `test/` usando uma página de exemplo em `test/fixtures/`.
4. Se a checagem depende de requisição de rede, adicione o padrão em `net.js` e o filtro em `URL_FILTERS`.

## Adicionar um provedor de chat, formulário ou tag

- Chats: lista `CHAT_SIGNATURES` em `scanner.js`.
- Formulários embutidos: regex em `embeddedForms`.
- Provedor de formulário: cadeia de `provider` em `describe()`.
- Tags: `PATTERNS` em `net.js` e os regex de `tags` em `scanner.js`.

## Versão e ícone

O navegador guarda o ícone da barra em cache por versão da extensão. Ao mudar ícone ou qualquer comportamento visível, suba `version` em `manifest.json` e `package.json`; sem isso, "Atualizar" na página de extensões não troca o ícone. Os PNG saem de `npm run icons` (`scripts/make-icons.js`); o 16 px é simplificado de propósito (só contorno do olho e pupila), porque o anel da íris vira borrão nesse tamanho.

## Site

`site/index.html` é a landing page, em um arquivo só, com caminhos relativos (`../assets/...`) para abrir tanto do disco quanto servida. `site/Dockerfile` (nginx:alpine) e `site/nginx.conf` (headers de segurança, gzip, cache, redirects `/github` e `/download`) servem para qualquer host que aceite Dockerfile, com o contexto de build na raiz do repositório e o Dockerfile em `site/Dockerfile`.

## Estado (03/11/2026)

- Versão 0.1.1, alfa. Varredura, teste de envio (inclusive em quiz, com avanço automático e modo de espera), clientes, histórico e laudo funcionando em páginas reais.
- Não iniciado: publicação na Chrome Web Store (a instalação é "sem compactação"), detecção de outros provedores de chat e formulário além dos listados em `scanner.js`.

## Pull requests

Mantenha `npm test` verde, escreva mensagens de commit em português, e se a mudança for de comportamento, atualize `docs/laudo.md` ou `docs/limites.md`.
