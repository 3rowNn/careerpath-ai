"""
สร้าง frontend/src/data/sample_result.json ใหม่ (โหมดตัวอย่างของเว็บ) จากโมเดลจริง
ใช้คำตอบของผู้ใช้ตัวอย่างเดิมในไฟล์ — รันหลังเทรนโมเดลใหม่หรือเพิ่มข้อมูลที่หน้าเว็บใช้

    cd backend && .venv/bin/python scripts/make_sample_result.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import get_predictor  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "sample_result.json"

old = json.loads(OUT.read_text(encoding="utf-8"))
answers = old["answers"]
p = get_predictor()
assert set(answers) == set(p.features), "คำตอบตัวอย่างไม่ตรงกับ feature ของโมเดล"
user = {f: (a - 1) / 4 * 100 for f, a in answers.items()}
rec = p.recommend(user, k=5)
codes = [c["code"] for c in rec["careers"]]
out = {
    **{k: v for k, v in old.items() if k not in {"recommend", "skill_gaps", "similar", "explain"}},
    "answers": answers,
    "recommend": rec,
    "skill_gaps": {c: p.skill_gap(user, c, k=10) for c in codes},
    "similar": {c: p.similar_careers(c) for c in codes},
    "explain": {c: p.explain(user, c, k=5) for c in codes},
}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
print(f"→ {OUT} · Top 5: {', '.join(c['title'] for c in rec['careers'])} · ความมั่นใจ {rec['confidence']['level']}")
