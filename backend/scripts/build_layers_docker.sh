#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

build_layer() {
  local layer="$1"
  local dir="layers/$layer"
  rm -rf "$dir/python"/*.dist-info "$dir/python"/*.so "$dir/python/pymssql" "$dir/python/jwt"
  if [[ -f "$dir/requirements.txt" ]]; then
    docker run --rm --platform linux/amd64 \
      -v "$PWD/$dir":/var/task \
      public.ecr.aws/sam/build-python3.12 \
      /bin/sh -lc "pip install -r /var/task/requirements.txt -t /var/task/python --no-cache-dir"
  fi
  (cd "$dir" && zip -r "../${layer}.zip" python)
}

build_layer parking-shared-utils
build_layer parking-auth-utils
build_layer parking-database-utils

echo "Capas creadas en backend/layers/*.zip"
