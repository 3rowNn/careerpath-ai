"""
CareerPath AI — เรียกใช้โมเดลที่เทรนแล้ว (สำหรับ backend เช่น FastAPI)

ตัวอย่าง:
    from predict import CareerPredictor
    cp = CareerPredictor("output/models")
    result = cp.recommend(user_vector)                      # dict: feature → คะแนน 0–100
    gap = cp.skill_gap(user_vector, "15-2051.00")           # Skill Gap + Skill Priority ของอาชีพเป้าหมาย

รันไฟล์นี้ตรง ๆ จะทดสอบกับผู้ใช้ตัวอย่าง:
    python predict.py
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


class CareerPredictor:
    def __init__(self, model_dir="output/models", meta_csv=None):
        d = Path(model_dir).resolve()
        self.cfg = json.loads((d / "model_config.json").read_text())
        self.features = self.cfg["feature_order"]
        self.codes = np.asarray(self.cfg["class_order"], dtype=object)
        self.code_idx = {c: i for i, c in enumerate(self.codes)}
        ref = pd.read_csv(d / "reference_vectors.csv", index_col=0)
        self.R = ref.loc[self.codes, self.features].to_numpy(float)
        self.occ_clf = joblib.load(d / "occupation_classifier.joblib")
        self.grp_clf = joblib.load(d / "major_group_classifier.joblib")
        self.clu = joblib.load(d / "clustering.joblib")
        self.importance = pd.read_csv(d / "onet_importance.csv", index_col=0).reindex(columns=self.features)
        # distinctiveness: อาชีพนี้ต้องการทักษะนี้สูงกว่าค่าเฉลี่ยทุกอาชีพกี่ SD
        self.ref_mean, self.ref_std = self.R.mean(0), self.R.std(0) + 1e-9
        # Skill Gap / ทักษะครอบคลุม นับเฉพาะ "ทักษะ" (Abilities, Knowledge, Skills หรือกลุ่มทักษะ grp:: ในฉบับสั้น)
        # ไม่นับความสนใจ (ri::), เครื่องมือที่อยากใช้ (tech::) และความชอบ (task::) เพราะไม่ใช่สิ่งที่ "ขาด"
        self.skill_mask = np.array([f.split("::")[0] in ("ab", "kn", "sk", "grp") for f in self.features])
        # ชื่อกลุ่มทักษะภาษาไทย (แบบประเมินฉบับสั้น)
        sg = next((f for f in (d / "skill_groups.csv", d.parent / "short" / "skill_groups.csv") if f.exists()), None)
        self.name_th = pd.read_csv(sg).set_index("feature")["name_th"].to_dict() if sg else {}
        # เครื่องมือที่อาชีพใช้ (O*NET Software Skills) → Roadmap — รอบ 4 ไม่ได้ถามเรื่องเครื่องมือ จึงอ่านจากไฟล์แยก
        tools_csv = d / "tools_reference.csv"
        if tools_csv.exists():
            self.tools = pd.read_csv(tools_csv, index_col=0).reindex(self.codes)
        else:
            tech = [f for f in self.features if f.startswith("tech::")]
            self.tools = ref.loc[self.codes, tech]
        m = self.cfg["matching"]
        self.mu, self.sd = np.asarray(m["train_mean"]), np.asarray(m["train_std"])
        self.centered = "centered" in m["method"]
        self.Rn = self._l2((self.R - self.mu) / self.sd) if self.centered else self._l2(self.R)
        if meta_csv is None:
            meta_csv = next((f for f in [d / "occupation_meta.csv"] + [q / "data_gate_output" / "occupation_meta.csv" for q in d.parents]
                             if f.exists()), d / "occupation_meta.csv")
        meta_csv = Path(meta_csv)
        self.meta = pd.read_csv(meta_csv, index_col=0, dtype={"major": str}) if meta_csv.exists() else None
        # ความมั่นใจ: ตาราง calibrate จากผู้ใช้จำลอง (calibrate_confidence.py) — ไม่มีไฟล์ = ไม่รายงานความมั่นใจ
        # สาขาที่จบ → อาชีพที่เกี่ยวข้อง (major_crosswalk.py จาก CIP–SOC ของ NCES) — ไม่มีไฟล์ = ไม่มีฟีเจอร์นี้
        mj = d / "major_occupations.json"
        self.majors = {m["id"]: m for m in json.loads(mj.read_text())["majors"]} if mj.exists() else {}
        cal = d / "confidence_calibration.json"
        self.calibration = json.loads(cal.read_text()) if cal.exists() else None

    # ---------- helpers ----------
    @staticmethod
    def _l2(A):
        return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)

    def _vector(self, user):
        """user: dict {feature: 0–100} หรือ list ตามลำดับ feature_order (ดู model_config.json) — feature ที่ไม่ได้ตอบใช้ค่ากลาง 50"""
        if isinstance(user, dict):
            missing = [f for f in self.features if f not in user]
            v = np.array([float(user.get(f, 50.0)) for f in self.features])
        else:
            v, missing = np.asarray(user, float), []
        return np.clip(v, 0, 100)[None, :], missing

    def _title(self, code):
        return self.meta.loc[code, "Title"] if self.meta is not None and code in self.meta.index else code

    # ---------- models ----------
    def matching_scores(self, X):                                   # ①
        Q = self._l2((X - self.mu) / self.sd) if self.centered else self._l2(X)
        return Q @ self.Rn.T

    def classifier_proba(self, X):                                  # ②a
        P = self.occ_clf.predict_proba(X)
        out = np.zeros((len(X), len(self.codes)))
        out[:, [self.code_idx[c] for c in self.occ_clf.classes_]] = P
        return out

    def ensemble_scores(self, X):                                   # ① + ②a
        e = self.cfg["ensemble"]
        S = self.matching_scores(X)
        Z = (S - S.max(1, keepdims=True)) / e["softmax_T"]
        Pm = np.exp(Z); Pm /= Pm.sum(1, keepdims=True)
        return e["w_matching"] * Pm + (1 - e["w_matching"]) * self.classifier_proba(X)

    # ---------- public API ----------
    def recommend(self, user, k=5):
        X, missing = self._vector(user)
        ens = self.ensemble_scores(X)[0]
        match = self.matching_scores(X)[0]
        clf = self.classifier_proba(X)[0]
        top = np.argsort(-ens)[:k]                                     # จัดอันดับด้วย Ensemble
        gp = self.grp_clf.predict_proba(X)[0]
        g_top = np.argsort(-gp)[:3]
        # ทักษะครอบคลุม %: ผลรวม min(ผู้ใช้, ที่ต้องการ) ÷ ผลรวมที่ต้องการ — ตัวเลขที่แสดงบนเว็บ อ่านเข้าใจง่าย
        cover = self._coverage(X[0])
        return {
            "careers": [self._career_row(i, n + 1, cover, ens, match, clf) for n, i in enumerate(top)],
            "major_groups": [{"major": str(self.grp_clf.classes_[j]),      # ②b
                              "probability": round(float(gp[j]), 4)} for j in g_top],
            "missing_features": missing,
            "confidence": self._confidence(float(ens[top[0]]), bool(match.argmax() == clf.argmax())),
        }

    def _coverage(self, x):
        """ทักษะครอบคลุม % ของทุกอาชีพ: ผลรวม min(ผู้ใช้, ที่ต้องการ) ÷ ผลรวมที่ต้องการ (เฉพาะทักษะ)"""
        m = self.skill_mask
        return np.minimum(x[m], self.R[:, m]).sum(1) / self.R[:, m].sum(1).clip(1e-9) * 100

    def _career_row(self, i, rank, cover, ens, match, clf):
        return {
            "rank": int(rank), "code": self.codes[i], "title": self._title(self.codes[i]),
            "skill_coverage_percent": round(float(cover[i]), 1),
            "ensemble_score": round(float(ens[i]), 5),
            "matching_similarity": round(float(match[i]), 4),          # ①
            "classifier_probability": round(float(clf[i]), 4),         # ②a
            "cluster": int(self.clu["labels"][self.codes[i]]),         # ③
        }

    # ---------- อาชีพที่ผู้ใช้อยากเป็น ----------
    def _rank_and_margin(self, X, t, k):
        """อันดับของอาชีพ t (1 = ดีสุด) และ margin = log E_t − log(คะแนนอันดับ k ของอาชีพอื่น) ต่อแถวของ X"""
        E = np.clip(self.ensemble_scores(X), 1e-300, None)
        rank = (E > E[:, [t]]).sum(1) + 1
        others = np.delete(E, t, axis=1)
        kth = np.sort(others, axis=1)[:, -k]
        return rank, np.log(E[:, t]) - np.log(kth)

    def counterfactual(self, user, code, k=5, max_steps=15, mode="skills"):
        """Counterfactual explanation: เพิ่มทักษะ "น้อยที่สุด" แค่ไหน อาชีพเป้าหมายจึงขึ้นมาอยู่ใน Top k ของโมเดล
        - เปลี่ยนได้เฉพาะกลุ่มทักษะ (grp::) และเพิ่มขึ้นเท่านั้น ทีละ 1 ระดับคำตอบ (+25) — ทักษะพัฒนาได้
          ส่วนความสนใจ / ลักษณะงานที่ชอบ / นิสัย ไม่ใช่สิ่งที่ควรถูกบอกให้ "เปลี่ยน" จึงไม่แตะ
        - mode="all": ให้ขยับคำตอบด้านอื่นเข้าหาโปรไฟล์อาชีพได้ด้วย (ทีละ 1 ระดับ) — ใช้ตอบว่า
          "ถ้าคุณชอบงานแบบนี้จริง จะเข้าใกล้แค่ไหน" ไม่ใช่คำแนะนำให้ฝืนเปลี่ยนความชอบ
        - เลือกเฉพาะทักษะที่อาชีพเป้าหมายต้องการสูงกว่าระดับปัจจุบัน
        - greedy: แต่ละรอบลองเพิ่มทุกทักษะที่เป็นไปได้ แล้วเลือกตัวที่ทำให้ margin ดีขึ้นมากที่สุด
          (margin = log คะแนน Ensemble ของเป้าหมาย − log คะแนนอันดับ k) — หยุดเมื่อเข้า Top k, ไม่มีตัวไหนช่วย หรือครบ max_steps
        - ทุกอันดับคำนวณด้วย Ensemble ตัวเดียวกับที่ใช้แนะนำ (ไม่ใช่สูตรแยก)"""
        X, _ = self._vector(user)
        x = X[0].copy()
        t = self.code_idx[code]
        req = self.R[t]
        skill = [j for j, f in enumerate(self.features) if f.startswith("grp::")]
        other = [j for j in range(len(self.features)) if j not in skill]
        rank0, m0 = self._rank_and_margin(x[None], t, k)
        rank, margin, steps = int(rank0[0]), float(m0[0]), []
        while rank > k and len(steps) < max_steps:
            cand = [j for j in skill if x[j] < 100 and req[j] > x[j]]
            if mode == "all":
                cand += [j for j in other if abs(req[j] - x[j]) >= 12.5]
            if not cand:
                break
            Xc = np.repeat(x[None], len(cand), axis=0)
            for r, j in enumerate(cand):
                Xc[r, j] = float(np.clip(x[j] + (25 if req[j] > x[j] else -25), 0, 100))
            rk, mg = self._rank_and_margin(Xc, t, k)
            b = int(np.argmax(mg))
            if mg[b] <= margin + 1e-9:
                break                                   # เพิ่มทักษะไหนก็ไม่ช่วยแล้ว
            j = cand[b]
            steps.append({"feature": self.features[j], "name": self.name_th.get(self.features[j], self.features[j].split("::")[1]),
                          "from": round(float(x[j]), 1), "to": round(float(Xc[b, j]), 1), "rank_after": int(rk[b])})
            x, rank, margin = Xc[b], int(rk[b]), float(mg[b])
        # รวมเป็นรายทักษะ: จากระดับเดิม → ระดับใหม่
        changes = {}
        for st in steps:
            c = changes.setdefault(st["feature"], {"feature": st["feature"], "name": st["name"], "from": st["from"],
                                                  "required": round(float(req[self.features.index(st["feature"])]), 1)})
            c["to"] = st["to"]
        # สิ่งที่ "ไม่ใช่ทักษะ" แต่ต่างจากอาชีพนี้มาก — ไม่เสนอให้เปลี่ยน แต่บอกให้ผู้ใช้รู้
        blocking = sorted(({"feature": f, "name": self.name_th.get(f, f.split("::")[1]), "domain": f.split("::")[0],
                            "user": round(float(X[0][j]), 1), "required": round(float(req[j]), 1)}
                           for j, f in enumerate(self.features)
                           if not f.startswith("grp::") and req[j] >= 50 and req[j] - X[0][j] >= 25),
                          key=lambda r: X[0][self.features.index(r["feature"])] - r["required"])[:5]
        return {
            "code": code, "k": k, "mode": mode, "rank_before": int(rank0[0]), "rank_after": rank, "reached": rank <= k,
            "already": int(rank0[0]) <= k, "levels": len(steps), "max_steps": max_steps,
            "steps": steps, "changes": list(changes.values()), "blocking": blocking,
        }

    def target(self, user, code, k=5):
        """อาชีพที่ผู้ใช้อยากเป็น (เลือกจาก 910 อาชีพ): อันดับตาม Ensemble + เหตุผล + counterfactual"""
        X, _ = self._vector(user)
        ens, match, clf = self.ensemble_scores(X)[0], self.matching_scores(X)[0], self.classifier_proba(X)[0]
        i = self.code_idx[code]
        rank = int((ens > ens[i]).sum()) + 1
        return {
            "career": self._career_row(i, rank, self._coverage(X[0]), ens, match, clf),
            "total": len(self.codes),
            "explain": self.explain(user, code, k=5),
            "counterfactual": self.counterfactual(user, code, k=k),                     # เพิ่มทักษะอย่างเดียว
            "counterfactual_all": self.counterfactual(user, code, k=k, max_steps=25, mode="all"),  # ถ้าความชอบตรงด้วย
        }

    def major_view(self, user, major_id, k=10):
        """อาชีพที่สาขานี้เกี่ยวข้อง (ตาราง CIP–SOC) เรียงตามความเข้ากับผู้ใช้ด้วย Ensemble
        ตารางบอกแค่ "เกี่ยวข้อง" — ML เป็นตัวจัดอันดับว่าในสายที่เรียน อาชีพไหนตรงกับตัวผู้ใช้ที่สุด"""
        m = self.majors[major_id]
        X, _ = self._vector(user)
        ens, match, clf = self.ensemble_scores(X)[0], self.matching_scores(X)[0], self.classifier_proba(X)[0]
        rank = (-ens).argsort().argsort() + 1                      # อันดับใน 910 ของทุกอาชีพ
        cover = self._coverage(X[0])
        idx = sorted((self.code_idx[c] for c in m["codes"]), key=lambda i: rank[i])
        top5 = set(np.argsort(-ens)[:5])
        return {
            "id": m["id"], "faculty": m["faculty"], "major_th": m["major_th"], "cip_titles": m["cip_titles"],
            "n_linked": len(idx), "total": len(self.codes),
            "careers": [self._career_row(i, rank[i], cover, ens, match, clf) for i in idx[:k]],
            "in_top5": [self.codes[i] for i in idx if i in top5],
            "best_rank": int(rank[idx[0]]) if idx else None,
        }

    def _confidence(self, top1_score, models_agree):
        """คะแนน Ensemble ของอันดับ 1 → ช่วงในตาราง calibrate → ในผู้ใช้จำลองช่วงนี้อันดับ 1 / Top 5 ถูกกี่ %"""
        c = self.calibration
        if c is None:
            return None
        i = next((n for n, b in enumerate(c["bins"]) if top1_score <= b["max"]), len(c["bins"]) - 1)
        b, g = c["bins"][i], c["agreement"]
        return {
            "level": b["level"], "bin": i, "n_bins": len(c["bins"]), "top1_score": round(top1_score, 4),
            "sim_top1_accuracy": b["top1"], "sim_top5_accuracy": b["top5"],
            "models_agree": models_agree,
            "sim_top1_if_agreement": g["top1_if_agree"] if models_agree else g["top1_if_disagree"],
            "n_simulated": c["n_users"],
        }

    def explain(self, user, code, k=5):
        """① แยกคะแนน Cosine ออกเป็นรายคำถาม — ทำไมอาชีพนี้ได้คะแนนสูงกว่าอาชีพทั่วไป
        cos(x, r) = Σ x̂ⱼ r̂ⱼ  (x̂, r̂ = เวกเตอร์ปรับความยาวเป็น 1)
        contribution ⱼ = x̂ⱼ (r̂ⱼ − r̄ⱼ)  เมื่อ r̄ = ค่าเฉลี่ยของ r̂ ทั้ง 910 อาชีพ
        → Σ contribution = cos(ผู้ใช้, อาชีพนี้) − cos เฉลี่ยกับทุกอาชีพ (แยกได้พอดี ไม่ใช่การประมาณ)
        บวก = อาชีพนี้ใช้ข้อนี้มากกว่าอาชีพทั่วไป (ยิ่งผู้ใช้ตอบสูงยิ่งมาก) · ลบ = ผู้ใช้ตอบไว้ แต่อาชีพนี้ใช้น้อยกว่าอาชีพทั่วไป
        อธิบายเฉพาะ ① (น้ำหนัก 0.9 ใน Ensemble) — ②a MLP อธิบายแบบนี้ไม่ได้"""
        if self.centered:
            raise NotImplementedError("explain รองรับเฉพาะ cosine แบบไม่ centered (รอบ 4)")
        X, _ = self._vector(user)
        x = self._l2(X)[0]
        i = self.code_idx[code]
        contrib = x * (self.Rn[i] - self.Rn.mean(0))
        sims = self.Rn @ x
        total_abs = float(np.abs(contrib).sum()) or 1.0
        rows = [{"feature": f, "name": self.name_th.get(f, f.split("::")[1]), "domain": f.split("::")[0],
                 "user": round(float(X[0][j]), 1), "required": round(float(self.R[i, j]), 1),
                 "contribution": round(float(contrib[j]), 5), "share": round(float(contrib[j]) / total_abs, 4)}
                for j, f in enumerate(self.features)]
        by_domain = {}
        for r in rows:
            by_domain[r["domain"]] = by_domain.get(r["domain"], 0.0) + r["contribution"]
        pos = sorted((r for r in rows if r["contribution"] > 0), key=lambda r: -r["contribution"])[:k]
        neg = sorted((r for r in rows if r["contribution"] < 0), key=lambda r: r["contribution"])[:k]
        return {
            "code": code, "title": self._title(code),
            "similarity": round(float(sims[i]), 4), "mean_similarity": round(float(sims.mean()), 4),
            "rank_matching": int((sims > sims[i]).sum()) + 1,
            "positive": pos, "negative": neg,
            "by_domain": {d: round(v, 5) for d, v in sorted(by_domain.items(), key=lambda kv: -kv[1])},
        }

    def similar_careers(self, code, k=5):
        """อาชีพในกลุ่มเดียวกัน (③) เรียงตามความคล้าย"""
        labels = self.clu["labels"]
        same = [c for c in self.codes if labels[c] == labels[code] and c != code]
        i = self.code_idx[code]
        sims = {c: float(self.Rn[self.code_idx[c]] @ self.Rn[i]) for c in same}
        return [{"code": c, "title": self._title(c), "similarity": round(s, 4)}
                for c, s in sorted(sims.items(), key=lambda kv: -kv[1])[:k]]

    def skill_gap(self, user, code, k=10):
        """Skill Gap + Skill Priority ของอาชีพเป้าหมาย
        priority = gap × (1 + 0.5·O*NET importance + 0.5·distinctiveness)  — ค่าทั้งสองปรับเป็น 0–1"""
        X, _ = self._vector(user)
        i = self.code_idx[code]
        req, usr = self.R[i], X[0]
        gap = np.clip(req - usr, 0, None)
        w = self.cfg["skill_priority_weights"]
        imp = self.importance.loc[code].fillna(0).to_numpy() / 100 if code in self.importance.index else np.zeros_like(req)
        z = np.clip((req - self.ref_mean) / self.ref_std, 0, 3) / 3
        prio = w["gap"] * gap / 100 * (1 + w["onet_importance"] * imp + w["distinctiveness"] * z)
        rows = [{"feature": f, "name": self.name_th.get(f, f.split("::")[1]), "domain": f.split("::")[0],
                 "user": round(float(usr[j]), 1), "required": round(float(req[j]), 1),
                 "gap": round(float(gap[j]), 1), "priority": round(float(prio[j]), 4)}
                for j, f in enumerate(self.features) if self.skill_mask[j]]
        rows.sort(key=lambda r: -r["priority"])
        met = sum(r["gap"] == 0 for r in rows)
        trow = self.tools.loc[code]
        tools = [f.split("::")[1] for f, v in trow.items() if v >= 50]                    # เครื่องมือที่อาชีพนี้ใช้ → Roadmap
        return {"code": code, "title": self._title(code), "skills_met": met, "skills_total": len(rows),
                "top_priorities": [r for r in rows if r["gap"] > 0][:k], "tools_used": tools, "all": rows}


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    cp = CareerPredictor(here / "output" / "general" / "models")

    # ผู้ใช้ตัวอย่าง: โปรไฟล์ของ Data Scientists + noise (จำลองคนที่ตอบไม่แม่น 100%)
    rng = np.random.default_rng(7)
    ds = cp.R[cp.code_idx["15-2051.00"]]
    user = dict(zip(cp.features, np.clip(ds + rng.normal(0, 15, ds.shape), 0, 100)))

    res = cp.recommend(user)
    print("Top 5 อาชีพ (Ensemble)")
    for r in res["careers"]:
        print(f"  #{r['rank']}  ครอบคลุม {r['skill_coverage_percent']:5.1f}%  {r['title']:<48} "
              f"①={r['matching_similarity']:.3f}  ②a={r['classifier_probability']:.3f}  ③ cluster {r['cluster']}")
    print("กลุ่มอาชีพ (②b):", res["major_groups"])
    print("\nอาชีพใกล้เคียง Data Scientists (③):")
    for r in cp.similar_careers("15-2051.00"):
        print(f"  {r['similarity']:.3f}  {r['title']}")
    g = cp.skill_gap(user, "15-2051.00", k=5)
    print(f"\nSkill Gap — {g['title']}: ถึงเกณฑ์ {g['skills_met']}/{g['skills_total']}")
    for r in g["top_priorities"]:
        print(f"  priority {r['priority']:.3f}  {r['name']:<35} user {r['user']:5.1f} → required {r['required']:5.1f} (gap {r['gap']})")
    print("เครื่องมือที่อาชีพนี้ใช้:", ", ".join(g["tools_used"]) or "-")
