#!/bin/bash
# Usage: bash scripts/download-model.sh
# Or:    MODEL_URL=<url> bash scripts/download-model.sh
set -e
MODEL_URL="${MODEL_URL:-}"
if [ -z "$MODEL_URL" ]; then
  echo "Error: MODEL_URL environment variable is required"
  echo "Usage: MODEL_URL=https://... bash scripts/download-model.sh"
  exit 1
fi
mkdir -p assets/models
echo "Downloading model to assets/models/translateGemma.gguf ..."
wget -q --show-progress -O assets/models/translateGemma.gguf "$MODEL_URL"
echo "Done."
