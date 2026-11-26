"""สร้าง colab/CareerPath_train_test.ipynb — เทรนทุกโมเดลในเซลล์ให้เห็น เทียบคู่แข่ง บอกผู้ชนะ"""
import json
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
cells = []


def md(s):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n")})


def code(s):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n")})


# =====================================================================
md("""
# CareerPath AI — เทรนและเปรียบเทียบโมเดล ML ทุกตัว

Notebook นี้**เทรนทุกโมเดลให้เห็นในเซลล์** เทียบกับคู่แข่ง แล้วบอกว่าตัวไหนชนะด้วยกราฟ พร้อมอธิบายว่าแต่ละโมเดล
ใช้ข้อมูลส่วนไหนของ dataset เรา และผลลัพธ์ไปอยู่ตรงไหนบนเว็บ

| # | โมเดล | คู่แข่งที่เทียบ | ตัดสินด้วย | ใช้บนเว็บ |
|---|---|---|---|---|
| ① | Career Matching | cosine กับ centered cosine | Top-5 (val + stress val) | ส่วนหลักของการจัดอันดับ Top 5 |
| ②a | Career Classifier 910 อาชีพ | Logistic Regression, kNN, MLP | Top-5 (val + stress val) | รวมกับ ① เป็น Ensemble |
| ①+②a | Ensemble | w = 0–1 × T 4 ค่า (44 แบบ) | Top-5 (val + stress val) | **Top 5 ที่ผู้ใช้เห็น** |
| ②b | Major-group Classifier 22 กลุ่ม | LR, kNN, Random Forest, HistGB, MLP | Macro-F1 (val + stress val) | การ์ด "กลุ่มอาชีพที่เหมาะ" |
| ③ | Career Clustering | K-Means กับ Hierarchical (Ward), k = 4–30 | Silhouette (k ≥ 8) | "อาชีพใกล้เคียง" + แผนที่อาชีพ |
| — | Permutation importance | — | ความแม่นที่ลดลง | อธิบายว่าคำถามข้อไหนสำคัญ |

**กติกา:** เลือกผู้ชนะจาก **validation เท่านั้น** แล้วรายงานผลจริงบน **stress test** ซึ่งไม่ถูกใช้เลือกอะไรเลย (กันโกงตัวเอง)

> ⚠️ **ข้อมูล train/test ทั้งหมดเป็นผู้ใช้จำลอง** (โปรไฟล์อาชีพ O*NET + noise + bias) เพราะยังไม่มีเฉลยจากคนจริง
> ตัวเลขบอกได้ว่าโมเดล "ทนต่อการตอบคลาดเคลื่อน" ได้แค่ไหน ยังไม่ได้วัดว่าเหมาะกับคนจริงหรือไม่

**วิธีใช้:** `Runtime → Run all` → อัปโหลด `careerpath_ml_bundle.zip` ตอนที่ระบบถาม (ใช้ CPU ได้ ไม่ต้องใช้ GPU ทั้งหมดประมาณ 5–8 นาที)
""")

# ---------------------------------------------------------------- setup
md("## 0. เตรียมไฟล์และไลบรารี")
code("""
import os, sys, json, time, zipfile, subprocess
from pathlib import Path

IN_COLAB = "google.colab" in sys.modules
# ถ้าเก็บ zip ไว้ใน Google Drive: from google.colab import drive; drive.mount('/content/drive')
# แล้วตั้ง BUNDLE = "/content/drive/MyDrive/careerpath_ml_bundle.zip"
BUNDLE = os.environ.get("CAREERPATH_BUNDLE")
ROOT = Path("/content/careerpath") if IN_COLAB else Path(os.environ.get("CAREERPATH_ROOT", "careerpath_colab")).resolve()

if not (ROOT / "datasets/ml/train_models.py").exists():
    if BUNDLE is None:
        from google.colab import files
        print("เลือกไฟล์ careerpath_ml_bundle.zip")
        BUNDLE = next(iter(files.upload()))
    with zipfile.ZipFile(BUNDLE) as z:
        z.extractall(ROOT)

DS = ROOT / "datasets"
ML = DS / "ml"
OUT = ML / "output/general"
MODELS = OUT / "models"
print("โฟลเดอร์งาน:", ML)
""")
code("""
# scikit-learn ต้องเป็น 1.9.1 (เวอร์ชันเดียวกับ backend) — ไม่งั้นไฟล์ .joblib ที่ได้อาจใช้กับ backend ไม่ได้
if IN_COLAB:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn==1.9.1", "openpyxl"], check=True)
import numpy, pandas, scipy, sklearn, matplotlib
print("python", sys.version.split()[0], "| numpy", numpy.__version__, "| pandas", pandas.__version__,
      "| scipy", scipy.__version__, "| scikit-learn", sklearn.__version__)
if sklearn.__version__ != "1.9.1":
    print("⚠️ scikit-learn ไม่ใช่ 1.9.1 — ถ้าเพิ่งติดตั้ง ให้ Runtime → Restart session แล้วรันใหม่")
""")
code("""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from IPython.display import Image, display, Markdown
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import adjusted_rand_score, f1_score, silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
pd.set_option("display.max_colwidth", 110)
pd.set_option("display.width", 200)

# สี: ผู้ชนะ = primary ของเว็บ, คู่แข่ง = เทา
WIN, LOSE, ACCENT = "#2747D0", "#c9ccd3", "#eb6834"
plt.rcParams.update({"figure.dpi": 110, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.color": "#e6e5e0", "axes.axisbelow": True,
                     "axes.titleweight": "bold", "font.size": 10})


def run(*args):
    \"\"\"รันสคริปต์ในโฟลเดอร์ datasets/ml แล้วแสดง log ทีละบรรทัด\"\"\"
    t = time.time()
    env = {**os.environ, "PYTHONWARNINGS": "ignore", "MPLBACKEND": "Agg"}
    p = subprocess.Popen([sys.executable, *map(str, args)], cwd=ML, env=env,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        print(line, end="")
    if p.wait() != 0:
        raise RuntimeError(f"{args[0]} ล้มเหลว (exit {p.returncode})")
    print(f"✓ {args[0]} เสร็จใน {time.time() - t:.0f} วินาที\\n")


def pct(df, cols=None):
    cols = cols or [c for c in df.columns if df[c].dtype.kind == "f"]
    return df.style.format({c: "{:.1%}" for c in cols})


def bar_compare(ax, names, values, winner, title, xlabel="", fmt="{:.1%}", xmax=None, tag="★ WINNER"):
    \"\"\"กราฟแท่งแนวนอน ผู้ชนะเป็นสีน้ำเงิน + ป้าย WINNER (กราฟเวลาเทรนใช้ tag="selected" — เร็วสุดไม่ได้แปลว่าชนะ)\"\"\"
    names, values = list(names), list(values)
    y = np.arange(len(names))[::-1]
    ax.barh(y, values, color=[WIN if n == winner else LOSE for n in names], height=0.6)
    for yi, n, v in zip(y, names, values):
        ax.text(v, yi, "  " + fmt.format(v) + (f"   {tag}" if n == winner and tag else ""), va="center",
                fontsize=9, fontweight="bold" if n == winner else "normal", color=WIN if n == winner else "#444")
    ax.set_yticks(y, names)
    ax.set_xlim(0, xmax or max(values) * 1.35)
    if "%" in fmt:
        ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0], ["0%", "25%", "50%", "75%", "100%"])
    ax.set_title(title); ax.set_xlabel(xlabel); ax.grid(axis="y", visible=False)


def announce(winner, why):
    display(Markdown(f"### 🏆 ผู้ชนะ: **{winner}**\\n{why}"))
""")

# ---------------------------------------------------------------- features
md("""
## 1. Dataset ของเรา → feature 76 ข้อ

ข้อมูลตั้งต้นคือ **O*NET 910 อาชีพ** (clean แล้วใน Week 9 Data Gate → `data_gate_output/`) แต่ละไฟล์กลายเป็นคำถามส่วนไหน:

| ไฟล์ O*NET | ใช้ทำอะไร | กลายเป็น |
|---|---|---|
| Abilities (52) + Knowledge (33) + Essential Skills (10) | รวม 95 ทักษะเป็น 30 กลุ่มด้วย Ward clustering (`short_assessment.py`) | หมวด 1 กลุ่มทักษะ 30 ข้อ (`grp::`) |
| Career Interest Types | RIASEC 6 ด้าน | หมวด 2 ความสนใจ 6 ข้อ (`ri::`) |
| Task Statements | ค้นคำใน task ของแต่ละอาชีพ (keyword regex) | หมวด 3 ลักษณะงานทั่วไป 18 ข้อ (`gtask::`) + งาน IT 12 ข้อ (`task::`) |
| Work Styles | เลือก 10 นิสัยที่ตอบเองได้ | หมวด 4 นิสัย 10 ข้อ (`ws::`) |
| Occupation Data (รหัส SOC) | 2 ตัวแรกของรหัส = กลุ่มอาชีพ 22 กลุ่ม | **เฉลยของ ②b** |
| Software Skills | เครื่องมือที่อาชีพใช้ | แนะนำใน Roadmap (ไม่ได้เป็นคำถาม) |

ผลคือ **ตารางอ้างอิง R = 910 อาชีพ × 76 มิติ (0–100)** ซึ่งเป็นหัวใจของทุกโมเดล
""")
code("""
run("task_preferences.py")
run("short_assessment.py")
run("general_assessment.py")
""")
code("""
# โหลดตารางอ้างอิง 910 × 76 (วิธีเดียวกับ train_models.py --feature-set general)
DATA = DS / "data_gate_output"
features = pd.read_csv(DATA / "occupation_features.csv", index_col=0)
meta = pd.read_csv(DATA / "occupation_meta.csv", index_col=0, dtype={"major": str})
for f in [ML / "output/it_focus/occupation_task_preferences.csv",
          ML / "output/short/occupation_skill_groups.csv",
          OUT / "occupation_general_tasks.csv"]:
    features = features.join(pd.read_csv(f, index_col=0))
qb = pd.read_csv(OUT / "question_bank_general.csv")
COLS = [f for f in qb.feature if not f.startswith("ws::")] + [f for f in qb.feature if f.startswith("ws::")]

CODES = np.asarray(features.index, dtype=object)
CODE_IDX = {c: i for i, c in enumerate(CODES)}
R = features.loc[CODES, COLS].to_numpy(float)
MAJOR_OF = meta["major"].to_dict()
MAJOR_NAME = meta.drop_duplicates("major").set_index("major")["major_name"].to_dict()
TITLE = meta["Title"].to_dict()
th = pd.read_csv(DS / "onet_thai/onet_thai_titles.csv").set_index("code")["title_th"]

print(f"R = {R.shape[0]} อาชีพ × {R.shape[1]} มิติ · กลุ่มอาชีพ {len(MAJOR_NAME)} กลุ่ม")
display(pd.Series([c.split("::")[0] for c in COLS]).value_counts().rename("จำนวนข้อ").to_frame())
ex = features.loc[["29-1141.00", "15-1252.00", "35-1011.00"], COLS].T
ex.columns = [f"{th.get(c, TITLE[c])} ({TITLE[c]})" for c in ex.columns]
display(Markdown("**ตัวอย่างโปรไฟล์อาชีพ (10 ข้อแรก, 0–100)**")); display(ex.head(10).round(0))
""")

# ---------------------------------------------------------------- simulated users
md("""
## 2. สร้างผู้ใช้จำลอง (train / validation / test / stress test)

ยังไม่มีคนจริงที่รู้อาชีพเฉลย จึงสร้าง **ผู้ใช้จำลอง 1 คน = โปรไฟล์อาชีพ X + bias + noise** · เฉลย = อาชีพ X
- **noise** = ตอบคลาดเคลื่อน (SD 5–35 คะแนน) · **bias** = ประเมินตัวเองสูง/ต่ำเกินทั้งชุด (±15)
- **Augmentation:** เพิ่มผู้ใช้ที่ noise/bias หลากหลายเข้า train ให้โมเดลชินกับคนตอบไม่แม่น
- **Stress test:** 9 สถานการณ์ (noise 15/25/35 × bias 0/+15/−15) ยากกว่า test ปกติมาก ใช้เป็นตัวเลขหลัก
""")
code("""
def make_users(n_per_occ, noise_sd, bias, seed):
    r = np.random.default_rng(seed)
    U = np.repeat(R, n_per_occ, axis=0)
    n = len(U)
    sd = noise_sd if np.isscalar(noise_sd) else r.uniform(*noise_sd, size=(n, 1))
    b = bias if np.isscalar(bias) else r.uniform(*bias, size=(n, 1))
    U = U + b + r.normal(0, 1, U.shape) * sd
    return np.clip(U, 0, 100), np.repeat(CODES, n_per_occ)


# 10 คน/อาชีพ noise 15 แบ่ง 70/15/15 stratified
U0, yU0 = make_users(10, 15, 0.0, SEED)
idx = np.arange(len(U0))
i_tr, i_tmp = train_test_split(idx, test_size=0.30, stratify=yU0, random_state=SEED)
i_va, i_te = train_test_split(i_tmp, test_size=0.50, stratify=yU0[i_tmp], random_state=SEED)
X_tr0, y_tr0, X_val, y_val, X_te, y_te = U0[i_tr], yU0[i_tr], U0[i_va], yU0[i_va], U0[i_te], yU0[i_te]

X_aug, y_aug = make_users(20, noise_sd=(5, 30), bias=(-15, 15), seed=1001)
X_tr, y_tr = np.vstack([X_tr0, X_aug]), np.concatenate([y_tr0, y_aug])

SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]
scen_label = lambda sd, b: f"noise {sd}" + ("" if b == 0 else f", bias {b:+d}")


def make_stress(seed):
    Xs, ys, ss = [], [], []
    for k, (sd, b) in enumerate(SCENARIOS):
        X, y = make_users(1, sd, b, seed + k)
        Xs.append(X); ys.append(y); ss += [scen_label(sd, b)] * len(y)
    return np.vstack(Xs), np.concatenate(ys), np.asarray(ss)


X_vs, y_vs, s_vs = make_stress(2001)   # stress validation → ใช้เลือกโมเดล
X_ts, y_ts, s_ts = make_stress(3001)   # stress test → รายงานผลเท่านั้น
X_valc, y_valc = np.vstack([X_val, X_vs]), np.concatenate([y_val, y_vs])

display(pd.DataFrame([
    ["Train", len(X_tr), "6,370 (noise 15) + augmentation 18,200 (noise 5–30, bias ±15)", "เทรน ②a, ②b"],
    ["Validation", len(X_val), "noise 15", "เลือกผู้ชนะ"],
    ["Stress validation", len(X_vs), "9 สถานการณ์ × 910 (seed 2001)", "เลือกผู้ชนะ + จูน Ensemble"],
    ["Test", len(X_te), "noise 15", "วัดผล"],
    ["Stress test", len(X_ts), "9 สถานการณ์ × 910 (seed 3001)", "รายงานผลสุดท้ายเท่านั้น"],
], columns=["ชุด", "จำนวนคน", "สร้างอย่างไร", "ใช้ทำอะไร"]))
""")
code("""
# ภาพ: ผู้ใช้จำลองของ "Registered Nurses" ที่ noise ต่างกัน เทียบกับโปรไฟล์จริง
j = CODE_IDX["29-1141.00"]
fig, ax = plt.subplots(figsize=(12, 3))
ax.plot(R[j], color="black", lw=2, label="O*NET profile (truth)")
for sd, col in [(15, "#7fa7e8"), (35, ACCENT)]:
    u, _ = make_users(1, sd, 0, 7)
    ax.plot(u[j], color=col, lw=1, alpha=0.9, label=f"simulated user, noise {sd}")
ax.set_xlim(0, len(COLS) - 1); ax.set_ylabel("score 0–100"); ax.set_xlabel("76 features")
ax.set_title("Simulated user = occupation profile + noise (+ bias)"); ax.legend(frameon=False, ncol=3); plt.show()
""")
code("""
# metric: Top-1 / Top-5 / Top-5 ระดับกลุ่มอาชีพ / Macro-F1
def to_major(codes):
    return np.asarray([MAJOR_OF[c] for c in codes], dtype=object)


def metrics_from_scores(S, y):
    top = CODES[np.argsort(-S, axis=1)[:, :5]]
    tm = np.vectorize(MAJOR_OF.get)(top)
    return {"top1": float((top[:, 0] == y).mean()),
            "top5": float((top == y[:, None]).any(axis=1).mean()),
            "top5_major_group": float((tm == to_major(y)[:, None]).any(axis=1).mean()),
            "macro_f1": float(f1_score(y, top[:, 0], average="macro", labels=CODES, zero_division=0))}


SPLITS = lambda: [("val", X_val, y_val), ("stress_val", X_vs, y_vs), ("test", X_te, y_te), ("stress_test", X_ts, y_ts)]


def eval_block(score_fn, name):
    return [{"model": name, "split": s, **metrics_from_scores(score_fn(X), y)} for s, X, y in SPLITS()]


def view(rows, metrics=("top1", "top5")):
    df = pd.DataFrame(rows)
    t = df.pivot(index="model", columns="split", values=list(metrics))
    return pct(t.reindex(columns=["val", "stress_val", "test", "stress_test"], level=1), list(t.columns))


def sel_score(rows, name, metric="top5"):
    \"\"\"คะแนนที่ใช้ตัดสิน = ค่าเฉลี่ยของ val + stress val (ไม่แตะ test)\"\"\"
    return np.mean([r[metric] for r in rows if r["model"] == name and r["split"] in ("val", "stress_val")])


def get(rows, name, split, metric):
    return next(r[metric] for r in rows if r["model"] == name and r["split"] == split)


timing = {}
""")

# ---------------------------------------------------------------- ①
md("""
---
## ① Career Matching — จับคู่ผู้ใช้กับ 910 อาชีพ (ไม่ต้องเทรน)

| | |
|---|---|
| **ใช้ข้อมูลอะไรของเรา** | ตารางอ้างอิง R (910 อาชีพ × 76) ตรง ๆ — ไม่ใช้ผู้ใช้จำลองในการเรียน |
| **Input → Output** | คำตอบ 76 ข้อ → คะแนนความคล้าย 910 ค่า |
| **ใช้บนเว็บ** | ส่วนหลักของการจัดอันดับ Top 5 (หน้า Careers) + "ทำไมอาชีพนี้ขึ้นมา" (อธิบายรายคำถาม) |
| **คู่แข่ง** | **cosine** ดูทิศทางของเวกเตอร์ (รูปแบบคำตอบ) · **centered cosine** z-score ก่อน (ใช้ค่าเฉลี่ย/SD จาก train) |
""")
code("""
def l2(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)

Rn = l2(R)
mu_tr, sd_tr = X_tr.mean(0), X_tr.std(0) + 1e-9          # fit จาก train เท่านั้น
Rz = l2((R - mu_tr) / sd_tr)
match_cosine = lambda X: l2(X) @ Rn.T
match_centered = lambda X: l2((X - mu_tr) / sd_tr) @ Rz.T

M1 = {"Cosine": match_cosine, "Centered cosine": match_centered}
res1 = []
for name, fn in M1.items():
    res1 += eval_block(fn, name)
best_match_name = max(M1, key=lambda n: sel_score(res1, n))
best_match = M1[best_match_name]
display(view(res1, ("top1", "top5", "top5_major_group")))
""")
code("""
fig, axes = plt.subplots(1, 3, figsize=(15, 2.4))
bar_compare(axes[0], M1, [sel_score(res1, n) for n in M1], best_match_name, "Selection score (val + stress val, Top-5)", xmax=1.3)
bar_compare(axes[1], M1, [get(res1, n, "stress_test", "top5") for n in M1], best_match_name, "Stress test Top-5", xmax=1.3)
bar_compare(axes[2], M1, [get(res1, n, "stress_test", "top1") for n in M1], best_match_name, "Stress test Top-1", xmax=1.3)
plt.tight_layout(); plt.show()

# ทำไม: แยกตาม bias
rows = []
for n, fn in M1.items():
    S = fn(X_ts)
    for sc in pd.unique(s_ts):
        m = s_ts == sc
        rows.append({"model": n, "scenario": sc, "top5": metrics_from_scores(S[m], y_ts[m])["top5"]})
display(pct(pd.DataFrame(rows).pivot(index="scenario", columns="model", values="top5")))
announce(best_match_name, "cosine ดูแค่ **ทิศทาง** ของเวกเตอร์ คนที่ให้คะแนนตัวเองสูงหรือต่ำทั้งชุด (bias) รูปแบบคำตอบยังเหมือนเดิม "
         "จึงแม่นกว่า centered cosine ชัดเจนเมื่อมี bias ±15")
""")

# ---------------------------------------------------------------- ②a
md("""
---
## ②a Career Classifier — จำแนก 910 อาชีพ (supervised)

| | |
|---|---|
| **ใช้ข้อมูลอะไรของเรา** | ผู้ใช้จำลอง **train 24,570 คน** (X = คำตอบ 76 ข้อ, y = รหัสอาชีพ O*NET 910 คลาส) |
| **Input → Output** | คำตอบ 76 ข้อ → ความน่าจะเป็นของ 910 อาชีพ |
| **ใช้บนเว็บ** | รวมกับ ① เป็น Ensemble · ใช้ดูว่า ① กับ ②a "เห็นตรงกันไหม" ในการ์ดความมั่นใจ |
| **คู่แข่ง** | Logistic Regression · kNN (k=15) · MLP (1 ชั้นซ่อน 256 หน่วย) — ทุกตัวมี StandardScaler |

(Random Forest / Gradient Boosting ไม่เหมาะกับ 910 คลาส — แต่ละต้นต้องเก็บความน่าจะเป็น 910 ค่าทุก node ใช้หน่วยความจำหลายร้อย MB ต่อต้น จึงไปเทียบที่ ②b แทน)
""")
code("""
OCC_CANDIDATES = {
    "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=500)),
    "kNN (k=15)": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=15, weights="distance")),
    "MLP (256)": make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(256,), alpha=1e-3,
                                                               early_stopping=True, max_iter=200, random_state=SEED)),
}


def proba_aligned(model, X):
    P = model.predict_proba(X)
    out = np.zeros((len(X), len(CODES)))
    out[:, [CODE_IDX[c] for c in model.classes_]] = P
    return out


res2a, occ_models = [], {}
for name, mdl in OCC_CANDIDATES.items():
    print(f"⏳ เทรน {name} บน {len(X_tr):,} คน × {X_tr.shape[1]} ข้อ → 910 คลาส ...", end=" ", flush=True)
    t = time.time(); mdl.fit(X_tr, y_tr); timing[f"②a {name}"] = round(time.time() - t, 1)
    print(f"{timing[f'②a {name}']} วินาที")
    occ_models[name] = mdl
    res2a += eval_block(lambda X, m=mdl: proba_aligned(m, X), name)

best_occ_name = max(OCC_CANDIDATES, key=lambda n: sel_score(res2a, n))
best_occ = occ_models[best_occ_name]
display(view(res2a, ("top1", "top5", "macro_f1")))
""")
code("""
names = list(OCC_CANDIDATES)
fig, axes = plt.subplots(1, 4, figsize=(18, 2.6))
bar_compare(axes[0], names, [sel_score(res2a, n) for n in names], best_occ_name, "Selection (val + stress val, Top-5)", xmax=1.4)
bar_compare(axes[1], names, [get(res2a, n, "stress_test", "top5") for n in names], best_occ_name, "Stress test Top-5", xmax=1.4)
bar_compare(axes[2], names, [get(res2a, n, "stress_test", "macro_f1") for n in names], best_occ_name, "Stress test Macro-F1", xmax=1.4)
bar_compare(axes[3], names, [timing[f"②a {n}"] for n in names], best_occ_name, "Training time (blue = selected)", "seconds", fmt="{:.1f}s", tag="selected")
plt.tight_layout(); plt.show()

mlp = best_occ[-1] if hasattr(best_occ, "steps") else None
if mlp is not None and hasattr(mlp, "loss_curve_"):
    fig, ax = plt.subplots(1, 2, figsize=(12, 2.8))
    ax[0].plot(mlp.loss_curve_, color=WIN); ax[0].set_title("MLP training loss"); ax[0].set_xlabel("epoch")
    ax[1].plot(mlp.validation_scores_, color=ACCENT); ax[1].set_title("MLP early-stopping validation accuracy"); ax[1].set_xlabel("epoch")
    plt.tight_layout(); plt.show()
announce(best_occ_name, "ดีที่สุดในกลุ่ม classifier ทุก metric บน stress test · แต่ยังแม่นน้อยกว่า ① เพราะเรียนจากผู้ใช้จำลองที่สร้างจากโปรไฟล์ชุดเดียวกับที่ ① ใช้ตรง ๆ "
         "— จึงใช้เป็น **ตัวเสริม** ใน Ensemble ไม่ใช่ตัวหลัก")
""")

# ---------------------------------------------------------------- Ensemble
md("""
---
## Ensemble ① + ②a — ตัวที่จัดอันดับ Top 5 จริงบนเว็บ

| | |
|---|---|
| **สูตร** | `score = w · softmax(cosine / T) + (1 − w) · P(MLP)` |
| **จูนค่า** | grid search w ∈ {0, 0.1, …, 1} × T ∈ {0.005, 0.01, 0.02, 0.05} บน validation + stress validation (9,555 คน) |
| **คู่แข่ง** | w = 1 (① อย่างเดียว) · w = 0 (②a อย่างเดียว) · ค่าผสมทั้งหมด 44 แบบ |
| **ใช้บนเว็บ** | Top 5 ในหน้า Careers · อันดับในหน้า "อาชีพที่อยากเป็น" · อันดับในการ์ด "สาขาที่จบ" · ความมั่นใจ |
""")
code("""
def softmax(S, T):
    Z = (S - S.max(1, keepdims=True)) / T
    E = np.exp(Z)
    return E / E.sum(1, keepdims=True)


Sm_val, Pc_val = best_match(X_valc), proba_aligned(best_occ, X_valc)
grid = []
for T in (0.005, 0.01, 0.02, 0.05):
    Pm = softmax(Sm_val, T)
    for w in np.round(np.arange(0, 1.01, 0.1), 1):
        grid.append({"T": T, "w_matching": w, **metrics_from_scores(w * Pm + (1 - w) * Pc_val, y_valc)})
grid = pd.DataFrame(grid)
best = grid.sort_values(["top5", "top1"], ascending=False).iloc[0]
ENS_T, ENS_W = float(best["T"]), float(best["w_matching"])
ensemble_scores = lambda X: ENS_W * softmax(best_match(X), ENS_T) + (1 - ENS_W) * proba_aligned(best_occ, X)
print(f"ดีที่สุด: w = {ENS_W}, T = {ENS_T} (validation Top-5 {best['top5']:.1%})")

fig, axes = plt.subplots(1, 2, figsize=(16, 3.4), gridspec_kw={"width_ratios": [1.4, 1]})
hm = grid.pivot(index="T", columns="w_matching", values="top5")
im = axes[0].imshow(hm.values * 100, cmap="Blues", aspect="auto")
axes[0].set_xticks(range(hm.shape[1]), [f"{w:.1f}" for w in hm.columns]); axes[0].set_yticks(range(hm.shape[0]), hm.index)
for i in range(hm.shape[0]):
    for k in range(hm.shape[1]):
        v = hm.values[i, k] * 100
        star = hm.index[i] == ENS_T and hm.columns[k] == ENS_W
        axes[0].text(k, i, f"{v:.1f}" + ("★" if star else ""), ha="center", va="center", fontsize=8,
                     fontweight="bold" if star else "normal", color="white" if v > np.median(hm.values) * 100 else "black")
axes[0].set_xlabel("w  (0 = MLP only · 1 = cosine only)"); axes[0].set_ylabel("softmax T"); axes[0].grid(False)
axes[0].set_title("Grid search: validation Top-5 (%)  ★ = chosen")
for T, g in grid.groupby("T"):
    axes[1].plot(g.w_matching, g.top5 * 100, marker="o", ms=3, label=f"T={T}", color=WIN if T == ENS_T else None, lw=2.5 if T == ENS_T else 1)
axes[1].axvline(ENS_W, color=WIN, ls="--", lw=1); axes[1].set_xlabel("w"); axes[1].set_ylabel("Top-5 (%)")
axes[1].set_title("Top-5 vs weight w"); axes[1].legend(frameon=False, fontsize=8)
plt.tight_layout(); plt.show()
""")
code("""
# ศึกชิง Top 5: ① อย่างเดียว vs ②a อย่างเดียว vs Ensemble (บน stress test ที่ไม่เคยใช้เลือก)
resE = eval_block(ensemble_scores, "Ensemble")
final = {best_match_name + " only": (res1, best_match_name), best_occ_name + " only": (res2a, best_occ_name), "Ensemble": (resE, "Ensemble")}
fig, axes = plt.subplots(1, 3, figsize=(17, 2.4))
for ax, (split, metric, title) in zip(axes, [("stress_test", "top5", "Stress test Top-5"), ("stress_test", "top1", "Stress test Top-1"),
                                              ("test", "top5", "Test (noise 15) Top-5")]):
    bar_compare(ax, final, [get(r, n, split, metric) for r, n in final.values()], "Ensemble", title, xmax=1.4)
plt.tight_layout(); plt.show()
display(view(res1 + res2a + resE, ("top1", "top5")))
""")
code("""
# Ensemble แยก 9 สถานการณ์ — noise หรือ bias กระทบมากกว่ากัน
S_all = ensemble_scores(X_ts)
sc_rows = []
for sd, b in SCENARIOS:
    m = s_ts == scen_label(sd, b)
    sc_rows.append({"noise": sd, "bias": b, **metrics_from_scores(S_all[m], y_ts[m])})
sc = pd.DataFrame(sc_rows)
hm = sc.pivot(index="noise", columns="bias", values="top5")[[-15, 0, 15]]
fig, ax = plt.subplots(figsize=(5.5, 3))
im = ax.imshow(hm.values * 100, cmap="Blues", vmin=50, vmax=100)
for i in range(3):
    for k in range(3):
        ax.text(k, i, f"{hm.values[i, k]:.1%}", ha="center", va="center", color="white" if hm.values[i, k] > 0.8 else "black")
ax.set_xticks(range(3), ["bias -15", "bias 0", "bias +15"]); ax.set_yticks(range(3), [f"noise {n}" for n in hm.index])
ax.set_title("Ensemble Top-5 on stress test"); ax.grid(False); plt.show()
announce(f"Ensemble (w = {ENS_W}, T = {ENS_T})",
         f"ชนะทั้ง ① อย่างเดียวและ ②a อย่างเดียวบน stress test (Top-5 {get(resE, 'Ensemble', 'stress_test', 'top5'):.1%}) · "
         "จากตาราง noise (ตอบคลาดเคลื่อน) กระทบความแม่นมากกว่า bias (ประเมินตัวเองสูง/ต่ำเกิน)")
""")

# ---------------------------------------------------------------- ②b
md("""
---
## ②b Major-group Classifier — ทาย 22 กลุ่มอาชีพ SOC (supervised)

| | |
|---|---|
| **ใช้ข้อมูลอะไรของเรา** | ผู้ใช้จำลอง train 24,570 คน แต่ **เฉลย = กลุ่มอาชีพ** (2 ตัวแรกของรหัส SOC จาก Occupation Data เช่น 29 = Healthcare Practitioners) |
| **Input → Output** | คำตอบ 76 ข้อ → ความน่าจะเป็นของ 22 กลุ่ม |
| **ใช้บนเว็บ** | การ์ด "กลุ่มอาชีพที่เหมาะ" (3 อันดับ) ในหน้า Careers — มองภาพกว้างก่อนดูอาชีพย่อย |
| **คู่แข่ง** | Logistic Regression · kNN (k=15) · Random Forest (200 ต้น) · HistGradientBoosting · MLP (256) |
| **ตัดสินด้วย** | Macro-F1 (val + stress val) — ให้ทุกกลุ่มสำคัญเท่ากัน แม้กลุ่มเล็กอย่าง Farming |
""")
code("""
ym_tr, ym_val, ym_te, ym_vs, ym_ts = map(to_major, (y_tr, y_val, y_te, y_vs, y_ts))
GRP_CANDIDATES = {
    "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000)),
    "kNN (k=15)": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=15, weights="distance")),
    "Random Forest": RandomForestClassifier(n_estimators=200, min_samples_leaf=3, n_jobs=-1, random_state=SEED),
    "HistGradientBoosting": HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, early_stopping=True, random_state=SEED),
    "MLP (256)": make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(256,), alpha=1e-3,
                                                               early_stopping=True, max_iter=200, random_state=SEED)),
}
res2b, grp_models = [], {}
for name, mdl in GRP_CANDIDATES.items():
    print(f"⏳ เทรน {name} → 22 กลุ่ม ...", end=" ", flush=True)
    t = time.time(); mdl.fit(X_tr, ym_tr); timing[f"②b {name}"] = round(time.time() - t, 1)
    print(f"{timing[f'②b {name}']} วินาที")
    grp_models[name] = mdl
    for split, X, y in [("val", X_val, ym_val), ("stress_val", X_vs, ym_vs), ("test", X_te, ym_te), ("stress_test", X_ts, ym_ts)]:
        P = mdl.predict_proba(X)
        top3 = mdl.classes_[np.argsort(-P, axis=1)[:, :3]]
        res2b.append({"model": name, "split": split, "accuracy": float((top3[:, 0] == y).mean()),
                      "top3": float((top3 == y[:, None]).any(axis=1).mean()),
                      "macro_f1": float(f1_score(y, top3[:, 0], average="macro", zero_division=0))})
best_grp_name = max(GRP_CANDIDATES, key=lambda n: sel_score(res2b, n, "macro_f1"))
best_grp = grp_models[best_grp_name]
display(view(res2b, ("accuracy", "top3", "macro_f1")))
""")
code("""
names = list(GRP_CANDIDATES)
fig, axes = plt.subplots(1, 4, figsize=(19, 3))
bar_compare(axes[0], names, [sel_score(res2b, n, "macro_f1") for n in names], best_grp_name, "Selection (val + stress val, Macro-F1)", xmax=1.4)
bar_compare(axes[1], names, [get(res2b, n, "stress_test", "accuracy") for n in names], best_grp_name, "Stress test accuracy", xmax=1.4)
bar_compare(axes[2], names, [get(res2b, n, "stress_test", "top3") for n in names], best_grp_name, "Stress test Top-3", xmax=1.4)
bar_compare(axes[3], names, [timing[f"②b {n}"] for n in names], best_grp_name, "Training time (blue = selected)", "seconds", fmt="{:.1f}s", tag="selected")
plt.tight_layout(); plt.show()

# ผู้ชนะแม่นกับกลุ่มอาชีพไหน / พลาดกลุ่มไหน (stress test)
pred = best_grp.predict(X_ts)
per = pd.DataFrame({"y": ym_ts, "ok": pred == ym_ts}).groupby("y").ok.mean().sort_values()
fig, ax = plt.subplots(figsize=(10, 5.5))
ax.barh([f"{MAJOR_NAME[m]} ({m})" for m in per.index], per.values * 100, color=[ACCENT if v < 0.6 else WIN for v in per.values])
ax.axvline(per.mean() * 100, color="black", ls="--", lw=1); ax.set_xlabel("accuracy (%)")
ax.set_title(f"{best_grp_name}: accuracy by major group (stress test) — orange < 60%"); ax.grid(axis="y", visible=False)
plt.tight_layout(); plt.show()
announce(best_grp_name, "ชนะทุก metric ทั้งที่ง่ายที่สุดและเทรนแทบไม่ใช้เวลา — 22 กลุ่มเป็นก้อนในพื้นที่ 76 มิติที่ชัดพอ "
         "การดูเพื่อนบ้านใกล้ที่สุด 15 คนจึงได้ผลดีกว่าการลากเส้นแบ่ง (LR) หรือต้นไม้ (RF/HistGB)")
""")

# ---------------------------------------------------------------- ③
md("""
---
## ③ Career Clustering — จัดกลุ่ม 910 อาชีพ (unsupervised)

| | |
|---|---|
| **ใช้ข้อมูลอะไรของเรา** | ตารางอ้างอิง R 910 อาชีพ × 76 (StandardScaler) — **ไม่มีเฉลย จึงไม่มี train/test** |
| **Output** | หมายเลขกลุ่มของแต่ละอาชีพ + พิกัด PCA 2 มิติ |
| **ใช้บนเว็บ** | "อาชีพใกล้เคียงในคลัสเตอร์เดียวกัน" ในหน้า Careers |
| **คู่แข่ง** | K-Means กับ Hierarchical (Ward) ที่ k = 4–30 |
| **ตัดสินด้วย** | Silhouette สูงสุดในช่วง k ≥ 8 (k น้อยกว่านี้กลุ่มกว้างเกินไปสำหรับหาอาชีพใกล้เคียง) · ตรวจกับกลุ่ม SOC ด้วย ARI |
""")
code("""
Rs = StandardScaler().fit_transform(R)
ks = list(range(4, 31))
sil = {"K-Means": [], "Hierarchical (Ward)": []}
t = time.time()
for k in ks:
    sil["K-Means"].append(silhouette_score(Rs, KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Rs).labels_))
    sil["Hierarchical (Ward)"].append(silhouette_score(Rs, AgglomerativeClustering(n_clusters=k, linkage="ward").fit(Rs).labels_))
print(f"ลอง {len(ks)} ค่า k × 2 อัลกอริทึม ใน {time.time() - t:.0f} วินาที")
sil_df = pd.DataFrame({"k": ks, **sil})
cand = sil_df[sil_df.k >= 8]
best_alg = max(sil, key=lambda a: cand[a].max())
K = int(cand.loc[cand[best_alg].idxmax(), "k"])
labels = (KMeans(n_clusters=K, n_init=10, random_state=SEED) if best_alg == "K-Means"
          else AgglomerativeClustering(n_clusters=K, linkage="ward")).fit(Rs).labels_
ari = adjusted_rand_score(to_major(CODES), labels)

fig, axes = plt.subplots(1, 2, figsize=(15, 3.2), gridspec_kw={"width_ratios": [1.6, 1]})
axes[0].axvspan(3.5, 7.5, color="#f1f0ec", zorder=0); axes[0].text(5.5, min(min(v) for v in sil.values()), "too coarse", ha="center", fontsize=8, color="gray")
for a, v in sil.items():
    axes[0].plot(ks, v, marker="o", ms=3, color=WIN if a == best_alg else LOSE, lw=2.5 if a == best_alg else 1.5, label=a)
axes[0].scatter([K], [cand[best_alg].max()], s=160, marker="*", color=ACCENT, zorder=5, label=f"chosen k={K}")
axes[0].set_xlabel("k"); axes[0].set_ylabel("silhouette"); axes[0].set_title("Silhouette vs k"); axes[0].legend(frameon=False)
bar_compare(axes[1], list(sil), [cand[a].max() for a in sil], best_alg, "Best silhouette (k ≥ 8)", fmt="{:.3f}")
plt.tight_layout(); plt.show()
print(f"silhouette = {cand[best_alg].max():.3f} · ARI เทียบกลุ่มอาชีพ SOC = {ari:.3f}")
""")
code("""
# แผนที่อาชีพ PCA 2 มิติ สีตามคลัสเตอร์ + ชื่อกลุ่มอัตโนมัติจาก feature เด่น 3 ตัว
pca = PCA(n_components=2, random_state=SEED).fit(Rs)
XY = pca.transform(Rs)
Z = pd.DataFrame(Rs, index=CODES, columns=COLS)
clu_rows = []
for c in range(K):
    members = CODES[labels == c]
    d = ((Z.loc[members] - Z.loc[members].mean()) ** 2).sum(axis=1)
    clu_rows.append({"cluster": c, "size": len(members),
                     "signature": " · ".join(f.split("::")[1] for f in Z.loc[members].mean().nlargest(3).index),
                     "top_major_group": pd.Series(to_major(members)).map(MAJOR_NAME).value_counts().index[0],
                     "ตัวอย่าง (ใกล้ศูนย์กลาง)": " | ".join(th.get(m, TITLE[m]) for m in d.nsmallest(3).index)})
clu_info = pd.DataFrame(clu_rows).sort_values("size", ascending=False)

fig, ax = plt.subplots(figsize=(11, 6.5))
cmap = plt.get_cmap("tab10")
for c in range(K):
    m = labels == c
    ax.scatter(XY[m, 0], XY[m, 1], s=10, color=cmap(c % 10), alpha=0.7,
               label=f"{c}: {clu_info.set_index('cluster').loc[c, 'signature']} ({m.sum()})")
for code_, short, off in [("29-1141.00", "Registered Nurses", (4, -10)), ("15-1252.00", "Software Developers", (4, 6)),
                          ("25-2021.00", "Elementary Teachers", (4, -10)), ("47-2111.00", "Electricians", (4, 3)),
                          ("35-2014.00", "Cooks", (4, 3)), ("13-2011.00", "Accountants", (-60, 6)),
                          ("53-3032.00", "Truck Drivers", (4, 3))]:
    i = CODE_IDX[code_]
    ax.scatter(*XY[i], s=40, facecolors="none", edgecolors="black", lw=1)
    ax.annotate(short, XY[i], fontsize=8, fontweight="bold", xytext=off, textcoords="offset points")
ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]:.0%})"); ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]:.0%})")
ax.set_title(f"Career map: 910 occupations, {best_alg} k={K}"); ax.legend(frameon=False, fontsize=7.5, loc="center left", bbox_to_anchor=(1, 0.5))
plt.tight_layout(); plt.show()
display(clu_info)
announce(f"{best_alg}, k = {K}", f"silhouette สูงกว่า Ward ในช่วง k ≥ 8 · ARI {ari:.2f} = กลุ่มที่ได้สอดคล้องกับหมวดอาชีพ SOC พอสมควร "
         f"· silhouette ต่ำ ({cand[best_alg].max():.2f}) เพราะอาชีพกระจายต่อเนื่อง ไม่ได้เป็นก้อนชัด จึง**ใช้แค่หาอาชีพใกล้เคียง ไม่ได้ใช้จัดอันดับ**")
""")

# ---------------------------------------------------------------- importance
md("""
---
## Permutation importance — คำถามข้อไหนที่โมเดลพึ่งมากที่สุด

| | |
|---|---|
| **ใช้ข้อมูลอะไรของเรา** | validation 1,365 คน + โมเดล ②a ที่ชนะ |
| **วิธี** | สุ่มสลับคำตอบข้อ j ระหว่างคน (ทำ 3 รอบ) แล้ววัดว่า Top-5 ลดลงเท่าไร — ลดมาก = ข้อนั้นสำคัญ |
| **ใช้ทำอะไร** | ตรวจว่าคำถามข้อไหนแทบไม่มีผล (ตัดได้) / อธิบายในสไลด์ว่าโมเดลดูอะไร |
""")
code("""
rng = np.random.default_rng(SEED)
base_top5 = metrics_from_scores(proba_aligned(best_occ, X_val), y_val)["top5"]
imp = []
t = time.time()
for j, col in enumerate(COLS):
    drops = []
    for _ in range(3):
        Xp = X_val.copy(); Xp[:, j] = rng.permutation(Xp[:, j])
        drops.append(base_top5 - metrics_from_scores(proba_aligned(best_occ, Xp), y_val)["top5"])
    imp.append({"feature": col, "domain": col.split("::")[0], "importance_top5_drop": float(np.mean(drops)), "std": float(np.std(drops))})
imp_df = pd.DataFrame(imp).sort_values("importance_top5_drop", ascending=False)
qtext = qb.set_index("feature")["question_th"]
print(f"{len(COLS)} ข้อ × 3 รอบ ใน {time.time() - t:.0f} วินาที")

dom_col = {"grp": WIN, "ri": "#1baf7a", "gtask": ACCENT, "task": "#7b5cd6", "ws": "#8a8984"}
top = imp_df.head(20)[::-1]
fig, ax = plt.subplots(figsize=(10, 6))
ax.barh(top.feature, top.importance_top5_drop * 100, xerr=top["std"] * 100, color=[dom_col[d] for d in top.domain])
from matplotlib.patches import Patch
ax.legend(handles=[Patch(color=c, label=d) for d, c in dom_col.items()], frameon=False, loc="lower right")
ax.set_xlabel("Top-5 drop when shuffled (percentage points)"); ax.set_title("Permutation importance — top 20 of 76 questions"); ax.grid(axis="y", visible=False)
plt.tight_layout(); plt.show()
display(imp_df.head(10).assign(คำถาม=lambda d: d.feature.map(qtext)).style.format({"importance_top5_drop": "{:.2%}", "std": "{:.2%}"}))
""")

# ---------------------------------------------------------------- scoreboard
md("---\n## 🏁 สรุปผู้ชนะทุกสนาม")
code("""
board = pd.DataFrame([
    ["① Career Matching", " vs ".join(M1), best_match_name, f"Top-5 {get(res1, best_match_name, 'stress_test', 'top5'):.1%}",
     "R 910 × 76 (ไม่เทรน)", "จัดอันดับ Top 5 (น้ำหนัก w) + อธิบายรายคำถาม"],
    ["②a อาชีพ 910 คลาส", " vs ".join(OCC_CANDIDATES), best_occ_name, f"Top-5 {get(res2a, best_occ_name, 'stress_test', 'top5'):.1%}",
     "ผู้ใช้จำลอง 24,570 · y = อาชีพ", "เสริม ① ใน Ensemble + การ์ดความมั่นใจ"],
    ["Ensemble ① + ②a", "44 ค่า (w × T)", f"w={ENS_W}, T={ENS_T}", f"Top-5 {get(resE, 'Ensemble', 'stress_test', 'top5'):.1%} · Top-1 {get(resE, 'Ensemble', 'stress_test', 'top1'):.1%}",
     "val + stress val 9,555", "Top 5 หน้า Careers / อาชีพที่อยากเป็น / สาขาที่จบ"],
    ["②b กลุ่มอาชีพ 22 กลุ่ม", " vs ".join(GRP_CANDIDATES), best_grp_name, f"Acc {get(res2b, best_grp_name, 'stress_test', 'accuracy'):.1%} · Top-3 {get(res2b, best_grp_name, 'stress_test', 'top3'):.1%}",
     "ผู้ใช้จำลอง 24,570 · y = กลุ่ม SOC", "การ์ดกลุ่มอาชีพที่เหมาะ"],
    ["③ Clustering", "K-Means vs Ward (k 4–30)", f"{best_alg} k={K}", f"silhouette {cand[best_alg].max():.3f} · ARI {ari:.3f}",
     "R 910 × 76 (ไม่มีเฉลย)", "อาชีพใกล้เคียง"],
], columns=["สนาม", "ผู้เข้าแข่งขัน", "🏆 ผู้ชนะ", "ผลบน stress test", "ข้อมูลที่ใช้เรียน", "ใช้บนเว็บ"])
display(board)
""")
code("""
# กราฟรวม: ทุกโมเดลที่เทรนในสนามจับคู่ 910 อาชีพ บน stress test
allr = res1 + res2a + resE
names = [best_match_name] + [n for n in M1 if n != best_match_name] + list(OCC_CANDIDATES) + ["Ensemble"]
group = {**{n: "①" for n in M1}, **{n: "②a" for n in OCC_CANDIDATES}, "Ensemble": "①+②a"}
vals = [get(allr, n, "stress_test", "top5") for n in names]
order = np.argsort(vals)[::-1]
fig, ax = plt.subplots(figsize=(10, 3.4))
bar_compare(ax, [f"{group[names[i]]}  {names[i]}" for i in order], [vals[i] for i in order], "①+②a  Ensemble",
            "All 910-occupation models — stress test Top-5", xmax=1.25)
plt.tight_layout(); plt.show()
""")

# ---------------------------------------------------------------- save for backend
md("""
---
## 3. บันทึกโมเดลสำหรับ backend + ประเมินหลายชั้น

เซลล์ข้างบนเทรนให้เห็นทีละขั้น ส่วนนี้รันสคริปต์จริงของโปรเจกต์ (`train_models.py`) เพื่อบันทึกไฟล์โมเดลในรูปแบบที่ backend อ่านได้
(`output/general/models/`) แล้วเช็กว่าตัวเลขตรงกับที่เทรนในเซลล์ — seed ตายตัวทุกจุด ควรได้เท่ากัน
""")
code("""
run("train_models.py", "--feature-set", "general", "--out", "output/general")
run("major_crosswalk.py")          # สาขาที่จบ → อาชีพ (ตาราง CIP–SOC ของ NCES ไม่ต้องเทรน)
run("calibrate_confidence.py")     # ความมั่นใจ: ผู้ใช้จำลองชุดใหม่ 8,190 คน ตอบ 1–5
run("evaluation/evaluate.py")      # persona 28 แบบ · ความเสถียร · counterfactual
""")
code("""
# เช็ก: เซลล์ในนี้ = สคริปต์โปรเจกต์ = ผลเดิมใน reference/
summary = json.loads((OUT / "summary.json").read_text())
script = {(r["model"], r["split"]): r["top5"] for r in summary["occupation_results"]}
ref_p = ROOT / "reference/summary.json"
ref = {(r["model"], r["split"]): r["top5"] for r in json.loads(ref_p.read_text())["occupation_results"]} if ref_p.exists() else {}
alias = {"Cosine": "① Matching — cosine (baseline)", "Centered cosine": "① Matching — centered cosine",
         **{n: f"②a Classifier — {n}" for n in OCC_CANDIDATES}, "Ensemble": "Ensemble ① + ②a"}
chk = pd.DataFrame([{"model": n, "notebook": r["top5"], "train_models.py": script.get((alias[n], "stress_test")),
                     "ผลเดิม (reference)": ref.get((alias[n], "stress_test"))}
                    for r in allr if r["split"] == "stress_test" for n in [r["model"]]])
display(pct(chk))
diff = (chk["notebook"] - chk["train_models.py"]).abs().max()
print("✓ ตรงกันทั้งหมด" if diff < 1e-3 else f"⚠️ ต่างกันสูงสุด {diff:.4f}")
""")
code("""
cal = json.loads((MODELS / "confidence_calibration.json").read_text())
display(Markdown(f"**ความมั่นใจ (calibration):** {cal['note']} · รวม Top-1 {cal['overall']['top1']:.1%}, Top-5 {cal['overall']['top5']:.1%}"))
display(pct(pd.DataFrame(cal["bins"]), ["top1", "top5"]))

rep = json.loads((OUT / "evaluation/report.json").read_text())
ps = rep["personas"]
rows = [{"เกณฑ์": k, **{m: ps[k][m] for m in ("hit_at_1", "hit_at_5", "hit_at_10")}} for k in ("strict", "soc")]
rows += [{"เกณฑ์": f"soc · {g} ({h['n']} แบบ)", **{m: h["soc"][m] for m in ("hit_at_1", "hit_at_5", "hit_at_10")}} for g, h in ps["by_group"].items()]
display(Markdown(f"**Persona {ps['n']} แบบ** (ร่างโดย Claude — ควรให้ผู้รู้ตรวจ) · ②b ทายกลุ่มอาชีพถูก {ps['major_group_top1']:.0%}"))
display(pct(pd.DataFrame(rows), ["hit_at_1", "hit_at_5", "hit_at_10"]))
display(pd.DataFrame([{"persona": r["id"], "ชื่อ": r["name"], "อันดับ strict": r["rank_strict"], "อันดับ soc": r["rank_soc"],
                       "อันดับ 1 ที่โมเดลให้": th.get(r["top5"][0]["code"], r["top5"][0]["title"])} for r in ps["rows"]]))
s, m = rep["stability"], rep["monotonic"]
print(f"ความเสถียร: เปลี่ยน {s['changed_answers']} ข้อ → Top5 ซ้ำเฉลี่ย {s['top5_overlap_mean']:.0%} · อันดับ 1 คงเดิม {s['top1_unchanged_rate']:.0%}")
print(f"ปิด Gap แล้วทักษะครอบคลุมไม่ลด: {m['coverage_not_decreased_rate']:.0%}")
""")

# ---------------------------------------------------------------- demo
md("""
---
## 4. Demo: ใช้โมเดลที่เพิ่งบันทึกผ่าน `CareerPredictor` (ตัวเดียวกับ backend)
เปลี่ยน `PERSONA` ได้ เช่น `nurse`, `teacher`, `chef`, `mechanic`, `data_scientist`
""")
code("""
sys.path[:0] = [str(ML), str(ML / "evaluation")]
from predict import CareerPredictor
from evaluate import persona_answers, to_vector

p = CareerPredictor(MODELS)
personas = {x["id"]: x for x in json.loads((ML / "evaluation/personas.json").read_text())["personas"]}
print("persona ที่มี:", ", ".join(personas))

PERSONA = "nurse"
ps_ = personas[PERSONA]
user = to_vector(persona_answers(p, ps_))          # คำตอบ 1–5 → 0–100 ตาม feature_order 76 ข้อ
res = p.recommend(user, k=5)
c = res["confidence"]
display(Markdown(f"**{ps_['name']}** · ความมั่นใจ: {c['level']} (ผู้ใช้จำลองที่คะแนนช่วงนี้ อันดับ 1 ถูก {c['sim_top1_accuracy']:.0%})"))
top = pd.DataFrame(res["careers"])
top.insert(2, "ชื่อไทย", top.code.map(th))
display(top[["rank", "code", "ชื่อไทย", "title", "ensemble_score", "matching_similarity", "classifier_probability", "skill_coverage_percent", "cluster"]]
        .rename(columns={"ensemble_score": "Ensemble", "matching_similarity": "① cosine", "classifier_probability": "②a MLP", "cluster": "③ cluster"}))
display(Markdown("**②b กลุ่มอาชีพที่เหมาะ:** " + " · ".join(f"{MAJOR_NAME[g['major']]} {g['probability']:.0%}" for g in res["major_groups"])))
""")
code("""
code_ = res["careers"][0]["code"]
gap = p.skill_gap(user, code_, k=10)
display(Markdown(f"**Skill Gap → {th.get(code_, gap['title'])}:** ผ่านเกณฑ์ {gap['skills_met']}/{gap['skills_total']} กลุ่มทักษะ · เครื่องมือ: {', '.join(gap['tools_used']) or '-'}"))
display(pd.DataFrame(gap["top_priorities"])[["name", "user", "required", "gap", "priority"]])
display(Markdown("**③ อาชีพใกล้เคียง:** " + " · ".join(f"{th.get(s['code'], s['title'])}" for s in p.similar_careers(code_))))
""")

md("## ดาวน์โหลดโมเดลและผลลัพธ์ทั้งหมด")
code("""
import shutil
z = shutil.make_archive(str(ROOT / "careerpath_output_general"), "zip", OUT)
print(z, f"{Path(z).stat().st_size / 1e6:.1f} MB")
if IN_COLAB:
    from google.colab import files
    files.download(z)
""")

nb = {"cells": cells, "metadata": {"colab": {"provenance": [], "name": "CareerPath_train_test.ipynb"},
                                   "kernelspec": {"display_name": "Python 3", "name": "python3"},
                                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 0}
OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1))
print("→", OUT, len(cells), "cells")
