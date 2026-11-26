"""
CareerPath AI — ประเมินโมเดลแบบหลายชั้น (ทำงานได้โดยไม่ต้องมีผู้ใช้จริง)

ชั้นที่ 1  Stress test (ผู้ใช้จำลอง)   — อยู่แล้วใน train_models.py / output/03_stress_test_by_scenario.csv
ชั้นที่ 2  Persona                     — personas.json: คำตอบเขียนด้วยมือ + อาชีพที่ยอมรับได้
ชั้นที่ 3  ความเสถียร                   — เปลี่ยนคำตอบเล็กน้อย Top 5 ต้องไม่พลิก; ปิด Gap แล้วทักษะครอบคลุมต้องไม่ลด
ชั้นที่ 4  ผู้ใช้จริง (ถ้ามี)              — datasets/real_users/labels.jsonl  ไม่มีไฟล์ = ข้าม
          ถ้ามี ≥ MIN_REAL_FOR_TUNING คน จะเสนอน้ำหนัก Ensemble ใหม่ (ไม่เปลี่ยนโมเดลให้อัตโนมัติ)

รัน:  python evaluation/evaluate.py            (จากโฟลเดอร์ datasets/ml)
ผล:   output/evaluation/report.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ML_DIR = HERE.parent
sys.path.insert(0, str(ML_DIR))
from predict import CareerPredictor  # noqa: E402

PERSONAS = HERE / "personas.json"
REAL_USERS = ML_DIR.parent / "real_users" / "labels.jsonl"
REPORT = ML_DIR / "output" / "evaluation" / "report.json"
MIN_REAL_FOR_TUNING = 30  # น้อยกว่านี้รายงานผลได้ แต่ไม่ควรใช้ปรับโมเดล


def to_vector(answers: dict) -> dict:
    """คำตอบ 1–5 → 0–100"""
    return {f: (a - 1) / 4 * 100 for f, a in answers.items()}


WS_DEFAULT = 3  # ข้อนิสัย (ws::) ที่ persona ไม่ได้ระบุ = กลาง ๆ


def persona_answers(p: CareerPredictor | list[str], persona: dict) -> dict:
    """คำตอบ 1–5 ของ persona ตาม feature ของโมเดล (feature ที่ persona ไม่มีใช้ค่าเริ่มต้น)"""
    feats = p if isinstance(p, list) else p.features
    a = {f: WS_DEFAULT if f.startswith("ws::") else persona.get("default", 2) for f in feats}
    a.update({f: v for f, v in persona["answers"].items() if f in a})
    return a


# ---------------- ชั้นที่ 2: persona ----------------
def broad(code: str) -> str:
    """SOC broad occupation = 6 ตัวแรก เช่น 29-1141.03 → 29-114 (พยาบาลทุกสาขาย่อย)"""
    return code[:6]


def eval_personas(p: CareerPredictor, personas: list[dict]) -> dict:
    """2 เกณฑ์: strict = ตรงรหัสใน expected · soc = อยู่ SOC broad occupation เดียวกับ expected (กฎตายตัว ไม่ได้เลือกตามผลโมเดล)"""
    rows = []
    for ps in personas:
        user = to_vector(persona_answers(p, ps))
        X, _ = p._vector(user)
        order = list(np.argsort(-p.ensemble_scores(X)[0]))
        codes = [p.codes[i] for i in order]
        exp, exp_b = set(ps["expected"]), {broad(c) for c in ps["expected"]}
        strict_rank = next(i + 1 for i, c in enumerate(codes) if c in exp)
        soc_rank = next(i + 1 for i, c in enumerate(codes) if broad(c) in exp_b)
        r = p.recommend(user, k=5)
        major_top = r["major_groups"][0]["major"]
        rows.append({
            "id": ps["id"],
            "name": ps["name"],
            "top5": [{"code": c["code"], "title": c["title"], "expected": c["code"] in exp, "same_family": broad(c["code"]) in exp_b} for c in r["careers"]],
            "rank_strict": strict_rank,  # อันดับของอาชีพที่คาดไว้ใน 910 อาชีพ
            "rank_soc": soc_rank,
            "major_top": major_top,
            "major_expected": ps.get("expected_major"),
            "major_ok": major_top == ps.get("expected_major"),
        })
        rows[-1]["group"] = ps.get("group", "it" if ps.get("expected_major") == "15" else "non_it")
    out = persona_summary(rows)
    out["by_group"] = {g: persona_summary([r for r in rows if r["group"] == g]) for g in ("it", "non_it")}
    out["rows"] = rows
    return out


def persona_summary(rows: list[dict]) -> dict:
    n = len(rows)
    if not n:
        return {"n": 0}
    rate = lambda key, k: sum(r[key] <= k for r in rows) / n  # noqa: E731
    return {
        "n": n,
        "strict": {"hit_at_1": rate("rank_strict", 1), "hit_at_5": rate("rank_strict", 5), "hit_at_10": rate("rank_strict", 10)},
        "soc": {"hit_at_1": rate("rank_soc", 1), "hit_at_5": rate("rank_soc", 5), "hit_at_10": rate("rank_soc", 10)},
        "median_rank_strict": float(np.median([r["rank_strict"] for r in rows])),
        "major_group_top1": sum(r["major_ok"] for r in rows) / n,
    }


# ---------------- ชั้นที่ 3: ความเสถียร ----------------
def eval_stability(p: CareerPredictor, personas: list[dict], trials: int = 30, n_changes: int = 2, seed: int = 0) -> dict:
    """เปลี่ยนคำตอบสุ่ม n_changes ข้อ ข้อละ ±1 แล้วดูว่า Top 5 เปลี่ยนแค่ไหน"""
    rng = np.random.default_rng(seed)
    overlaps, same_top1 = [], []
    for ps in personas:
        base = persona_answers(p, ps)
        top = [c["code"] for c in p.recommend(to_vector(base), k=5)["careers"]]
        for _ in range(trials):
            a = dict(base)
            for f in rng.choice(p.features, n_changes, replace=False):
                a[f] = int(np.clip(a[f] + rng.choice([-1, 1]), 1, 5))
            t = [c["code"] for c in p.recommend(to_vector(a), k=5)["careers"]]
            overlaps.append(len(set(t) & set(top)) / 5)
            same_top1.append(t[0] == top[0])
    return {
        "trials": len(overlaps),
        "changed_answers": n_changes,
        "top5_overlap_mean": float(np.mean(overlaps)),
        "top5_overlap_min": float(np.min(overlaps)),
        "top1_unchanged_rate": float(np.mean(same_top1)),
    }


def eval_monotonic(p: CareerPredictor, personas: list[dict]) -> dict:
    """ปิด Gap ของทักษะ Priority สูงสุดของอาชีพอันดับ 1 → ทักษะครอบคลุมของอาชีพนั้นต้องไม่ลด"""
    ok, total = 0, 0
    for ps in personas:
        user = to_vector(persona_answers(p, ps))
        top = p.recommend(user, k=1)["careers"][0]
        gap = p.skill_gap(user, top["code"], k=1)["top_priorities"]
        if not gap:
            continue
        improved = dict(user) | {gap[0]["feature"]: min(100.0, gap[0]["required"])}
        after = next((c for c in p.recommend(improved, k=910)["careers"] if c["code"] == top["code"]), None)
        total += 1
        ok += after is not None and after["skill_coverage_percent"] >= top["skill_coverage_percent"]
    return {"checked": total, "coverage_not_decreased_rate": ok / total if total else None}


# ---------------- ชั้นที่ 4: ผู้ใช้จริง (ถ้ามี) ----------------
# ---------------- Counterfactual (อาชีพที่ผู้ใช้อยากเป็น) ----------------
CF_TARGET_RANKS = (20, 100, 400)  # เป้าหมาย = อาชีพที่อยู่อันดับนี้ของ persona (ใกล้ / กลาง / ไกล) — กฎตายตัว


def eval_counterfactual(p: CareerPredictor, personas: list[dict], k: int = 5) -> dict:
    """ต่อ persona × เป้าหมาย 3 ระยะ: ถึง Top k ได้ไหม และต้องขยับคำตอบกี่ระดับ
    - skills: เพิ่มเฉพาะทักษะ · all: ขยับความชอบ/นิสัยได้ด้วย
    - verified: เอาคำตอบหลังเปลี่ยนไปเรียก recommend() จริง แล้วอันดับต้องตรงกับที่ counterfactual รายงาน"""
    rows = []
    for ps in personas:
        user = to_vector(persona_answers(p, ps))
        X, _ = p._vector(user)
        order = np.argsort(-p.ensemble_scores(X)[0])
        for dist in CF_TARGET_RANKS:
            code = p.codes[order[dist - 1]]
            for mode, steps in (("skills", 15), ("all", 25)):
                cf = p.counterfactual(user, code, k=k, max_steps=steps, mode=mode)
                u2 = dict(user)
                for ch in cf["changes"]:
                    u2[ch["feature"]] = ch["to"]
                X2, _ = p._vector(u2)
                e2 = p.ensemble_scores(X2)[0]
                real_rank = int((e2 > e2[p.code_idx[code]]).sum()) + 1
                rows.append({"persona": ps["id"], "start_rank": dist, "mode": mode, "reached": cf["reached"],
                             "levels": cf["levels"], "rank_after": cf["rank_after"], "verified": real_rank == cf["rank_after"]})
    out = {"k": k, "target_ranks": list(CF_TARGET_RANKS), "n": len(rows) // 2, "verified_rate": float(np.mean([r["verified"] for r in rows]))}
    for mode in ("skills", "all"):
        out[mode] = {}
        for dist in CF_TARGET_RANKS:
            rs = [r for r in rows if r["mode"] == mode and r["start_rank"] == dist]
            ok = [r["levels"] for r in rs if r["reached"]]
            out[mode][str(dist)] = {"reached_rate": float(np.mean([r["reached"] for r in rs])),
                                    "median_levels_if_reached": float(np.median(ok)) if ok else None,
                                    "median_rank_after": float(np.median([r["rank_after"] for r in rs]))}
    return out


def load_real_users(path: Path | None = None) -> list[dict]:
    path = Path(path or REAL_USERS)
    if not path.exists():
        return []
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [r for r in rows if r.get("consent") and r.get("code") and r.get("answers")]


def eval_real_users(p: CareerPredictor, rows: list[dict]) -> dict:
    rows = [r for r in rows if r["code"] in p.code_idx]
    if not rows:
        return {"available": False, "n": 0, "note": "ยังไม่มีข้อมูลผู้ใช้จริง — เก็บผ่านหน้าแบบประเมิน หรือใส่ไฟล์ datasets/real_users/labels.jsonl"}
    X = np.vstack([p._vector(to_vector(r["answers"]))[0] for r in rows])
    y = np.array([p.code_idx[r["code"]] for r in rows])
    Pm, Pc = p.matching_scores(X), p.classifier_proba(X)
    w0 = p.cfg["ensemble"]["w_matching"]

    def topk_acc(S, k):
        top = np.argsort(-S, axis=1)[:, :k]
        return float(np.mean([y[i] in top[i] for i in range(len(y))]))

    def scores(w):
        return w * Pm + (1 - w) * Pc

    out = {
        "available": True,
        "n": len(rows),
        "current_weight": w0,
        "top1": topk_acc(scores(w0), 1),
        "top5": topk_acc(scores(w0), 5),
        "major_group_top1": float(np.mean([str(p.grp_clf.predict(X[i:i + 1])[0]) == rows[i]["code"][:2] for i in range(len(rows))])),
        "by_model_top5": {"matching": topk_acc(Pm, 5), "classifier": topk_acc(Pc, 5)},
    }
    if len(rows) < MIN_REAL_FOR_TUNING:
        out["note"] = f"มี {len(rows)} คน — น้อยกว่า {MIN_REAL_FOR_TUNING} รายงานได้แต่ยังไม่ควรใช้ปรับโมเดล"
    else:
        grid = [{"w_matching": round(w, 2), "top5": topk_acc(scores(w), 5), "top1": topk_acc(scores(w), 1)} for w in np.arange(0, 1.0001, 0.05)]
        best = max(grid, key=lambda g: (g["top5"], g["top1"]))
        out["weight_grid"] = grid
        out["suggested_weight"] = best["w_matching"]
        out["note"] = "น้ำหนักที่เสนอยังไม่ถูกนำไปใช้ — ถ้าจะใช้ แก้ ensemble.w_matching ใน model_config.json (ควรแบ่ง validation/test ก่อน)"
    return out


def build_report(p: CareerPredictor, real_users_path: Path | None = None) -> dict:
    personas = json.loads(PERSONAS.read_text(encoding="utf-8"))["personas"]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "personas": eval_personas(p, personas),
        "stability": eval_stability(p, personas),
        "monotonic": eval_monotonic(p, personas),
        "counterfactual": eval_counterfactual(p, personas),
        "real_users": eval_real_users(p, load_real_users(real_users_path)),
    }


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", type=Path, default=ML_DIR / "output" / "general" / "models", help="โฟลเดอร์โมเดลที่จะประเมิน")
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()
    REPORT = args.report or args.models.parent / "evaluation" / "report.json"
    pred = CareerPredictor(args.models)
    print(f"โมเดล: {args.models} ({pred.cfg.get('feature_set')}, {len(pred.features)} ข้อ)")
    rep = build_report(pred)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")

    ps = rep["personas"]
    for k in ("strict", "soc"):
        h = ps[k]
        print(f"Persona {k:<6} ({ps['n']} แบบ): hit@1 {h['hit_at_1']:.0%} · hit@5 {h['hit_at_5']:.0%} · hit@10 {h['hit_at_10']:.0%}")
    print(f"  อันดับกลาง (strict) {ps['median_rank_strict']:.0f} · ②b กลุ่มอาชีพถูก {ps['major_group_top1']:.0%}")
    for g, h in ps["by_group"].items():
        print(f"  {g:<7} ({h['n']} แบบ): soc hit@5 {h['soc']['hit_at_5']:.0%} · strict hit@5 {h['strict']['hit_at_5']:.0%} · อันดับกลาง {h['median_rank_strict']:.0f}")
    for r in ps["rows"]:
        print(f"  {'✓' if r['rank_soc'] <= 5 else '✗'} {r['id']:<16} strict #{r['rank_strict']:<4} soc #{r['rank_soc']:<4} top1={r['top5'][0]['title']}")
    s = rep["stability"]
    print(f"ความเสถียร (เปลี่ยน {s['changed_answers']} ข้อ × {s['trials']} ครั้ง): Top5 ซ้ำเฉลี่ย {s['top5_overlap_mean']:.0%} (ต่ำสุด {s['top5_overlap_min']:.0%}) · อันดับ 1 คงเดิม {s['top1_unchanged_rate']:.0%}")
    m = rep["monotonic"]
    print(f"ปิด Gap แล้วทักษะครอบคลุมไม่ลด: {m['coverage_not_decreased_rate']:.0%} ({m['checked']} กรณี)")
    cf = rep["counterfactual"]
    print(f"Counterfactual (เป้าหมาย = อาชีพอันดับ {cf['target_ranks']} ของ persona → Top {cf['k']}) · ตรวจกับ recommend() ตรง {cf['verified_rate']:.0%}")
    for mode, label in (("skills", "เพิ่มทักษะอย่างเดียว"), ("all", "ขยับความชอบ/นิสัยได้ด้วย")):
        print(f"  {label}: " + " · ".join(f"อันดับ {d}: ถึง {v['reached_rate']:.0%} (ใช้ {v['median_levels_if_reached']} ระดับ, อันดับกลางหลังเปลี่ยน {v['median_rank_after']:.0f})" for d, v in cf[mode].items()))
    ru = rep["real_users"]
    print("ผู้ใช้จริง:", f"n={ru['n']} top1 {ru['top1']:.0%} top5 {ru['top5']:.0%}" if ru["available"] else "", ru.get("note", ""))
    print("→", REPORT)
