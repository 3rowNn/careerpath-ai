"""
CareerPath AI — ทำแบบประเมินให้สั้นลง
=====================================

ปัญหา: ชุด D มี 136 features ถ้าถามทีละข้อ แบบประเมินยาวเกินใช้จริง
แนวทาง: 95 ทักษะ (Abilities 52 + Knowledge 33 + Essential Skills 10) หลายตัวขึ้นลงพร้อมกันข้ามอาชีพ
        เช่น อาชีพที่ต้องใช้ Mathematics สูง มักต้องใช้ Mathematical Reasoning และ Number Facility สูงด้วย
        → จัดกลุ่มทักษะที่ correlation สูง แล้วถาม 1 ข้อต่อ 1 กลุ่ม
        คะแนนกลุ่มของอาชีพ = ค่าเฉลี่ยของทักษะในกลุ่ม (0–100)

จัดกลุ่มด้วย hierarchical clustering (average linkage, ระยะ = 1 − correlation ข้าม 910 อาชีพ)
แล้วทดลองหลายจำนวนกลุ่ม วัดผลด้วย ① Matching บน stress test เทียบกับชุด D เต็ม (95 ทักษะถามทีละข้อ)

วิธีรัน (จาก datasets/ml, หลัง task_preferences.py):  python short_assessment.py
"""

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

SEED = 42
HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data_gate_output"
OUT = HERE / "output" / "short"
OUT.mkdir(parents=True, exist_ok=True)

features = pd.read_csv(DATA / "occupation_features.csv", index_col=0)
meta = pd.read_csv(DATA / "occupation_meta.csv", index_col=0, dtype={"major": str})
task = pd.read_csv(HERE / "output" / "it_focus" / "occupation_task_preferences.csv", index_col=0)
features = features.join(task)
CODES = np.asarray(features.index, dtype=object)
IS_IT = np.array([c.startswith("15-") for c in CODES])

SKILL = [c for c in features.columns if c.split("::")[0] in ("ab", "kn", "sk")]      # 95
RI = [c for c in features.columns if c.startswith("ri::")]                            # 6
TECH = [c for c in features.columns if c.startswith("tech::")]                        # 23
TASK = [c for c in features.columns if c.startswith("task::")]                        # 12
OTHER = RI + TECH + TASK                                                              # 41 ข้อที่ถามตรงอยู่แล้ว

# ---------------------------------------------------------------------
# 1. จัดกลุ่ม 95 ทักษะ — เทียบ 2 วิธี
# ---------------------------------------------------------------------
# average: ระยะ = 1 − correlation ข้ามอาชีพ (ได้กลุ่มยักษ์ + กลุ่มเดี่ยวเยอะ ถามยาก)
# ward:    ทักษะแต่ละตัวเป็นจุดหนึ่ง (โปรไฟล์ 910 อาชีพ, z-score) → กลุ่มขนาดใกล้กัน เขียนคำถามง่าย
corr = features[SKILL].corr().to_numpy()
dist = np.clip(1 - corr, 0, 2)
np.fill_diagonal(dist, 0)
Xf = features[SKILL].T.to_numpy(float)
Xf = (Xf - Xf.mean(1, keepdims=True)) / (Xf.std(1, keepdims=True) + 1e-9)
LINKS = {"average": linkage(squareform(dist, checks=False), method="average"),
         "ward": linkage(Xf, method="ward")}


def groups_for(k, method="ward"):
    lab = fcluster(LINKS[method], t=k, criterion="maxclust")
    g = pd.Series(lab, index=SKILL)
    return {int(i): list(g[g == i].index) for i in sorted(g.unique())}


def group_scores(groups):
    return pd.DataFrame({f"grp::{i:02d}": features[m].mean(axis=1) for i, m in groups.items()}, index=features.index)


# ---------------------------------------------------------------------
# 2. ประเมินด้วย ① Matching บน stress test (วิธีเดียวกับ task_preferences.py)
# ---------------------------------------------------------------------
SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]


def l2(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)


def evaluate(F, seeds=(7001, 7002, 7003)):
    """F: DataFrame อาชีพ × คำถาม — ผู้ใช้จำลองตอบแต่ละคำถามคลาดด้วย noise/bias"""
    R = F.loc[CODES].to_numpy(float)
    Rn = l2(R)
    out = {"it_top1": [], "it_top5": [], "all_top1": [], "all_top5": []}
    for k, (sd, b) in enumerate(SCENARIOS):
        for s in seeds:
            r = np.random.default_rng(s * 100 + k)
            U = np.clip(R + b + r.normal(0, sd, R.shape), 0, 100)
            top = np.argsort(-(l2(U) @ Rn.T), axis=1)[:, :5]
            truth = np.arange(len(CODES))
            h1, h5 = top[:, 0] == truth, (top == truth[:, None]).any(axis=1)
            out["it_top1"].append(h1[IS_IT].mean()); out["it_top5"].append(h5[IS_IT].mean())
            out["all_top1"].append(h1.mean()); out["all_top5"].append(h5.mean())
    return {m: float(np.mean(v)) for m, v in out.items()}


rows = []
KS = [6, 8, 10, 12, 15, 18, 20, 25, 30, 40, 60]
full = evaluate(features[SKILL + OTHER])                   # ชุด D เต็ม: ถามทุกทักษะทีละข้อ
rows.append({"method": "full (ชุด D)", "skill_questions": 95, "total_questions": 95 + len(OTHER),
             "largest_group": 1, **full})
for method in ("average", "ward"):
    for k in KS:
        g = groups_for(k, method)
        ev = evaluate(group_scores(g).join(features[OTHER]))
        rows.append({"method": method, "skill_questions": len(g), "total_questions": len(g) + len(OTHER),
                     "largest_group": max(len(m) for m in g.values()), **ev})
        print(f"{method:8s} k={len(g):3d}  คำถามรวม {len(g) + len(OTHER):3d}  กลุ่มใหญ่สุด {rows[-1]['largest_group']:2d}  "
              f"all Top-5 {ev['all_top5']:.3f}  IT Top-1 {ev['it_top1']:.3f}", flush=True)
curve = pd.DataFrame(rows)
curve.round(4).to_csv(OUT / "12_questions_vs_accuracy.csv", index=False)
print("full D:", {k: round(v, 3) for k, v in full.items()})

# ---------------------------------------------------------------------
# 3. แบบประเมินฉบับสั้นที่เลือก: Ward 30 กลุ่ม → คำถามรวม 71 ข้อ
# ---------------------------------------------------------------------
# เหตุผล: ทุกอาชีพ Top-5 ใกล้กับรอบที่ 1 (101 ข้อ) แต่ใช้คำถามน้อยกว่า และสาย IT ยังแยกได้ ~98%
# กลุ่มใหญ่สุด 10 ทักษะ จึงเขียนเป็นคำถามเดียวที่ผู้ใช้เข้าใจได้
CHOSEN_K = 30

# คำถามผูกกับ "ทักษะหลัก" (anchor) ของแต่ละกลุ่ม — ถ้าข้อมูลเปลี่ยนแล้วกลุ่มเปลี่ยน สคริปต์จะหยุดแทนการจับคู่ผิด
SKILL_QUESTIONS = {
    "ab::Mathematical Reasoning": ("numbers", "ตัวเลขและคณิตศาสตร์", "คำนวณ ใช้ตัวเลข และแก้โจทย์คณิตศาสตร์ได้ดีแค่ไหน"),
    "ab::Deductive Reasoning": ("reasoning", "การคิดวิเคราะห์", "คิดวิเคราะห์ ใช้เหตุผล แก้ปัญหา และเรียนรู้สิ่งใหม่ได้ดีแค่ไหน"),
    "ab::Near Vision": ("near_vision", "การมองรายละเอียดระยะใกล้", "มองรายละเอียดเล็ก ๆ ในระยะใกล้ได้ดีแค่ไหน เช่น อ่านตัวหนังสือเล็ก ตรวจชิ้นงาน"),
    "kn::Education and Training": ("teaching", "การสอนและติดตามงาน", "สอนหรือถ่ายทอดความรู้ จดจำข้อมูล และติดตามความคืบหน้าของงานได้ดีแค่ไหน"),
    "ab::Oral Expression": ("communication", "การสื่อสาร", "ฟัง พูด อ่าน และเขียน เพื่อสื่อสารให้คนอื่นเข้าใจได้ดีแค่ไหน"),
    "kn::Administration and Management": ("management", "การบริหารจัดการ", "มีความรู้ด้านการบริหารองค์กรและบริหารคนแค่ไหน"),
    "kn::Economics and Accounting": ("business", "ธุรกิจ บัญชี และการตลาด", "มีความรู้ด้านเศรษฐศาสตร์ บัญชี การขาย และการตลาดแค่ไหน"),
    "kn::Computers and Electronics": ("computers", "คอมพิวเตอร์และอิเล็กทรอนิกส์", "มีความรู้ด้านคอมพิวเตอร์ อิเล็กทรอนิกส์ และระบบสื่อสารแค่ไหน"),
    "kn::Customer and Personal Service": ("admin_service", "งานธุรการและบริการลูกค้า", "มีความรู้ด้านงานเอกสาร ธุรการ และการบริการลูกค้าแค่ไหน"),
    "kn::Communications and Media": ("media_language", "สื่อและภาษา", "มีความรู้ด้านการผลิตสื่อ สื่อสารมวลชน และหลักภาษาแค่ไหน"),
    "kn::Law and Government": ("law", "กฎหมายและหน่วยงานรัฐ", "มีความรู้ด้านกฎหมาย ระเบียบ และหน่วยงานรัฐแค่ไหน"),
    "kn::Psychology": ("people_society", "จิตวิทยาและสังคม", "มีความรู้ด้านจิตวิทยา สังคม ปรัชญา หรือการให้คำปรึกษาแค่ไหน"),
    "kn::Foreign Language": ("foreign_language", "ภาษาต่างประเทศ", "ใช้ภาษาต่างประเทศได้ดีแค่ไหน"),
    "kn::Geography": ("geo_history", "ภูมิศาสตร์และประวัติศาสตร์", "มีความรู้ด้านภูมิศาสตร์และประวัติศาสตร์แค่ไหน"),
    "kn::Fine Arts": ("arts", "ศิลปะ", "มีความรู้ด้านศิลปะ ดนตรี หรือการแสดงแค่ไหน"),
    "ab::Spatial Orientation": ("field_vision", "การรับรู้ทิศทางและการมองในสภาพต่าง ๆ", "รับรู้ทิศทางและมองเห็นได้ดีแค่ไหน ในที่มืด แสงจ้า หรือพื้นที่กว้าง"),
    "kn::Public Safety and Security": ("safety_transport", "ความปลอดภัยและการขนส่ง", "มีความรู้ด้านความปลอดภัยสาธารณะ และการขนส่งแค่ไหน"),
    "kn::Food Production": ("food", "อาหารและการเกษตร", "มีความรู้ด้านการผลิตอาหาร เกษตร หรือปศุสัตว์แค่ไหน"),
    "ab::Finger Dexterity": ("hand_dexterity", "ความคล่องของมือ", "ใช้มือและนิ้วทำงานละเอียดได้ดีแค่ไหน เช่น ประกอบชิ้นส่วน ควบคุมเครื่องมือ"),
    "ab::Hearing Sensitivity": ("hearing", "การฟังและแยกเสียง", "ตั้งใจฟังและแยกแยะเสียงได้ดีแค่ไหน"),
    "ab::Reaction Time": ("machine_control", "การควบคุมเครื่องจักร", "ควบคุมเครื่องจักรหรือยานพาหนะ และตอบสนองได้รวดเร็วแม่นยำแค่ไหน"),
    "ab::Stamina": ("physical", "แรงกายและความทนทาน", "ทำงานที่ใช้แรงกาย ความทนทาน และการเคลื่อนไหวร่างกายได้ดีแค่ไหน"),
    "ab::Dynamic Flexibility": ("flexibility", "ความยืดหยุ่นของร่างกาย", "ก้มตัว บิดตัว หรือเอื้อมซ้ำ ๆ ได้คล่องแค่ไหน"),
    "ab::Visualization": ("visualization", "การนึกภาพและแยกสี", "นึกภาพ 3 มิติ และแยกแยะสีได้ดีแค่ไหน"),
    "kn::Engineering and Technology": ("engineering", "วิศวกรรมและงานช่าง", "มีความรู้ด้านวิศวกรรม การออกแบบ เครื่องกล การก่อสร้าง หรือการผลิตแค่ไหน"),
    "ab::Time Sharing": ("far_multitask", "การมองไกลและทำหลายอย่างพร้อมกัน", "มองรายละเอียดระยะไกล และติดตามหลายอย่างพร้อมกันได้ดีแค่ไหน"),
    "ab::Flexibility of Closure": ("pattern_finding", "การจับรูปแบบ", "มองหารูปแบบหรือสิ่งที่ซ่อนอยู่ในข้อมูลหรือภาพที่ซับซ้อนได้เร็วแค่ไหน"),
    "ab::Selective Attention": ("focus_speed", "สมาธิและความเร็วในการตรวจ", "จดจ่อกับงานแม้มีสิ่งรบกวน และตรวจเทียบข้อมูลได้รวดเร็วแค่ไหน"),
    "kn::Biology": ("bio_medical", "ชีววิทยาและการแพทย์", "มีความรู้ด้านชีววิทยา การแพทย์ หรือสุขภาพแค่ไหน"),
    "kn::Physics": ("physical_science", "เคมีและฟิสิกส์", "มีความรู้ด้านเคมี ฟิสิกส์ และวิธีการทางวิทยาศาสตร์แค่ไหน"),
}
RIASEC_QUESTIONS = {
    "ri::Realistic": "ชอบงานลงมือทำ ใช้เครื่องมือหรือเครื่องจักร หรือทำงานกลางแจ้งแค่ไหน",
    "ri::Investigative": "ชอบงานค้นคว้า วิเคราะห์ และหาคำตอบของปัญหาแค่ไหน",
    "ri::Artistic": "ชอบงานสร้างสรรค์ ออกแบบ หรือแสดงออกทางศิลปะแค่ไหน",
    "ri::Social": "ชอบงานช่วยเหลือ สอน หรือดูแลผู้อื่นแค่ไหน",
    "ri::Enterprising": "ชอบงานโน้มน้าว ขาย นำทีม หรือทำธุรกิจแค่ไหน",
    "ri::Conventional": "ชอบงานที่มีระเบียบ ขั้นตอนชัดเจน จัดการข้อมูลหรือเอกสารแค่ไหน",
}

chosen = groups_for(CHOSEN_K, "ward")
group_rows, short_cols = [], {}
for gid, members in chosen.items():
    anchors = [m for m in members if m in SKILL_QUESTIONS]
    if len(anchors) != 1:
        raise SystemExit(f"กลุ่ม {gid} จับคู่คำถามไม่ได้ (anchor ที่พบ: {anchors}) — ตรวจ SKILL_QUESTIONS ใหม่")
    slug, name_th, q = SKILL_QUESTIONS[anchors[0]]
    col = f"grp::{slug}"
    short_cols[col] = features[members].mean(axis=1)
    group_rows.append({"feature": col, "name_th": name_th, "question_th": q, "n_skills": len(members),
                       "members": " | ".join(members)})
groups_df = pd.DataFrame(group_rows)
groups_df.to_csv(OUT / "skill_groups.csv", index=False)
SHORT = pd.DataFrame(short_cols).round(2)
SHORT.to_csv(OUT / "occupation_skill_groups.csv")

# คลังคำถามฉบับสั้นครบ 71 ข้อ
tb = pd.read_csv(HERE / "output" / "it_focus" / "question_bank_D.csv")
tb = tb[tb["feature"].str.startswith(("tech::", "task::"))]
qs = [{"no": 0, "section": "1. ทักษะและความรู้", "feature": r.feature, "question_th": r.question_th,
       "scale": "1 = ไม่มีเลย … 5 = เชี่ยวชาญ"} for r in groups_df.itertuples()]
qs += [{"no": 0, "section": "2. ความสนใจ (RIASEC)", "feature": f, "question_th": q,
        "scale": "1 = ไม่ชอบเลย … 5 = ชอบมาก"} for f, q in RIASEC_QUESTIONS.items()]
qs += [{"no": 0, "section": "3. ลักษณะงานที่ชอบ", "feature": r.feature, "question_th": r.question_th,
        "scale": "1 = ไม่ชอบเลย … 5 = ชอบมาก"} for r in tb[tb.feature.str.startswith("task::")].itertuples()]
qs += [{"no": 0, "section": "4. เครื่องมือที่อยากใช้ทำงาน", "feature": r.feature, "question_th": r.question_th,
        "scale": "1 = ไม่อยากเลย … 5 = อยากมาก"} for r in tb[tb.feature.str.startswith("tech::")].itertuples()]
qbank = pd.DataFrame(qs)
qbank["no"] = range(1, len(qbank) + 1)
qbank["to_feature_0_100"] = "(คำตอบ − 1) ÷ 4 × 100"
qbank.to_csv(OUT / "question_bank_short.csv", index=False)

final = evaluate(SHORT.join(features[OTHER]))
summary = {"chosen_k": CHOSEN_K, "method": "ward", "total_questions": len(qbank),
           "largest_group": int(groups_df["n_skills"].max()), "short": final, "full_D": full}
(OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))

# ---------------------------------------------------------------------
# 4. กราฟ: จำนวนคำถาม vs ความแม่น
# ---------------------------------------------------------------------
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e6e5e0", "axes.axisbelow": True, "axes.titleweight": "bold", "font.size": 10})
fig, ax = plt.subplots(figsize=(9, 4.4))
w = curve[curve.method == "ward"]
ax.plot(w.total_questions, w.all_top5 * 100, marker="o", ms=5, lw=2, color="#2a78d6", label="All occupations — Top-5")
ax.plot(w.total_questions, w.it_top1 * 100, marker="o", ms=5, lw=2, color="#eb6834", label="IT occupations — Top-1")
ax.scatter([136], [full["all_top5"] * 100], color="#2a78d6", marker="D", s=40, zorder=3)
ax.scatter([136], [full["it_top1"] * 100], color="#eb6834", marker="D", s=40, zorder=3)
ax.annotate("full set D (136)", (136, full["all_top5"] * 100), xytext=(-60, -22), textcoords="offset points", fontsize=8)
n_short = len(qbank)
ax.axvline(n_short, color="#8a8984", ls="--", lw=1)
ax.text(n_short + 1, 52, f"chosen: {n_short} questions", fontsize=8, color="#52514e")
ax.set_xlabel("Questions in the assessment"); ax.set_ylabel("Accuracy on stress test (%)")
ax.set_ylim(50, 102); ax.set_title("Shorter assessment: accuracy vs number of questions (① Matching, Ward groups)")
ax.legend(frameon=False, loc="lower right")
plt.tight_layout(); plt.savefig(OUT / "09_questions_vs_accuracy.png", dpi=150, bbox_inches="tight"); plt.close()
print(f"\nเลือก Ward {CHOSEN_K} กลุ่ม → คำถามรวม {len(qbank)} ข้อ: "
      + ", ".join(f"{k} {v:.3f}" for k, v in final.items()))
