#!/bin/bash
# 📞 Dexterity Call Tracking — instalador (macOS 12+)
#
# Uso (no Terminal do Mac):
#   curl -fsSL https://jirainsight.vercel.app/call-tracking/instalar.sh | bash
#
# O que faz, passo a passo (nada é enviado a lugar nenhum):
#   1. confere o macOS e o compilador Swift (Ferramentas de Linha de Comando do Xcode, da Apple);
#   2. baixa o código-fonte do detector (CallTracking.swift, ~40 KB, legível) do próprio painel;
#   3. compila NO SEU MAC e roda o autoteste — se falhar, nada é instalado;
#   4. monta "~/Applications/Dexterity Call Tracking.app" (assinatura local, sem conta Apple);
#   5. liga o início automático ao entrar no Mac (LaunchAgent) e abre o 📞 na barra de menus.
#
# Variáveis (opcionais): PAINEL_URL (padrão: o painel de produção) · CT_FONTE (arquivo .swift local
# em vez de baixar) · CT_DESTINO (pasta do app) · CT_SEM_INICIAR=1 (só monta o app — usado na CI).
# Desinstalar: curl -fsSL https://jirainsight.vercel.app/call-tracking/desinstalar.sh | bash
set -euo pipefail

PAINEL="${PAINEL_URL:-https://jirainsight.vercel.app}"
PAINEL="${PAINEL%/}"
NOME="Dexterity Call Tracking"
BUNDLE="br.com.dexterityit.calltracking"
EXE="DexterityCallTracking"
DESTINO="${CT_DESTINO:-$HOME/Applications}"
APP="$DESTINO/$NOME.app"
AGENTE="$HOME/Library/LaunchAgents/$BUNDLE.plist"
LOG="$HOME/Library/Logs/DexterityCallTracking.log"

passo() { printf '\n\033[1m%s\033[0m\n' "$*"; }
erro() { printf '\n❌ %s\n' "$*" >&2; exit 1; }
xml() { local s="$1"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; printf '%s' "$s"; }

[ "$(uname -s)" = "Darwin" ] || erro "O Call tracking roda no macOS."
VER_MAC="$(sw_vers -productVersion)"
[ "${VER_MAC%%.*}" -ge 12 ] || erro "Precisa do macOS 12 ou mais novo (este Mac está no $VER_MAC)."

passo "1/5 · Conferindo o compilador Swift"
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "Falta instalar as Ferramentas de Linha de Comando do Xcode (gratuitas, da Apple, ~5 min)."
  echo "Vou abrir o instalador da Apple. Quando ele terminar, rode este mesmo comando de novo."
  xcode-select --install >/dev/null 2>&1 || true
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passo "2/5 · Baixando o código-fonte do detector"
if [ -n "${CT_FONTE:-}" ]; then
  cp "$CT_FONTE" "$TMP/CallTracking.swift"
else
  curl -fsSL "$PAINEL/call-tracking/CallTracking.swift" -o "$TMP/CallTracking.swift" \
    || erro "Não consegui baixar $PAINEL/call-tracking/CallTracking.swift."
fi
grep -q 'br.com.dexterityit.calltracking' "$TMP/CallTracking.swift" || erro "O arquivo baixado não parece o código do Call tracking."

passo "3/5 · Compilando (uns 30 segundos) e rodando o autoteste"
xcrun swiftc -O -parse-as-library -target "$(uname -m)-apple-macos12.0" -o "$TMP/$EXE" "$TMP/CallTracking.swift" \
  || erro "A compilação falhou. Rode 'xcode-select --install' (ou atualize as Ferramentas de Linha de Comando) e tente de novo."
"$TMP/$EXE" --selftest || erro "O autoteste falhou — nada foi instalado."
VERSAO="$("$TMP/$EXE" --version)"

passo "4/5 · Montando o app em $APP"
if [ -z "${CT_SEM_INICIAR:-}" ]; then
  launchctl bootout "gui/$(id -u)/$BUNDLE" >/dev/null 2>&1 || true
  pkill -x "$EXE" >/dev/null 2>&1 || true
fi
mkdir -p "$DESTINO"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$TMP/$EXE" "$APP/Contents/MacOS/$EXE"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$BUNDLE</string>
  <key>CFBundleName</key><string>$NOME</string>
  <key>CFBundleDisplayName</key><string>$NOME</string>
  <key>CFBundleExecutable</key><string>$EXE</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSAO</string>
  <key>CFBundleVersion</key><string>$VERSAO</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>Para reconhecer chamadas do Google Meet, do Teams e do WhatsApp no navegador, o Call tracking lê o endereço e o título da aba da chamada. Nada sai do seu Mac sem você clicar.</string>
  <key>NSHumanReadableCopyright</key><string>Dexterity IT — Jira Insights</string>
</dict>
</plist>
PLIST
plutil -lint "$APP/Contents/Info.plist" >/dev/null || erro "Info.plist inválido."
codesign --force --sign - --identifier "$BUNDLE" "$APP" >/dev/null 2>&1 || erro "Não consegui assinar o app (codesign)."
codesign --verify "$APP" || erro "A assinatura do app não confere."

if [ -n "${CT_SEM_INICIAR:-}" ]; then
  echo "✅ App montado em $APP (versão $VERSAO). CT_SEM_INICIAR: sem início automático."
  exit 0
fi

passo "5/5 · Ligando o início automático e abrindo o 📞 na barra de menus"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$AGENTE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$BUNDLE</string>
  <key>ProgramArguments</key><array><string>$(xml "$APP/Contents/MacOS/$EXE")</string></array>
  <key>EnvironmentVariables</key><dict><key>CT_PAINEL</key><string>$(xml "$PAINEL")</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Interactive</string>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
</dict>
</plist>
PLIST
plutil -lint "$AGENTE" >/dev/null || erro "LaunchAgent inválido."
launchctl bootstrap "gui/$(id -u)" "$AGENTE" >/dev/null 2>&1 || launchctl kickstart -k "gui/$(id -u)/$BUNDLE" >/dev/null 2>&1 || open "$APP"
sleep 2
pgrep -x "$EXE" >/dev/null || open "$APP"

cat <<FIM

✅ Call tracking $VERSAO instalado.
   • Procure o 📞 na barra de menus (no alto, à direita).
   • Quando uma chamada terminar, um pop-up pergunta: 📝 criar ticket ou ⏱ apontar em ticket.
   • Na 1ª chamada pelo navegador, o macOS pergunta se o Call tracking pode ler as abas
     (para reconhecer Meet/Teams/WhatsApp Web) — aceite. Dá para desligar em Preferências.
   • Painel: $PAINEL/?v=chamadas
FIM
