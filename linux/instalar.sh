#!/usr/bin/env bash
#
# DOM Runner - instalador para Linux
#
# Uso:
#   bash instalar.sh
#
# Tudo que este script precisa esta nesta mesma pasta.
#

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGEM_RUNNER="$AQUI/run.js"
PATCHER="$AQUI/patch-settings.js"

DESTINO="$HOME/.dom-runner"
RUNNER_JS="$DESTINO/run.js"

azul()    { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
vermelho(){ printf '\033[1;31m%s\033[0m\n' "$*"; }

echo
azul "=== DOM Runner - instalacao (Linux) ==="
echo

# ---------------------------------------------------------------------------
# 1. Pre-requisitos
# ---------------------------------------------------------------------------
azul "[1/6] Verificando Node.js e npm..."

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  vermelho "Node.js ou npm nao encontrados."
  echo "      Debian/Ubuntu:  sudo apt install nodejs npm"
  echo "      Fedora:         sudo dnf install nodejs npm"
  echo "      Arch:           sudo pacman -S nodejs npm"
  echo "      Ou, preferivel, via nvm: https://github.com/nvm-sh/nvm"
  exit 1
fi
echo "      Node $(node -v) / npm $(npm -v)"

[ -f "$ORIGEM_RUNNER" ] || { vermelho "Nao achei run.js nesta pasta."; exit 1; }
[ -f "$PATCHER" ] || { vermelho "Nao achei patch-settings.js nesta pasta."; exit 1; }

# ---------------------------------------------------------------------------
# 2. Puppeteer
# ---------------------------------------------------------------------------
azul "[2/6] Verificando o Puppeteer..."

mkdir -p "$DESTINO"
cd "$DESTINO" || { vermelho "Nao consegui entrar em $DESTINO"; exit 1; }

if node -e "require.resolve('puppeteer')" >/dev/null 2>&1; then
  verde "      Ja instalado. Pulando o download."
else
  echo "      Instalando (baixa o Chromium, ~150 MB)..."
  [ -f package.json ] || npm init -y >/dev/null 2>&1

  if npm install puppeteer; then
    verde "      Puppeteer instalado."
  else
    vermelho "      npm install falhou. Mensagem completa acima."
    echo
    echo "      Se o problema for o download do navegador:"
    echo "        cd ~/.dom-runner"
    echo "        PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer"
    echo "        npx puppeteer browsers install chrome"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 3. Copiar o runner
# ---------------------------------------------------------------------------
azul "[3/6] Instalando o runner..."

cp "$ORIGEM_RUNNER" "$RUNNER_JS"
node --check "$RUNNER_JS" || { vermelho "run.js com sintaxe invalida."; exit 1; }
verde "      $RUNNER_JS"

# ---------------------------------------------------------------------------
# 4. Detectar editores
# ---------------------------------------------------------------------------
azul "[4/6] Procurando editores instalados..."

CONFIG="$HOME/.config"

NOMES=()
PASTAS=()

adicionar() {
  local nome="$1" pasta="$2"
  [ -d "$pasta" ] || return 0
  NOMES+=("$nome")
  PASTAS+=("$pasta")
  echo "      encontrado: $nome"
}

adicionar "VS Code"          "$CONFIG/Code/User"
adicionar "VS Code Insiders" "$CONFIG/Code - Insiders/User"
adicionar "VSCodium"         "$CONFIG/VSCodium/User"
adicionar "Cursor"           "$CONFIG/Cursor/User"
adicionar "Windsurf"         "$CONFIG/Windsurf/User"
adicionar "Trae"             "$CONFIG/Trae/User"
adicionar "Antigravity IDE"  "$CONFIG/Antigravity IDE/User"
adicionar "Antigravity"      "$CONFIG/Antigravity/User"

if [ ${#PASTAS[@]} -eq 0 ]; then
  amarelo "      Nenhum editor encontrado."
  echo "      Abra seu editor ao menos uma vez e rode este script de novo."
  echo "      Ou configure na mao, com o comando:"
  echo "        node $RUNNER_JS \"\$fullFileName\""
fi

# ---------------------------------------------------------------------------
# 5. Configurar cada editor
# ---------------------------------------------------------------------------
azul "[5/6] Configurando..."

for i in "${!PASTAS[@]}"; do
  pasta="${PASTAS[$i]}"
  nome="${NOMES[$i]}"
  settings="$pasta/settings.json"

  if [ -f "$settings" ]; then
    cp "$settings" "$settings.backup-$(date +%Y%m%d-%H%M%S)"
  fi

  printf '      %s: ' "$nome"
  node "$PATCHER" "$settings" "$RUNNER_JS"
done

azul "      Instalando a extensao Code Runner..."
INSTALOU_EXT=0
for cli in code codium cursor windsurf antigravity trae; do
  if command -v "$cli" >/dev/null 2>&1; then
    if "$cli" --install-extension formulahendry.code-runner >/dev/null 2>&1; then
      echo "      ok via '$cli'"
      INSTALOU_EXT=1
    fi
  fi
done

if [ "$INSTALOU_EXT" -eq 0 ]; then
  amarelo "      Nao foi possivel instalar automaticamente."
  echo "      Isso acontece quando o CLI do editor nao esta no PATH, e nao"
  echo "      significa que a extensao esteja faltando."
  echo
  echo "      Se voce JA tem o Code Runner instalado: ignore este aviso."
  echo "      Se nao tem: instale 'Code Runner' (formulahendry.code-runner)"
  echo "      pelo painel de extensoes do editor."
fi

# ---------------------------------------------------------------------------
# 6. Teste
# ---------------------------------------------------------------------------
azul "[6/6] Testando..."

BASE="$(mktemp -d)"
PASTA_TESTE="$BASE/pasta com espaco"
mkdir -p "$PASTA_TESTE"

cat > "$PASTA_TESTE/pagina.html" << 'HTMLTESTE'
<!DOCTYPE html>
<html>
  <body>
    <h1 id="titulo">Ola</h1>
    <script src="teste.js"></script>
  </body>
</html>
HTMLTESTE

cat > "$PASTA_TESTE/teste.js" << 'JSTESTE'
const alvo = document.getElementById('titulo');
console.log('antes: ', alvo);
alvo.innerHTML = '<h2>DOM funcionando</h2>';
console.log('depois:', alvo);
JSTESTE

SAIDA="$(node "$RUNNER_JS" "$PASTA_TESTE/teste.js" 2>&1)"
echo "$SAIDA" | sed 's/^/      | /'
rm -rf "$BASE"

echo
if echo "$SAIDA" | grep -q "DOM funcionando"; then
  verde "=== Pronto. Abra qualquer .js no editor e tecle Ctrl+Alt+N. ==="
  echo
  echo "Se voce acabou de instalar a extensao, reinicie o editor antes."
  echo "Para experimentar: abra exemplo/exemplo.js desta pasta."
else
  vermelho "=== O teste falhou. Mensagem completa acima. ==="
  echo
  echo "Falta de biblioteca do sistema e a causa mais comum."
  echo
  echo "Debian / Ubuntu:"
  echo "  sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \\"
  echo "    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \\"
  echo "    libxrandr2 libgbm1 libpango-1.0-0 libcairo2"
  echo
  echo "  # e mais uma destas duas, conforme a versao da distro:"
  echo "  sudo apt install -y libasound2t64  ||  sudo apt install -y libasound2"
  echo
  echo "Fedora:"
  echo "  sudo dnf install -y nss atk at-spi2-atk cups-libs libdrm libxkbcommon \\"
  echo "    libXcomposite libXdamage libXfixes libXrandr mesa-libgbm alsa-lib \\"
  echo "    pango cairo"
  echo
  echo "Arch:"
  echo "  sudo pacman -S --needed nss atk at-spi2-atk libcups libdrm libxkbcommon \\"
  echo "    libxcomposite libxdamage libxfixes libxrandr mesa alsa-lib pango cairo"
  exit 1
fi
echo
