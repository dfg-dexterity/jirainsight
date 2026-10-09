#!/bin/bash
# 📞 Dexterity Call Tracking — desinstalador (macOS)
#   curl -fsSL https://jirainsight.vercel.app/call-tracking/desinstalar.sh | bash
#   … | bash -s -- --tudo   (apaga também as preferências e as chamadas pendentes)
set -uo pipefail
BUNDLE="br.com.dexterityit.calltracking"
EXE="DexterityCallTracking"
NOME="Dexterity Call Tracking"

launchctl bootout "gui/$(id -u)/$BUNDLE" >/dev/null 2>&1 || true
pkill -x "$EXE" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/$BUNDLE.plist"
rm -rf "$HOME/Applications/$NOME.app" "/Applications/$NOME.app" 2>/dev/null
if [ "${1:-}" = "--tudo" ]; then
  rm -rf "$HOME/Library/Application Support/DexterityCallTracking" "$HOME/Library/Logs/DexterityCallTracking.log"
  echo "✅ Call tracking removido, com as preferências e as chamadas pendentes."
else
  echo "✅ Call tracking removido. As preferências ficaram em ~/Library/Application Support/DexterityCallTracking (use --tudo para apagar)."
fi
