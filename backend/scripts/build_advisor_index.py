"""
สร้างคลังความรู้ของ AI Advisor (RAG) — อ่านข้อมูลอย่างเดียว ไม่แตะโมเดล ML / predict.py / datasets/ml

ผลลัพธ์ (backend/data/advisor/):
  careers_kb.json   ข้อความของ 910 อาชีพ: ชื่อไทย/อังกฤษ, คำอธิบาย O*NET, งานหลัก (Task Statements แบบ Core)
  careers_emb.npy   embedding ของแต่ละอาชีพ (float32, normalize แล้ว) สำหรับค้นด้วยความหมาย
  index_meta.json   ลำดับรหัสอาชีพ + ชื่อโมเดล embedding + มิติ

รัน (จากโฟลเดอร์ backend, ต้องตั้ง GEMINI_API_KEY ใน backend/.env):
    .venv/bin/python scripts/build_advisor_index.py            # สร้าง kb + embedding
    .venv/bin/python scripts/build_advisor_index.py --kb-only  # สร้างแค่ข้อความ (ไม่เรียก API)
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.deps import ROOT, get_predictor  # noqa: E402

OUT = BACKEND / "data" / "advisor"
EMB_MODEL = os.getenv("ADVISOR_EMBED_MODEL", "gemini-embedding-001")
EMB_DIM = 768
TASKS_PER_CAREER = 6


def build_kb() -> dict:
    p = get_predictor()
    th = pd.read_csv(ROOT / "datasets" / "onet_thai" / "onet_thai_titles.csv", dtype=str).fillna("").set_index("code")
    tasks = pd.read_excel(ROOT / "datasets" / "Task Statements.xlsx", usecols=["O*NET-SOC Code", "Task", "Task Type"])
    tasks = tasks[tasks["Task Type"] == "Core"].groupby("O*NET-SOC Code")["Task"].apply(lambda s: list(s)[:TASKS_PER_CAREER])
    kb = {}
    for code in p.codes:
        meta = p.meta.loc[code] if p.meta is not None and code in p.meta.index else None
        kb[code] = {
            "code": code,
            "title_th": th.loc[code, "title_th"] if code in th.index else "",
            "title_en": p._title(code),
            "aliases": th.loc[code, "aliases"] if code in th.index else "",
            "major_name": "" if meta is None else str(meta["major_name"]),
            "description": "" if meta is None else str(meta["Description"]),
            "tasks": tasks.get(code, []),
        }
    return kb


def doc_text(c: dict) -> str:
    """ข้อความที่ใช้ทำ embedding — ไทย + อังกฤษ ให้ค้นได้ทั้งสองภาษา"""
    parts = [c["title_th"], c["title_en"], c["aliases"], c["major_name"], c["description"], " ".join(c["tasks"])]
    return "\n".join(x for x in parts if x)


def embed_all(texts: list[str]) -> np.ndarray:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    cfg = types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT", output_dimensionality=EMB_DIM)
    out = []
    for i in range(0, len(texts), 50):
        batch = texts[i : i + 50]
        for attempt in range(5):
            try:
                r = client.models.embed_content(model=EMB_MODEL, contents=batch, config=cfg)
                break
            except Exception as e:  # โควตาฟรีต่อนาที — รอแล้วลองใหม่
                wait = 20 * (attempt + 1)
                print(f"  batch {i}: {str(e)[:80]} — รอ {wait}s")
                time.sleep(wait)
        else:
            raise SystemExit("สร้าง embedding ไม่สำเร็จ")
        out.extend(e.values for e in r.embeddings)
        print(f"  {min(i + 50, len(texts))}/{len(texts)}")
    X = np.asarray(out, dtype=np.float32)
    return X / np.linalg.norm(X, axis=1, keepdims=True)  # ลดมิติแล้วต้อง normalize เอง


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kb-only", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    kb = build_kb()
    (OUT / "careers_kb.json").write_text(json.dumps(kb, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"careers_kb.json: {len(kb)} อาชีพ")
    if args.kb_only:
        return
    codes = list(kb)
    X = embed_all([doc_text(kb[c]) for c in codes])
    np.save(OUT / "careers_emb.npy", X)
    (OUT / "index_meta.json").write_text(json.dumps({"model": EMB_MODEL, "dim": EMB_DIM, "codes": codes}), encoding="utf-8")
    print(f"careers_emb.npy: {X.shape}")


if __name__ == "__main__":
    main()
