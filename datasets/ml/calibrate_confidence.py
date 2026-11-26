"""
ความมั่นใจของโมเดล — calibrate กับผู้ใช้จำลองชุดใหม่ (ไม่ซ้ำกับชุดเทรน/ทดสอบ)

คำถามที่ตอบ: "ถ้า Ensemble ให้คะแนนอันดับ 1 สูงขนาดนี้ ในผู้ใช้จำลองอันดับ 1 ถูกกี่ %"
- ผู้ใช้จำลอง = โปรไฟล์อาชีพ + bias + noise แบบเดียวกับ stress test (9 สถานการณ์ × 910 อาชีพ = 8,190 คน)
  seed 4001 (เทรนใช้ 42/1001, stress val 2001, stress test 3001)
- ต่างจาก stress test: ปัดคำตอบเป็น 5 ระดับ (0/25/50/75/100) เหมือนคนจริงที่ตอบ 1–5
- แบ่งคะแนนอันดับ 1 เป็น 5 ช่วงเท่า ๆ กัน (quantile) แล้ววัด Top-1 / Top-5 ในแต่ละช่วง
- ยังเป็นผู้ใช้จำลอง — บอกได้ว่า "คะแนนสูง = น่าเชื่อกว่า" แต่ตัวเลข % กับคนจริงอาจต่างไป

รัน:  python calibrate_confidence.py [--models output/general/models]
ผล:   <models>/confidence_calibration.json  (predict.py อ่านอัตโนมัติ)
"""

import argparse
import json
from pathlib import Path

import numpy as np

from predict import CareerPredictor

SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]
SEED = 4001
LEVELS = ["low", "low", "medium", "high", "high"]  # 5 ช่วง → 3 ระดับ


def simulate(p: CareerPredictor):
    r = np.random.default_rng(SEED)
    Xs = [np.clip(p.R + b + r.normal(0, 1, p.R.shape) * sd, 0, 100) for sd, b in SCENARIOS]
    X = np.round(np.vstack(Xs) / 25) * 25  # ตอบได้แค่ 1–5
    return X, np.tile(np.arange(len(p.R)), len(SCENARIOS))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", type=Path, default=Path(__file__).parent / "output" / "general" / "models")
    a = ap.parse_args()
    p = CareerPredictor(a.models)
    X, y = simulate(p)
    E = p.ensemble_scores(X)
    order = np.argsort(-E, 1)
    p1 = E[np.arange(len(E)), order[:, 0]]
    t1 = order[:, 0] == y
    t5 = (order[:, :5] == y[:, None]).any(1)
    agree = p.matching_scores(X).argmax(1) == p.classifier_proba(X).argmax(1)

    edges = np.quantile(p1, np.linspace(0, 1, 6))
    b = np.clip(np.searchsorted(edges, p1, side="right") - 1, 0, 4)
    bins = [{
        "min": round(float(edges[i]), 4), "max": round(float(edges[i + 1]), 4), "level": LEVELS[i],
        "n": int((b == i).sum()), "top1": round(float(t1[b == i].mean()), 4), "top5": round(float(t5[b == i].mean()), 4),
    } for i in range(5)]
    out = {
        "note": "ผู้ใช้จำลอง (โปรไฟล์อาชีพ + noise/bias, ปัดเป็นคำตอบ 1–5) — ไม่ใช่คนจริง",
        "n_users": int(len(y)), "seed": SEED, "scenarios": [f"noise {sd}, bias {bb:+d}" for sd, bb in SCENARIOS],
        "overall": {"top1": round(float(t1.mean()), 4), "top5": round(float(t5.mean()), 4)},
        "bins": bins,
        "agreement": {  # ① Cosine กับ ②a MLP เลือกอันดับ 1 ตรงกันไหม
            "rate": round(float(agree.mean()), 4),
            "top1_if_agree": round(float(t1[agree].mean()), 4),
            "top1_if_disagree": round(float(t1[~agree].mean()), 4),
        },
    }
    path = a.models / "confidence_calibration.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"ผู้ใช้จำลอง {len(y):,} คน (ตอบ 1–5) · Top-1 {t1.mean():.1%} · Top-5 {t5.mean():.1%}")
    for x in bins:
        print(f"  คะแนนอันดับ 1 {x['min']:.3f}–{x['max']:.3f} [{x['level']:<6}] Top-1 {x['top1']:.1%}  Top-5 {x['top5']:.1%}")
    g = out["agreement"]
    print(f"  ①/②a เห็นตรงกัน {g['rate']:.1%} → Top-1 {g['top1_if_agree']:.1%} · ไม่ตรงกัน → {g['top1_if_disagree']:.1%}")
    print(f"→ {path}")


if __name__ == "__main__":
    main()
