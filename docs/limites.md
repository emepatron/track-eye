# Limites

O Track Eye enxerga o que o navegador enxerga. É muito, mas não é tudo. Estes são os limites, e o porquê.

## API de Conversões (CAPI) e disparos no servidor

Eventos enviados do servidor para a Meta ou para o Google não passam pelo navegador. O Track Eye não os vê. Se a conversão da página é só por CAPI, o teste de envio vai dizer que a Meta não recebeu `Lead` pelo navegador, e isso pode estar certo. Confira no Gerenciador de Eventos da Meta.

## O que acontece dentro do GTM

O Track Eye vê o resultado do GTM (o que disparou), não a configuração (tags, gatilhos, Conversion Linker, variáveis). Uma tag com gatilho que não aconteceu nesta visita não aparece. Para auditar a configuração, use o GTM Preview ou exporte o container.

## Iframes que não respondem e captchas

A varredura roda em todos os frames da aba. Quando um iframe não responde (bloqueio de origem, carregamento tardio), o laudo diz "formulário embutido via iframe" e pede teste manual. Captchas (Turnstile, reCAPTCHA, hCaptcha) podem barrar o teste automático; o laudo avisa.

## Bloqueadores de anúncios e Brave Shields

Eles bloqueiam exatamente os scripts que o Track Eye precisa observar. A sonda de bloqueio detecta isso e rebaixa as checagens para "não deu para conferir", mas a auditoria só vale com o bloqueio desligado para o site.

## Primeira visita sem o observador

Se a página carregou antes de a extensão ser instalada ou ativada, o observador não capturou o que disparou no carregamento. O laudo avisa e manda usar "Recarregar e varrer".

## Quiz e fluxos em etapas

O avanço automático escolhe sempre a primeira opção de cada etapa. Fluxos que exigem resposta específica, validação de CPF real ou login não serão percorridos; nesse caso o Track Eye espera você chegar ao formulário.

## Google Meu Negócio e conta de anúncios

Ficam fora do navegador. O Track Eye não lê anúncios ativos, UTMs configuradas no gerenciador nem a ficha do Google.

## Heurísticas

Provedor de formulário, posição de um botão, "formulário longo", "parece sem CSS": são heurísticas. Quando errar, o inventário mostra os dados brutos para você julgar. Se encontrar um caso que ele não entende, abra uma issue com o laudo e a URL.
