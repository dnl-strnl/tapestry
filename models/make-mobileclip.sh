#!/bin/bash

MODEL_VARIANT="${1:-s0}"

mkdir model-files
git clone https://github.com/apple/ml-mobileclip.git
mv ml-mobileclip/* model-files/
rm -rf ml-mobileclip

MODEL_NAME=mobileclip_${MODEL_VARIANT}
MODELS_URL=https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip

wget $MODELS_URL/mobileclip_${MODEL_VARIANT}.pt -P model-files/

torch-model-archiver \
    --model-name=$MODEL_NAME \
    --handler=models/mobileclip_handler.py \
    --extra-files=model-files/ \
    --runtime=python3 \
    --version=1 \
    --export-path=models/ \
    --force

rm -rf model-files/
