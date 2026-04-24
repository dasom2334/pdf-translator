#!/bin/bash
# 로컬 LLM 번역 모델 다운로드 스크립트
#
# 서비스 자동 다운로드와 동일하게 npx node-llama-cpp pull을 사용한다.
# 모델을 미리 받아두거나 CI 환경에서 사전 다운로드할 때 사용한다.
#
# Usage:
#   bash scripts/download-model.sh
#   LOCAL_LLM_MODEL_PATH=/custom/path/model.gguf bash scripts/download-model.sh
set -e

MODEL_PATH="${LOCAL_LLM_MODEL_PATH:-assets/models/translateGemma.gguf}"
MODEL_URI="hf:mradermacher/translategemma-12b-it-GGUF/translategemma-12b-it.Q4_K_M.gguf"
MODEL_DIR="$(dirname "$MODEL_PATH")"
MODEL_FILENAME="$(basename "$MODEL_PATH")"

mkdir -p "$MODEL_DIR"
echo "Downloading model to $MODEL_PATH (~7.3GB)..."
npx node-llama-cpp@3.18.1 pull --dir "$MODEL_DIR" --filename "$MODEL_FILENAME" "$MODEL_URI"
echo "Done."
