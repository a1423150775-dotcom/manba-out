#!/bin/sh
cd "$(dirname "$0")" || exit 1
"$(pwd)/GameServer" "$(pwd)/launcher.cjs"
result=$?
if [ "$result" -ne 0 ]; then
  printf '服务器异常退出（退出码 %s），请检查 config.json 和 logs/server.log。\n' "$result" >&2
fi
exit "$result"
