"""
CareerPath AI — แบบประเมินรอบที่ 4: ทุกสายอาชีพ (กลุ่มผู้ใช้ = คนที่ยังไม่รู้ทาง ไม่ใช่เฉพาะสาย IT)
=====================================================================================

ปัญหาของรอบที่ 3 (71 ข้อ): หมวด 3–4 เป็นเรื่อง IT 35 ข้อ (ความชอบงาน IT 12 + เครื่องมือ IT 23)
  → persona นอกสาย IT ได้ผลแย่ และคนที่ไม่รู้จัก Kubernetes/Spark ตอบไม่ได้
แนวทาง:
  หมวด 3  ลักษณะงานที่ชอบ 18 ข้อ ครอบคลุมทุกสาย (gtask::) — คำนวณจาก O*NET Task Statements
          แบบเดียวกับ task_preferences.py: สัดส่วนงานของอาชีพที่ตรงคำสำคัญ (Core 1, Supplemental 0.5) ÷ p99 × 100
  หมวด 4  นิสัยในการทำงาน 10 ข้อ (ws::) จาก O*NET Work Styles — ตอบง่ายกว่าการประเมินฝีมือตัวเอง
          เลือกด้านที่ต่างกันระหว่างอาชีพมาก (SD สูง) และเขียนเป็นคำถามที่คนทั่วไปเข้าใจ
  หมวด 1–2 เดิม: กลุ่มทักษะ 30 + RIASEC 6

เทียบหลายชุดด้วย ① Matching (centered cosine เหมือนโมเดลจริง) บน
  - stress test ผู้ใช้จำลอง 9 สถานการณ์
  - persona 28 แบบ (evaluation/personas.json, เขียนก่อนดูผล) แยกสาย IT / นอกสาย IT

รัน (จาก datasets/ml, หลัง task_preferences.py และ short_assessment.py):  python general_assessment.py
"""

import json
import re
import sys
import warnings

warnings.filterwarnings("ignore", "This pattern is interpreted as a regular expression")
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data_gate_output"
TASKS_XLSX = HERE.parent / "Task Statements.xlsx"
OUT = HERE / "output" / "general"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(HERE / "evaluation"))

# ---------------------------------------------------------------------
# 1. หมวด 3: ลักษณะงานที่ชอบ (ทุกสาย)
# ---------------------------------------------------------------------
GTASK = [
    ("care", "ชอบดูแลคนป่วย ผู้สูงอายุ เด็ก หรือคนที่ต้องการความช่วยเหลือ",
     r"\bcare for\b|caring for|personal care|bath(e|ing)|feed(ing)? (patients|residents|children)|elderly|disabilit|assist (patients|residents|clients|children)|comfort|daily living|child ?care|supervise children"),
    ("teach", "ชอบสอน อบรม หรือให้คำแนะนำคนอื่น",
     r"\bteach|instruct|tutor|lessons?|curricul|lectur|\btrain (students|staff|employees|workers|new)|mentor|counsel|advise (students|clients)|educational"),
    ("sell", "ชอบขายของ เจรจาต่อรอง หรือโน้มน้าวให้คนตัดสินใจ",
     r"\bsell|\bsales\b|negotiat|persuad|promot|prospective customers|quote prices|close (sales|deals)|solicit|advertis|market (products|services)"),
    ("serve", "ชอบต้อนรับ ตอบคำถาม และบริการลูกค้าที่มาติดต่อ",
     r"greet|customers?|clients?\b|guests?|patrons?|visitors?|inquiries|complaints?|answer (questions|telephones|calls)|reservations?|front desk|courteous"),
    ("lead", "ชอบวางแผน จัดการทีม และตัดสินใจเรื่องสำคัญในองค์กร",
     r"\bdirect (and|the|activities|staff|work|operations)|supervis|coordinat|\bmanag(e|ing)\b|establish (policies|goals|objectives)|budgets?|hire|evaluate (staff|employees|performance)|strateg"),
    ("office", "ชอบจัดการเอกสาร บันทึกข้อมูล นัดหมาย และงานธุรการ",
     r"\brecords?\b|\bfiles?\b|filing|documents?|forms?\b|data entry|enter data|schedul|appointments?|correspondence|clerical|typ(e|ing)\b|copies|mail\b"),
    ("money", "ชอบทำงานกับตัวเลข บัญชี การเงิน หรืองบประมาณ",
     r"financial|accounts?\b|accounting|payments?|invoices?|\btax|audit|payroll|\bcash\b|loans?|invest|ledger|bookkeep|expenditures|reconcil|price|cost estimates?"),
    ("analyze", "ชอบค้นคว้า วิเคราะห์ข้อมูล หรือทำวิจัยเพื่อหาคำตอบ",
     r"analy[sz]|research|statistic|experiment|\bdata\b|hypothes|scientific|stud(y|ies)\b|survey|interpret (data|results|findings)|findings"),
    ("computer", "ชอบทำงานกับคอมพิวเตอร์ เขียนโปรแกรม หรือดูแลระบบไอที",
     r"software|computer|programm|\bcode\b|coding|networks?\b|databases?|web ?sites?|applications?|hardware|operating systems?|servers?\b|cyber"),
    ("build", "ชอบประกอบ ซ่อม หรือสร้างสิ่งของด้วยมือและเครื่องมือ",
     r"repair|install|assembl|construct|\bbuild|fabricat|\bweld|replace (parts|components|defective)|hand tools|power tools|dismantl|wiring|plumbing|carpentr|\bfix"),
    ("operate", "ชอบขับยานพาหนะ หรือควบคุมเครื่องจักรขนาดใหญ่",
     r"\bdriv|vehicles?|trucks?|forklift|cranes?|\btractors?|operate (machines|machinery|equipment|vehicles|controls)|machine controls|\bload|unload|\bsteer|navigat|pilot|aircraft|vessel"),
    ("nature", "ชอบทำงานกลางแจ้ง กับธรรมชาติ พืช หรือสัตว์",
     r"animals?|plants?\b|crops?|soil|trees?|forest|livestock|\bfish|wildlife|\bfarm|garden|landscap|harvest|irrigat|outdoor|seeds?|\bland\b|environmental"),
    ("create", "ชอบออกแบบ วาด ถ่ายภาพ หรือสร้างงานศิลปะ",
     r"graphic|(interior|fashion|floral|set|costume|web) design|design (layouts|graphics|artwork|logos|costumes|sets|displays)|\bdraw|sketch|\bart\b|artistic|artwork|creative|illustrat|photograph|\bmusic|perform(ers?|ances?)\b|decorat|aesthetic|animation|\bfilm|paint(ing|ings)?\b"),
    ("write", "ชอบเขียน แปล ตรวจทาน หรือผลิตเนื้อหา",
     r"\bwrit(e|ing|ten)\b|\bedit|articles?|stor(y|ies)|content|translat|publish|scripts?|proofread|\bnews|manuscripts?|copy\b|press releases?"),
    ("food", "ชอบทำอาหาร เตรียมอาหาร หรือบริการอาหารและเครื่องดื่ม",
     r"\bcook|\bfood|meals?\b|kitchen|\bbake|recipes?|beverages?|\bmenu|ingredients|\bdishes|\bgrill|\bserve (food|meals|customers)|restaurant|\bbar\b"),
    ("safety", "ชอบดูแลความปลอดภัย ตรวจตรา หรือบังคับใช้กฎระเบียบ",
     r"inspect|safety|complian|regulat|enforce|\blaws?\b|patrol|\bsecurity|hazard|violations?|emergenc|\barrest|surveillance|protect|fire\b"),
    ("heal", "ชอบตรวจ รักษา หรือฟื้นฟูสุขภาพของผู้ป่วย",
     r"diagnos|\btreat|patients?|medical|surg|prescri|clinical|symptom|therap|medication|dental|health care|vital signs|wounds?|rehabilitat"),
    ("produce", "ชอบงานผลิตในโรงงาน ควบคุมเครื่องผลิตและคุณภาพสินค้า",
     r"production|manufactur|products?\b|quality control|batch|assembly line|machine (settings|operators?)|materials|workpieces?|\bmold|\bcut(ting)? (materials|stock)|\bfeed (materials|stock)|tolerances|specifications"),
]

# ---------------------------------------------------------------------
# 2. หมวด 4: นิสัยในการทำงาน (Work Styles) — ข้อความเป็นคำบรรยายตัวเอง ตอบ "ตรงกับฉันแค่ไหน"
# ---------------------------------------------------------------------
WS_QUESTIONS = {
    "ws::Social Orientation": "ชอบทำงานกับผู้คน มากกว่าทำงานคนเดียว",
    "ws::Empathy": "เข้าใจและใส่ใจความรู้สึกของคนอื่นได้ดี",
    "ws::Leadership Orientation": "ชอบเป็นผู้นำ ตัดสินใจ และรับผิดชอบงานของคนอื่น",
    "ws::Innovation": "ชอบคิดวิธีใหม่ ๆ หรือไอเดียแปลกใหม่ในการแก้ปัญหา",
    "ws::Intellectual Curiosity": "อยากรู้อยากเห็น ชอบเรียนรู้เรื่องใหม่ ๆ อยู่เสมอ",
    "ws::Cautiousness": "รอบคอบ ระมัดระวัง คิดถึงความเสี่ยงก่อนลงมือ",
    "ws::Tolerance for Ambiguity": "ทำงานได้ดีแม้ไม่มีคำตอบหรือขั้นตอนที่ชัดเจน",
    "ws::Stress Tolerance": "รับมือกับความกดดันและงานเร่งได้ดี",
    "ws::Adaptability": "ปรับตัวกับการเปลี่ยนแปลงได้เร็ว",
    "ws::Cooperation": "ทำงานเป็นทีม และช่วยเหลือเพื่อนร่วมงานได้ดี",
}

features = pd.read_csv(DATA / "occupation_features.csv", index_col=0)
meta = pd.read_csv(DATA / "occupation_meta.csv", index_col=0, dtype={"major": str})
CODES = np.asarray(features.index, dtype=object)
TITLE = meta["Title"].to_dict()

tasks = pd.read_excel(TASKS_XLSX)
tasks = tasks[tasks["O*NET-SOC Code"].isin(CODES)].copy()
tasks["w"] = tasks["Task Type"].map({"Core": 1.0, "Supplemental": 0.5}).fillna(0.75)
text = tasks["Task"].str.lower()
total_w = tasks.groupby("O*NET-SOC Code")["w"].sum()

raw = pd.DataFrame(index=CODES, dtype=float)
for key, _, pattern in GTASK:
    hit = text.str.contains(pattern, regex=True, flags=re.IGNORECASE)
    raw[f"gtask::{key}"] = ((tasks["w"] * hit).groupby(tasks["O*NET-SOC Code"]).sum() / total_w).reindex(CODES)
raw = raw.fillna(raw.median())
GT = ((raw / raw.quantile(0.99)).clip(upper=1.0) * 100).round(2)
GT.to_csv(OUT / "occupation_general_tasks.csv")

# sanity: อาชีพที่ได้คะแนนสูงสุดในแต่ละข้อ (ตรวจว่า regex จับงานถูกประเภท)
san = pd.DataFrame([{"feature": f"gtask::{k}", "question_th": q,
                     "top_occupations": " | ".join(f"{TITLE[c]} ({v:.0f})" for c, v in GT[f"gtask::{k}"].nlargest(5).items())}
                    for k, q, _ in GTASK])
san.to_csv(OUT / "sanity_top_occupations.csv", index=False)

# ---------------------------------------------------------------------
# 3. เทียบชุดคำถาม
# ---------------------------------------------------------------------
grp = pd.read_csv(HERE / "output" / "short" / "occupation_skill_groups.csv", index_col=0)
itask = pd.read_csv(HERE / "output" / "it_focus" / "occupation_task_preferences.csv", index_col=0)
ALL = features.join(grp).join(itask).join(GT)
GRP = list(grp.columns)
RI = [c for c in features.columns if c.startswith("ri::")]
TECH = [c for c in features.columns if c.startswith("tech::")]
TASK = list(itask.columns)
GTC = list(GT.columns)
WS = list(WS_QUESTIONS)
SETS = {
    "R3: ทักษะ+RIASEC+งาน IT+เครื่องมือ IT (เดิม)": GRP + RI + TASK + TECH,
    "A: ทักษะ+RIASEC+ลักษณะงานทั่วไป": GRP + RI + GTC,
    "B: A + นิสัย 10 ข้อ": GRP + RI + GTC + WS,
    "C: B + งาน IT 12 ข้อ": GRP + RI + GTC + WS + TASK,
    "D: B + เครื่องมือ IT 23 ข้อ": GRP + RI + GTC + WS + TECH,
    "C*: B + งาน IT 12 ข้อ เฉพาะคนชอบคอมพิวเตอร์": GRP + RI + GTC + WS + TASK,
}
GATED = {"C*: B + งาน IT 12 ข้อ เฉพาะคนชอบคอมพิวเตอร์"}
SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]
IS_IT = np.array([c.startswith("15-") for c in CODES])


# หมวดงาน IT แบบมีเงื่อนไข: ถามเฉพาะคนที่ตอบ "ชอบทำงานกับคอมพิวเตอร์" ≥ 3 (= 50/100)
# ไม่ได้ถาม → ใส่ค่าเฉลี่ยของอาชีพทั้งหมด ซึ่งใน centered cosine มีค่า z = 0 จึงไม่ดัน/ไม่ฉุดอาชีพใด
GATE, GATE_MIN = "gtask::computer", 50.0


def l2(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)


def apply_gate(U, cols, mu):
    if GATE not in cols or not any(c in TASK for c in cols):
        return U
    U = U.copy()
    gi, ti = cols.index(GATE), [i for i, c in enumerate(cols) if c in TASK]
    off = U[:, gi] < GATE_MIN
    U[np.ix_(off, ti)] = mu[ti]
    return U


def matcher(cols, gated=False):
    R = ALL.loc[CODES, cols].to_numpy(float)
    mu, sd = R.mean(0), R.std(0) + 1e-9
    Rn = l2((R - mu) / sd)
    prep = (lambda U: apply_gate(U, cols, mu)) if gated else (lambda U: U)
    return R, lambda U: l2((prep(U) - mu) / sd) @ Rn.T


def stress(cols, gated=False, seeds=(7001, 7002, 7003)):
    R, score = matcher(cols, gated)
    out = {"all_top1": [], "all_top5": [], "it_top1": [], "nonit_top5": []}
    truth = np.arange(len(CODES))
    for k, (sd, b) in enumerate(SCENARIOS):
        for s in seeds:
            U = np.clip(R + b + np.random.default_rng(s * 100 + k).normal(0, sd, R.shape), 0, 100)
            top = np.argsort(-score(U), axis=1)[:, :5]
            h1, h5 = top[:, 0] == truth, (top == truth[:, None]).any(axis=1)
            out["all_top1"].append(h1.mean()); out["all_top5"].append(h5.mean())
            out["it_top1"].append(h1[IS_IT].mean()); out["nonit_top5"].append(h5[~IS_IT].mean())
    return {k: float(np.mean(v)) for k, v in out.items()}


from evaluate import broad, persona_answers  # noqa: E402

PERSONAS = json.loads((HERE / "evaluation" / "personas.json").read_text(encoding="utf-8"))["personas"]


def personas(cols, gated=False):
    _, score = matcher(cols, gated)
    res = {"it": [], "non_it": []}
    for ps in PERSONAS:
        a = persona_answers(list(cols), ps)
        u = np.array([[(a[c] - 1) / 4 * 100 for c in cols]])
        order = np.argsort(-score(u)[0])
        exp_b = {broad(c) for c in ps["expected"]}
        rank_soc = next(i + 1 for i, j in enumerate(order) if broad(CODES[j]) in exp_b)
        rank_strict = next(i + 1 for i, j in enumerate(order) if CODES[j] in ps["expected"])
        res[ps["group"]].append((rank_soc, rank_strict))
    f = lambda g, i, k: float(np.mean([r[i] <= k for r in res[g]]))  # noqa: E731
    return {"it_soc5": f("it", 0, 5), "nonit_soc5": f("non_it", 0, 5), "nonit_strict5": f("non_it", 1, 5),
            "nonit_median_rank": float(np.median([r[1] for r in res["non_it"]]))}


rows = []
for name, cols in SETS.items():
    g = name in GATED
    r = {"set": name, "questions": f"{len(cols) - len(TASK)}+{len(TASK)}" if g else len(cols), **stress(cols, g), **personas(cols, g)}
    rows.append(r)
    print(f"{name:<44} {str(r['questions']):>5} ข้อ | stress all top5 {r['all_top5']:.3f} nonIT top5 {r['nonit_top5']:.3f} IT top1 {r['it_top1']:.3f} "
          f"| persona IT soc@5 {r['it_soc5']:.0%} nonIT soc@5 {r['nonit_soc5']:.0%} strict@5 {r['nonit_strict5']:.0%} median {r['nonit_median_rank']:.0f}", flush=True)
cmp_df = pd.DataFrame(rows)
cmp_df.round(4).to_csv(OUT / "13_round4_comparison.csv", index=False)

# ---------------------------------------------------------------------
# 4. คลังคำถามรอบที่ 4 (ชุด C)
# ---------------------------------------------------------------------
# เลือก C: persona นอกสาย IT ดีขึ้นมาก (เทียบ R3) และสาย IT ยังได้เท่าเดิม · stress test ดีกว่า R3 ทั้งภาพรวม
# C* (ถามงาน IT เฉพาะคนชอบคอมพิวเตอร์) persona ใกล้เคียงกันแต่ stress test ตกมาก จึงไม่เลือก
# งาน IT 12 ข้อเป็นคำถาม "ชอบ...ไหม" คนนอกสายก็ตอบได้ (ต่างจากชื่อเครื่องมือ IT ที่ตัดออก)
CHOSEN = "C: B + งาน IT 12 ข้อ"
groups = pd.read_csv(HERE / "output" / "short" / "skill_groups.csv")
short_qb = pd.read_csv(HERE / "output" / "short" / "question_bank_short.csv")
ri_q = short_qb[short_qb.feature.str.startswith("ri::")].set_index("feature")["question_th"]
qs = [{"section": "1. ทักษะและความรู้", "feature": r.feature, "question_th": r.question_th, "scale": "1 = ไม่มีเลย … 5 = เชี่ยวชาญ"}
      for r in groups.itertuples()]
qs += [{"section": "2. ความสนใจ (RIASEC)", "feature": f, "question_th": ri_q[f], "scale": "1 = ไม่ชอบเลย … 5 = ชอบมาก"} for f in RI]
qs += [{"section": "3. ลักษณะงานที่ชอบ", "feature": f"gtask::{k}", "question_th": q, "scale": "1 = ไม่ชอบเลย … 5 = ชอบมาก"} for k, q, _ in GTASK]
it_q = pd.read_csv(HERE / "output" / "it_focus" / "question_bank.csv").set_index("feature")["question_th"]
# งาน IT 12 ข้ออยู่ในหมวด 3 (ไม่แยกหัวข้อ IT) — คำนวณจาก Task Statements ของทั้ง 910 อาชีพ และช่วยแยกอาชีพนอกสาย IT ด้วย
qs += [{"section": "3. ลักษณะงานที่ชอบ", "feature": f, "question_th": it_q[f], "scale": "1 = ไม่ชอบเลย … 5 = ชอบมาก"}
       for f in TASK]
qs += [{"section": "4. นิสัยในการทำงาน", "feature": f, "question_th": q, "scale": "1 = ไม่ตรงกับฉันเลย … 5 = ตรงกับฉันมาก"}
       for f, q in WS_QUESTIONS.items()]
qb = pd.DataFrame(qs)
qb.insert(0, "no", range(1, len(qb) + 1))
qb["to_feature_0_100"] = "(คำตอบ − 1) ÷ 4 × 100"
assert sorted(qb.feature) == sorted(SETS[CHOSEN])
qb.to_csv(OUT / "question_bank_general.csv", index=False)
pd.DataFrame([{"feature": f"gtask::{k}", "question_th": q, "task_keywords_regex": p} for k, q, p in GTASK]).to_csv(
    OUT / "general_task_keywords.csv", index=False)
(OUT / "summary.json").write_text(json.dumps({"chosen": CHOSEN, "questions": len(qb), "comparison": rows},
                                             ensure_ascii=False, indent=1))
print(f"\nคลังคำถามรอบที่ 4 ({CHOSEN}): {len(qb)} ข้อ → {OUT / 'question_bank_general.csv'}")
