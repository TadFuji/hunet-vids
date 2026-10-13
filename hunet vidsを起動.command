#!/bin/zsh
# Double-click in Finder: builds hunet vids and opens it at http://127.0.0.1:4180/ (Ctrl+C in this window stops it).
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${0:A:h}"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Node.js 22.12 以上をインストールしてから、もう一度起動してください。'
  read '?Enter で終了'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --ignore-scripts
fi
npm run build
if curl --silent --fail --max-time 2 http://127.0.0.1:4180/ | grep -q '<title>hunet vids</title>'; then
  print '起動済みの hunet vids を開きます。'
  [[ "${NO_BROWSER:-0}" == 1 ]] || open http://127.0.0.1:4180/
  exit 0
fi
HOST=127.0.0.1 PORT=4180 node server.mjs &
app_pid=$!
cleanup() { kill "$app_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
ready=0
for attempt in {1..30}; do
  if curl --silent --fail --max-time 1 http://127.0.0.1:4180/ | grep -q '<title>hunet vids</title>'; then
    ready=1
    break
  fi
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 0.2
done
if [[ "$ready" != 1 ]]; then
  print '起動できませんでした。ポート 4180 が別のアプリで使われていないか確認してください。'
  read '?Enter で終了'
  exit 1
fi
[[ "${NO_BROWSER:-0}" == 1 ]] || open http://127.0.0.1:4180/
print 'hunet vids が起動しました。終了するときはこのウィンドウで Ctrl+C を押してください。'
wait "$app_pid"
