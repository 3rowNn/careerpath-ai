"""
CareerPath AI — คำถาม "ชอบทำงานแบบไหน" จาก O*NET Task Statements
====================================================================

ปัญหา: อาชีพสาย IT มีโปรไฟล์ 101 features (Abilities / Knowledge / Skills / RIASEC) คล้ายกันมาก
       โมเดลจึงแยก Software Developer, Network Admin, Data Scientist ออกจากกันได้ไม่ดี
แนวทาง: ถามผู้ใช้ว่า "ชอบทำงานแบบไหน" แล้วใช้ Task Statements (งานที่คนในอาชีพทำจริง)
        คำนวณว่าแต่ละอาชีพทำงานแบบนั้นมากแค่ไหน → ได้ feature ใหม่ 12 มิติ (task::)

คะแนนอาชีพต่อคำถาม = สัดส่วนงานที่ตรงคำสำคัญ (Core = 1, Supplemental = 0.5)
                      ปรับเป็น 0–100 โดยหารด้วยค่า percentile 99 ของทุกอาชีพ (กันค่าโดดดึงสเกล)
ผู้ใช้ตอบ 1–5 → (คำตอบ − 1) ÷ 4 × 100 เหมือนคำถามอื่น

วิธีรัน (จาก datasets/ml):  python task_preferences.py
"""

import json
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

SEED = 42
HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data_gate_output"
TASKS_XLSX = HERE.parent / "Task Statements.xlsx"
OUT = HERE / "output" / "it_focus"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------
# 1. คลังคำถาม: ข้อความภาษาไทยที่ถามผู้ใช้ + คำสำคัญที่ใช้ค้นใน Task Statements
# ---------------------------------------------------------------------
QUESTIONS = [
    ("ui", "ชอบออกแบบและสร้างหน้าจอที่คนใช้งาน เช่น เว็บหรือแอป",
     r"web ?sites?|web pages?|user interfaces?|front[- ]end|layouts?|usability|user experience|graphic|visual design|mockups?|prototypes?"),
    ("build", "ชอบเขียนโปรแกรมสร้างระบบหรือซอฟต์แวร์ใหม่",
     r"\bcod(e|ing)\b|programming|computer programs?|(write|develop|design|build|modify|create|implement)\w* (\w+ ){0,3}(software|applications?|code|scripts?|computer programs?)"),
    ("infra", "ชอบดูแลเซิร์ฟเวอร์ เครือข่าย และระบบให้ทำงานได้ไม่ล่ม",
     r"networks?\b|servers?\b|infrastructure|operating systems?|system administration|backups?|uptime|cloud|configur|data cent(er|re)"),
    ("security", "ชอบหาช่องโหว่และป้องกันระบบจากการถูกโจมตี",
     r"security|vulnerab|threats?|attacks?|intrusion|malware|virus|encrypt|penetration|forensic|breach|firewall|cyber"),
    ("analyze", "ชอบวิเคราะห์ข้อมูลเพื่อหาคำตอบหรือ insight",
     r"analy[sz]e (data|datasets|information|results|trends)|data analysis|statistic|datasets?|data sets?|trends|insights?|visuali[sz]|dashboards?"),
    ("model", "ชอบสร้างโมเดลทำนาย หรือใช้คณิตศาสตร์แก้ปัญหา",
     r"models?\b|modeling|predict|algorithms?|machine learning|artificial intelligence|mathematical|simulat|forecast|optimi[sz]"),
    ("database", "ชอบออกแบบและจัดการฐานข้อมูล",
     r"databases?|data warehous|\bsql\b|data models?|schemas?|quer(y|ies)|data storage|data integrity"),
    ("test", "ชอบตรวจหา bug และทดสอบว่าระบบทำงานถูกต้อง",
     r"\btest(s|ing)?\b|debug|defects?|quality assurance|\bbugs?\b|validat|verif|errors?\b"),
    ("support", "ชอบช่วยเหลือผู้ใช้แก้ปัญหาการใช้งาน",
     r"\busers?\b|help desk|customers?|clients?|inquiries|answer questions|troubleshoot|train (users|staff|employees)"),
    ("lead", "ชอบวางแผนโปรเจกต์ ประสานงานทีม และจัดการคน",
     r"coordinat|\bmanag(e|ing)\b|supervis|schedul|budgets?|projects?\b|direct (the )?(work|activities|staff)|\bplan(s|ning)?\b"),
    ("research", "ชอบค้นคว้าวิจัยและติดตามเทคโนโลยีใหม่",
     r"research|investigat|emerging|new technolog|literature|experiment|abreast|current (developments|trends)|innovat"),
    ("present", "ชอบนำเสนอ อธิบาย หรือเขียนเอกสาร",
     r"present(ation)?s?\b|document(ation)?|(write|prepare) (reports|manuals|documentation)|explain|communicat|recommend"),
]

# ---------------------------------------------------------------------
# 2. คำนวณคะแนนอาชีพ × คำถาม จาก Task Statements
# ---------------------------------------------------------------------
features = pd.read_csv(DATA / "occupation_features.csv", index_col=0)
meta = pd.read_csv(DATA / "occupation_meta.csv", index_col=0, dtype={"major": str})
CODES = np.asarray(features.index, dtype=object)
TITLE = meta["Title"].to_dict()

tasks = pd.read_excel(TASKS_XLSX)
tasks = tasks[tasks["O*NET-SOC Code"].isin(CODES)].copy()
tasks["w"] = tasks["Task Type"].map({"Core": 1.0, "Supplemental": 0.5}).fillna(0.75)
text = tasks["Task"].str.lower()

raw = pd.DataFrame(index=CODES, dtype=float)
for key, _, pattern in QUESTIONS:
    hit = text.str.contains(pattern, regex=True, flags=re.IGNORECASE)
    share = (tasks["w"] * hit).groupby(tasks["O*NET-SOC Code"]).sum() / tasks.groupby("O*NET-SOC Code")["w"].sum()
    raw[f"task::{key}"] = share.reindex(CODES)
missing_tasks = int(raw.isna().all(axis=1).sum())
raw = raw.fillna(raw.median())                       # อาชีพที่ไม่มี Task Statements (ถ้ามี) ใช้ค่ากลาง
cap = raw.quantile(0.99)
TASK = (raw / cap).clip(upper=1.0) * 100
TASK = TASK.round(2)
TASK.to_csv(OUT / "occupation_task_preferences.csv")

qb = pd.DataFrame([{"feature": f"task::{k}", "question_th": q, "scale": "1 = ไม่ชอบเลย … 5 = ชอบมาก",
                    "task_keywords_regex": p} for k, q, p in QUESTIONS])
qb.to_csv(OUT / "question_bank.csv", index=False)

# sanity check: อาชีพสาย IT ที่ได้คะแนนสูงสุดในแต่ละคำถาม
it_codes = [c for c in CODES if c.startswith("15-")]
san_rows = []
for key, q, _ in QUESTIONS:
    top = TASK.loc[it_codes, f"task::{key}"].nlargest(3)
    san_rows.append({"feature": f"task::{key}", "question_th": q,
                     "top_it_occupations": " | ".join(f"{TITLE[c]} ({v:.0f})" for c, v in top.items())})
sanity = pd.DataFrame(san_rows)
sanity.to_csv(OUT / "sanity_top_it_occupations.csv", index=False)

# ---------------------------------------------------------------------
# 3. เทียบ 4 ชุด feature ด้วย ① Matching (cosine) บนผู้ใช้จำลองแบบ stress test
# ---------------------------------------------------------------------
CORE = [c for c in features.columns if c.split("::")[0] in ("ab", "kn", "sk", "ri")]
TECH = [c for c in features.columns if c.startswith("tech::")]
TCOL = list(TASK.columns)
full = features.join(TASK)
SETS = {
    "A. core 101 (ตอนนี้)": CORE,
    "B. core + tech tags": CORE + TECH,
    "C. core + ความชอบ (task)": CORE + TCOL,
    "D. core + tech + ความชอบ": CORE + TECH + TCOL,
}
SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]
IS_IT = np.array([c.startswith("15-") for c in CODES])


def l2(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)


def evaluate(cols, seeds=(7001, 7002, 7003)):
    R = full.loc[CODES, cols].to_numpy(float)
    Rn = l2(R)
    rows = []
    for k, (sd, b) in enumerate(SCENARIOS):
        hits1, hits5, hits1_it, hits5_it, hit5_in_it = [], [], [], [], []
        for s in seeds:
            r = np.random.default_rng(s * 100 + k)
            U = np.clip(R + b + r.normal(0, sd, R.shape), 0, 100)    # ผู้ใช้จำลอง 1 คนต่ออาชีพ
            S = l2(U) @ Rn.T
            top = np.argsort(-S, axis=1)[:, :5]
            truth = np.arange(len(CODES))
            h1 = top[:, 0] == truth
            h5 = (top == truth[:, None]).any(axis=1)
            hits1.append(h1); hits5.append(h5)
            hits1_it.append(h1[IS_IT]); hits5_it.append(h5[IS_IT])
        rows.append({"noise": sd, "bias": b,
                     "all_top1": np.mean(hits1), "all_top5": np.mean(hits5),
                     "it_top1": np.mean(hits1_it), "it_top5": np.mean(hits5_it)})
    return pd.DataFrame(rows)


def separability(cols):
    X = l2(full.loc[CODES, cols].to_numpy(float))
    S = X @ X.T
    it_idx = np.where(IS_IT)[0]
    sub = S[np.ix_(it_idx, it_idx)]
    iu = np.triu_indices(len(it_idx), 1)
    iu_all = np.triu_indices(len(CODES), 1)
    return float(sub[iu].mean()), float(S[iu_all].mean()), float((sub[iu] > 0.95).mean())


summary, per_scen = [], []
for name, cols in SETS.items():
    ev = evaluate(cols)
    ev.insert(0, "feature_set", name)
    per_scen.append(ev)
    sep_it, sep_all, frac95 = separability(cols)
    summary.append({"feature_set": name, "n_features": len(cols), "questions_to_ask": len(cols),
                    "it_mean_cosine": round(sep_it, 3), "all_mean_cosine": round(sep_all, 3),
                    "it_pairs_cosine_gt_0.95": round(frac95, 3),
                    "it_top1": round(ev["it_top1"].mean(), 4), "it_top5": round(ev["it_top5"].mean(), 4),
                    "all_top1": round(ev["all_top1"].mean(), 4), "all_top5": round(ev["all_top5"].mean(), 4)})
summary = pd.DataFrame(summary)
per_scen = pd.concat(per_scen, ignore_index=True)
summary.to_csv(OUT / "10_feature_set_comparison.csv", index=False)
per_scen.round(4).to_csv(OUT / "11_feature_set_by_scenario.csv", index=False)

# ---------------------------------------------------------------------
# 4. กราฟ
# ---------------------------------------------------------------------
BLUE, ORANGE, AQUA, PURPLE, GRAY = "#2a78d6", "#eb6834", "#1baf7a", "#7b5cd6", "#8a8984"
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e6e5e0", "axes.axisbelow": True, "axes.titleweight": "bold", "font.size": 10})
labels_en = ["A. core 101 (now)", "B. + tech tags", "C. + task preferences", "D. + tech + task"]
fig, axes = plt.subplots(1, 2, figsize=(12, 4))
for ax, metric, title in [(axes[0], "it_top1", "IT occupations: Top-1 accuracy"),
                          (axes[1], "it_top5", "IT occupations: Top-5 accuracy")]:
    v = summary[metric].to_numpy() * 100
    bars = ax.bar(labels_en, v, color=[GRAY, BLUE, AQUA, ORANGE], width=0.6)
    for b_, x in zip(bars, v):
        ax.text(b_.get_x() + b_.get_width() / 2, x + 1, f"{x:.1f}%", ha="center", fontsize=9)
    ax.set_ylim(0, 105); ax.set_title(title); ax.tick_params(axis="x", rotation=15); ax.grid(axis="x", visible=False)
fig.suptitle("Stress test, ① Matching — average over 9 noise/bias scenarios (36 IT occupations)", fontsize=10, y=1.02)
plt.tight_layout(); plt.savefig(OUT / "07_it_feature_sets.png", dpi=150, bbox_inches="tight"); plt.close()

# heatmap: คำถามความชอบ × อาชีพ IT ที่นักศึกษาสนใจ
SHOW = ["15-1252.00", "15-1254.00", "15-1255.00", "15-1244.00", "15-1241.00", "15-1212.00", "15-1299.08",
        "15-1253.00", "15-1242.00", "15-2051.00", "15-2051.01", "15-1232.00", "15-1299.09"]
SHOW = [c for c in SHOW if c in TASK.index]
H = TASK.loc[SHOW, TCOL]
fig, ax = plt.subplots(figsize=(11, 0.45 * len(SHOW) + 1.5))
im = ax.imshow(H.to_numpy(), cmap="Blues", vmin=0, vmax=100, aspect="auto")
ax.set_xticks(range(len(TCOL))); ax.set_xticklabels([c.split("::")[1] for c in TCOL], rotation=30, ha="right")
ax.set_yticks(range(len(SHOW))); ax.set_yticklabels([TITLE[c] for c in SHOW])
for i in range(len(SHOW)):
    for j in range(len(TCOL)):
        v = H.iat[i, j]
        ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=8, color="white" if v > 55 else "#1f2937")
ax.grid(False); ax.set_title("Task-preference profile of IT occupations (0–100, from O*NET Task Statements)")
plt.colorbar(im, ax=ax, fraction=0.025)
plt.tight_layout(); plt.savefig(OUT / "08_it_task_heatmap.png", dpi=150, bbox_inches="tight"); plt.close()

# ---------------------------------------------------------------------
# 5. คลังคำถามชุด D (สำหรับออกแบบแบบประเมินในเว็บ)
# ---------------------------------------------------------------------
# tech: ถามว่า "อยากทำงานกับ" ไม่ใช่ "ใช้เป็นไหม" — tag ของอาชีพหมายถึงงานนั้นใช้เครื่องมือนี้
#       นักศึกษา IT เกือบทุกคนใช้ Python / SQL เป็น คำถามแบบ "ใช้เป็นไหม" จึงแยกสายไม่ได้
DOMAIN_TH = {"ab": "ความสามารถ (Abilities)", "kn": "ความรู้ (Knowledge)", "sk": "ทักษะพื้นฐาน (Essential Skills)",
             "ri": "ความสนใจ (RIASEC)", "tech": "เครื่องมือที่อยากใช้ทำงาน", "task": "ลักษณะงานที่ชอบ"}
rows = []
for c in CORE:
    rows.append({"feature": c, "group": DOMAIN_TH[c.split("::")[0]], "question_th": "",
                 "status": "ต้องออกแบบคำถาม (รวมหลาย feature เป็นคำถามเดียวได้)"})
for c in TECH:
    tool = c.split("::")[1]
    rows.append({"feature": c, "group": DOMAIN_TH["tech"],
                 "question_th": f"อยากทำงานกับ {tool} เป็นประจำแค่ไหน", "status": "พร้อมใช้"})
for k, q, _ in QUESTIONS:
    rows.append({"feature": f"task::{k}", "group": DOMAIN_TH["task"], "question_th": q, "status": "พร้อมใช้"})
qd = pd.DataFrame(rows)
qd["scale"] = "1 = ไม่เลย … 5 = มากที่สุด → (คำตอบ − 1) ÷ 4 × 100"
qd.to_csv(OUT / "question_bank_D.csv", index=False)

(OUT / "summary.json").write_text(json.dumps({
    "questions": len(QUESTIONS), "occupations_without_tasks": missing_tasks,
    "comparison": summary.to_dict("records")}, ensure_ascii=False, indent=1))
print(summary.to_string(index=False))
print()
print(sanity[["feature", "top_it_occupations"]].to_string(index=False))
