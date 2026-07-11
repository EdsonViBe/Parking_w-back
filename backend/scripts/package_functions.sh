#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist/functions
for name in auth users parkings reservations; do
  (cd "functions/$name" && zip -r "../../dist/functions/${name}.zip" lambda_function.py)
done
echo "Funciones creadas en backend/dist/functions/"
