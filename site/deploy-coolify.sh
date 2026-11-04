#!/usr/bin/env bash
# Cria (ou redeploya) o site do Track Eye no Coolify da GS.
#
# Uso, no terminal do Emerson, com o Tailscale ligado:
#   bash site/deploy-coolify.sh                      # lista os projetos e pergunta qual usar
#   bash site/deploy-coolify.sh --project "Sites GS"  # nome ou uuid do projeto
#   bash site/deploy-coolify.sh --redeploy            # só dispara o deploy do app que já existe
#
# O token nunca é impresso. Sai do vault `pass` (infra/hostinger-pessoal/coolify-api-token)
# ou da variável COOLIFY_TOKEN, se você preferir exportar antes.
set -euo pipefail
set +x

REPO="https://github.com/emepatron/track-eye"
BRANCH="main"
APP_NAME="track-eye"
DOMAIN="https://trackeye.gsgrowthai.com"
TOKEN_PATH="${COOLIFY_TOKEN_PATH:-infra/hostinger-pessoal/coolify-api-token}"
URL_PATH_IN_VAULT="infra/hostinger-pessoal/coolify-url"

export PASSWORD_STORE_DIR="${PASSWORD_STORE_DIR:-/d/Credenciais/password-store}"
export GNUPGHOME="${GNUPGHOME:-/d/Credenciais/gnupg}"

PROJECT=""
SERVER="${COOLIFY_SERVER_UUID:-}"
REDEPLOY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --redeploy) REDEPLOY=1; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

for bin in curl jq pass; do command -v "$bin" >/dev/null || { echo "Falta o programa '$bin'." >&2; exit 1; }; done

# ---- credenciais (sem ecoar) ----
if [ -z "${COOLIFY_TOKEN:-}" ]; then
  COOLIFY_TOKEN="$(pass "$TOKEN_PATH" 2>/dev/null | head -1)" || true
fi
[ -n "${COOLIFY_TOKEN:-}" ] || { echo "Token não encontrado em '$TOKEN_PATH' (vault) nem em COOLIFY_TOKEN." >&2; exit 1; }
BASE="${COOLIFY_URL:-$(pass "$URL_PATH_IN_VAULT" 2>/dev/null | head -1 || true)}"
BASE="${BASE:-https://coolify.gsgrowthai.com}"
BASE="${BASE%/}"
API="$BASE/api/v1"

api() { # api METODO caminho [json]
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS --fail-with-body -X "$method" "$API$path" -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" -d "$data"
  else
    curl -sS --fail-with-body -X "$method" "$API$path" -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Accept: application/json"
  fi
}

echo "Coolify: $BASE"
if ! api GET /servers >/tmp/te-servers.json 2>/tmp/te-err.txt; then
  echo "Não consegui falar com a API. Tailscale ligado? Token válido?" >&2
  sed 's/Bearer [^ ]*/Bearer ***/g' /tmp/te-err.txt >&2 || true
  exit 1
fi

# ---- app já existe? ----
EXISTING="$(api GET /applications | jq -r --arg repo "$REPO" --arg name "$APP_NAME" \
  '[.[] | select((.git_repository // "" | ascii_downcase | contains("emepatron/track-eye")) or .name == $name)] | first // empty | .uuid')"

if [ -n "$EXISTING" ]; then
  echo "App já existe no Coolify: $EXISTING. Disparando o deploy…"
  DEPLOY="$(api POST "/deploy" "{\"uuid\":\"$EXISTING\",\"force\":true}")"
  echo "$DEPLOY" | jq -r '.deployments[]? | "  \(.message // "deploy") · deployment \(.deployment_uuid // "?")"' 2>/dev/null || echo "$DEPLOY"
  APP_UUID="$EXISTING"
else
  [ "$REDEPLOY" -eq 1 ] && { echo "Não achei o app para redeployar. Rode sem --redeploy para criar." >&2; exit 1; }

  # ---- servidor ----
  if [ -z "$SERVER" ]; then
    COUNT="$(jq 'length' /tmp/te-servers.json)"
    if [ "$COUNT" -eq 1 ]; then
      SERVER="$(jq -r '.[0].uuid' /tmp/te-servers.json)"
    else
      echo "Servidores:"; jq -r '.[] | "  \(.uuid)  \(.name)"' /tmp/te-servers.json
      read -r -p "uuid do servidor: " SERVER
    fi
  fi
  echo "Servidor: $(jq -r --arg u "$SERVER" '.[] | select(.uuid==$u) | .name' /tmp/te-servers.json) ($SERVER)"

  # ---- projeto ----
  api GET /projects >/tmp/te-projects.json
  if [ -z "$PROJECT" ]; then
    echo "Projetos:"; jq -r '.[] | "  \(.uuid)  \(.name)"' /tmp/te-projects.json
    read -r -p "nome ou uuid do projeto (Enter cria um novo chamado \"Track Eye\"): " PROJECT
  fi
  if [ -z "$PROJECT" ]; then
    PROJECT_UUID="$(api POST /projects '{"name":"Track Eye","description":"Site do Track Eye (trackeye.gsgrowthai.com)"}' | jq -r '.uuid')"
    echo "Projeto criado: Track Eye ($PROJECT_UUID)"
  else
    PROJECT_UUID="$(jq -r --arg p "$PROJECT" '.[] | select(.uuid==$p or .name==$p) | .uuid' /tmp/te-projects.json | head -1)"
    [ -n "$PROJECT_UUID" ] || { echo "Projeto '$PROJECT' não encontrado." >&2; exit 1; }
    echo "Projeto: $(jq -r --arg u "$PROJECT_UUID" '.[] | select(.uuid==$u) | .name' /tmp/te-projects.json) ($PROJECT_UUID)"
  fi

  # ---- cria o app (repositório público, Dockerfile em site/) ----
  BODY="$(jq -n --arg p "$PROJECT_UUID" --arg s "$SERVER" --arg repo "$REPO" --arg br "$BRANCH" --arg name "$APP_NAME" --arg dom "$DOMAIN" '{
    project_uuid: $p, server_uuid: $s, environment_name: "production",
    name: $name, description: "Landing page do Track Eye",
    git_repository: $repo, git_branch: $br,
    build_pack: "dockerfile", base_directory: "/", dockerfile_location: "/site/Dockerfile",
    ports_exposes: "80", domains: $dom, instant_deploy: true
  }')"
  CREATED="$(api POST /applications/public "$BODY")"
  APP_UUID="$(echo "$CREATED" | jq -r '.uuid // empty')"
  [ -n "$APP_UUID" ] || { echo "A API não devolveu o uuid do app:" >&2; echo "$CREATED" >&2; exit 1; }
  echo "App criado: $APP_NAME ($APP_UUID) com deploy imediato."
fi

# ---- acompanha o deploy ----
# Enquanto o build roda, o app aparece como "exited:unhealthy" (ainda não subiu); o que
# diz se terminou é a fila de deployments. Só é falha se a fila esvaziar e o app não estiver "running".
echo "Aguardando o deploy (até 10 min)…"
OK=0
for i in $(seq 1 120); do
  sleep 5
  STATUS="$(api GET "/applications/$APP_UUID" | jq -r '.status // "?"')"
  PENDING="$(api GET /deployments 2>/dev/null | jq -r --arg u "$APP_UUID" '[.[]? | select(.application_uuid==$u or .application_id==$u)] | length' 2>/dev/null || echo 0)"
  printf '  %3ds  app: %-18s deploys na fila: %s\n' $((i*5)) "$STATUS" "$PENDING"
  case "$STATUS" in
    running*) OK=1; break ;;
  esac
  if [ "$PENDING" = "0" ] && [ "$i" -gt 6 ]; then
    echo "A fila esvaziou e o app ficou em '$STATUS'. Veja os logs no painel: $BASE" >&2
    exit 1
  fi
done
[ "$OK" -eq 1 ] || { echo "Passaram 10 min e o app não ficou 'running'. Veja o painel: $BASE" >&2; exit 1; }

echo
echo "Pronto. Confira:"
echo "  $DOMAIN/            (página)"
echo "  $DOMAIN/og.png      (imagem de compartilhamento)"
echo "  $DOMAIN/assets/mark.svg"
echo "  $DOMAIN/download    (redirect para o ZIP)"
echo "Painel: $BASE  ·  app $APP_UUID"
