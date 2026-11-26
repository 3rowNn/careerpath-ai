#!/bin/sh
# สร้าง careerpath_ml_bundle.zip สำหรับอัปโหลดขึ้น Colab (รันจาก root ของโปรเจกต์: sh colab/make_bundle.sh)
# มีแค่ข้อมูล input + สคริปต์ — ไม่ใส่ output/ เพื่อให้ Colab เทรนใหม่ทั้งหมด
# ใส่ผลเดิม (summary.json, report.json) ไว้ที่ reference/ เพื่อเทียบว่ารันซ้ำได้ผลเท่าเดิม
set -e
cd "$(dirname "$0")/.."
OUT=colab/careerpath_ml_bundle.zip
rm -f "$OUT"
TMP=$(mktemp -d)
mkdir -p "$TMP/reference"
cp datasets/ml/output/general/summary.json "$TMP/reference/summary.json"
cp datasets/ml/output/general/evaluation/report.json "$TMP/reference/report.json"
zip -qr "$OUT" \
  "datasets/Task Statements.xlsx" \
  datasets/data_gate_output/occupation_features.csv \
  datasets/data_gate_output/occupation_meta.csv \
  datasets/data_gate_output/occupation_requirements_long.csv \
  datasets/data_gate_output/synthetic_users_train.csv \
  datasets/data_gate_output/synthetic_users_val.csv \
  datasets/data_gate_output/synthetic_users_test.csv \
  datasets/cip datasets/onet_thai/onet_thai_titles.csv \
  datasets/ml/*.py datasets/ml/requirements-train.txt \
  datasets/ml/evaluation/evaluate.py datasets/ml/evaluation/personas.json \
  -x '*/__pycache__/*' '*.DS_Store'
(cd "$TMP" && zip -qr "$OLDPWD/$OUT" reference)
rm -rf "$TMP"
ls -lh "$OUT"
