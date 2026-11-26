#!/usr/bin/env bash
# 外刊精读 · 一键启动（macOS / Linux）
# 用法：双击运行，或终端执行 ./start.sh [端口]
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "没找到 Node.js。请先安装 LTS 版本：https://nodejs.org"
  read -r -p "按回车退出…" _ || true
  exit 1
fi

echo
echo "  正在从 src/ 构建 index.html …"
node build.mjs

exec node serve.mjs --open "$@"
