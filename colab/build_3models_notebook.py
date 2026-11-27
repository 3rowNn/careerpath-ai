"""
สร้าง colab/CareerPath_3models.ipynb + colab/careerpath_3models_data.zip
notebook สั้นสำหรับศึกษา 3 โมเดลหลัก: ① Cosine · ②a MLP · ③ K-Means (+ Ensemble ①+②a)
ใช้ seed / ลำดับข้อมูลเดียวกับ datasets/ml/train_models.py --feature-set general → ผลต้องตรงกับ summary.json

รัน (จาก root ของโปรเจกต์):  python3 colab/build_3models_notebook.py
"""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "datasets/ml/output/general"
OUT_NB = ROOT / "colab/CareerPath_3models.ipynb"
OUT_ZIP = ROOT / "colab/careerpath_3models_data.zip"

cells = []


def md(s):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n")})


def code(s):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n")})


md(r"""
# CareerPath AI — 3 โมเดลหลัก: Cosine · MLP · K-Means

แนะนำอาชีพจาก **910 อาชีพ (O*NET)** ด้วยคำตอบแบบประเมิน **76 ข้อ** (คะแนน 0–100 ต่อข้อ)

| # | โมเดล | ชนิด | ทำอะไร |
|---|---|---|---|
| ① | Cosine Similarity | ไม่ต้องเทรน | เทียบเวกเตอร์ผู้ใช้กับโปรไฟล์ 910 อาชีพ |
| ②a | MLP (256) | Supervised | ทายอาชีพจาก 910 คลาส |
| ①+②a | Ensemble | จูนค่า | 0.9 × softmax(①) + 0.1 × ②a → **Top 5 ที่เว็บแสดง** |
| ③ | K-Means | Unsupervised | จัดกลุ่ม 910 อาชีพ → "อาชีพใกล้เคียง" |

**วิธีใช้:** `Runtime → Run all` → อัปโหลด `careerpath_3models_data.zip` ตอนระบบถาม (CPU พอ ~3–5 นาที)

> ⚠️ ข้อมูล train/test เป็น **ผู้ใช้จำลอง** = โปรไฟล์อาชีพ + noise (ตอบคลาดเคลื่อน) + bias (ประเมินตัวเองสูง/ต่ำเกิน)
> เพราะยังไม่มีเฉลยจากคนจริง — ตัวเลขบอกว่า "ทนต่อการตอบคลาดเคลื่อนแค่ไหน" ไม่ใช่ความแม่นกับคนจริง
>
> seed และลำดับข้อมูลเหมือน `datasets/ml/train_models.py` ทุกขั้น — เซลล์สุดท้ายเทียบกับผลของโปรเจกต์ให้
""")

md("## 0. เตรียมไฟล์และไลบรารี")
code(r"""
import os, sys, json, time, zipfile, subprocess
from pathlib import Path

IN_COLAB = "google.colab" in sys.modules
if IN_COLAB:
    # 1.9.1 = เวอร์ชันที่โปรเจกต์ใช้เทรน (ผลจะตรงกับ summary.json)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn==1.9.1"], check=True)

DATA = Path("/content/careerpath_3models") if IN_COLAB else Path(os.environ.get("CAREERPATH_3M_DIR", "careerpath_3models")).resolve()
if not (DATA / "reference_vectors.csv").exists():
    zip_path = os.environ.get("CAREERPATH_3M_ZIP")
    if zip_path is None:
        from google.colab import files
        print("เลือกไฟล์ careerpath_3models_data.zip")
        zip_path = next(iter(files.upload()))
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(DATA)

import numpy as np, pandas as pd, sklearn
import matplotlib.pyplot as plt   # ข้อความในกราฟเป็นภาษาอังกฤษ: ฟอนต์เริ่มต้นของ matplotlib/Colab ไม่มีภาษาไทย
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.neural_network import MLPClassifier
from sklearn.cluster import KMeans, AgglomerativeClustering
from sklearn.decomposition import PCA
from sklearn.metrics import f1_score, silhouette_score, adjusted_rand_score
print("scikit-learn", sklearn.__version__, "| ไฟล์:", sorted(p.name for p in DATA.iterdir()))
if sklearn.__version__ != "1.9.1":
    print("⚠️ ไม่ใช่ 1.9.1 — ตัวเลข MLP อาจต่างจากโปรเจกต์เล็กน้อย (ถ้าเพิ่งติดตั้ง: Runtime → Restart session แล้ว Run all)")
SEED = 42
""")

md(r"""
## 1. ข้อมูล: โปรไฟล์ 910 อาชีพ × 76 มิติ

`R[i]` = ระดับที่อาชีพ i ต้องการในแต่ละข้อ (0–100) จาก O*NET — คือ "เฉลย" ที่ผู้ใช้จะถูกนำไปเทียบ
76 ข้อ = กลุ่มทักษะ 30 (`grp::`) + ความสนใจ RIASEC 6 (`ri::`) + ลักษณะงานที่ชอบ 30 (`gtask::` `task::`) + นิสัย 10 (`ws::`)
""")
code(r"""
cfg = json.loads((DATA / "model_config.json").read_text())
CODES = np.asarray(cfg["class_order"], dtype=object)      # ลำดับอาชีพ (ใช้ทุกโมเดล)
COLS = cfg["feature_order"]                               # ลำดับคำถาม 76 ข้อ
R = pd.read_csv(DATA / "reference_vectors.csv", index_col=0).loc[CODES, COLS].to_numpy(float)
meta = pd.read_csv(DATA / "occupation_meta.csv", index_col=0, dtype={"major": str})
TITLE, MAJOR_OF = meta["Title"].to_dict(), meta["major"].to_dict()
CODE_IDX = {c: i for i, c in enumerate(CODES)}
print("R:", R.shape, "| ตัวอย่างคำถาม:", COLS[:3], "…", COLS[-2:])
pd.DataFrame(R[:3, :6], index=[TITLE[c] for c in CODES[:3]], columns=COLS[:6]).round(1)
""")

md(r"""
## 2. ผู้ใช้จำลอง (train / validation / test / stress test)

ผู้ใช้ 1 คน = `R[อาชีพ] + bias + noise` แล้วตัดให้อยู่ 0–100 · เฉลย = อาชีพนั้น
- **train** 24,570 คน = แบบพื้นฐาน (noise 15) 6,370 + augmentation 18,200 (noise 5–30, bias ±15)
- **validation** ใช้เลือกค่า (น้ำหนัก Ensemble) · **stress test** 9 สถานการณ์ × 910 = 8,190 คน ใช้รายงานผลเท่านั้น
""")
code(r"""
def make_users(n_per_occ, noise_sd, bias, seed):
    r = np.random.default_rng(seed)
    U = np.repeat(R, n_per_occ, axis=0)
    n = len(U)
    sd = noise_sd if np.isscalar(noise_sd) else r.uniform(*noise_sd, size=(n, 1))
    b = bias if np.isscalar(bias) else r.uniform(*bias, size=(n, 1))
    U = U + b + r.normal(0, 1, U.shape) * sd
    return np.clip(U, 0, 100), np.repeat(CODES, n_per_occ)

# แบบพื้นฐาน 10 คน/อาชีพ → แบ่ง 70/15/15 แบบ stratified
U0, yU0 = make_users(10, 15, 0.0, SEED)
idx = np.arange(len(U0))
i_tr, i_tmp = train_test_split(idx, test_size=0.30, stratify=yU0, random_state=SEED)
i_va, i_te = train_test_split(i_tmp, test_size=0.50, stratify=yU0[i_tmp], random_state=SEED)
X_tr0, y_tr0 = U0[i_tr], yU0[i_tr]
X_val, y_val = U0[i_va], yU0[i_va]
X_te, y_te = U0[i_te], yU0[i_te]

# augmentation: คนที่ตอบคลาดเคลื่อนต่างกัน / ประเมินตัวเองสูง-ต่ำเกิน (seed แยกจาก val/test)
X_aug, y_aug = make_users(20, noise_sd=(5, 30), bias=(-15, 15), seed=1001)
X_tr, y_tr = np.vstack([X_tr0, X_aug]), np.concatenate([y_tr0, y_aug])

SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]
def make_stress(seed):
    Xs, ys = [], []
    for k, (sd, b) in enumerate(SCENARIOS):
        X, y = make_users(1, sd, b, seed + k)
        Xs.append(X); ys.append(y)
    return np.vstack(Xs), np.concatenate(ys)

X_vs, y_vs = make_stress(2001)                    # stress validation (ใช้เลือกค่า)
X_ts, y_ts = make_stress(3001)                    # stress test (รายงานผลเท่านั้น)
X_valc, y_valc = np.vstack([X_val, X_vs]), np.concatenate([y_val, y_vs])
print(f"train {len(X_tr):,} | val {len(X_val):,} + stress val {len(X_vs):,} | test {len(X_te):,} | stress test {len(X_ts):,}")
""")
code(r"""
# metric: Top-1 / Top-5 (ตัวหลัก เพราะเว็บแสดง 5 อาชีพ) / Top-5 ระดับกลุ่มอาชีพ / Macro-F1
def metrics(S, y):
    top = CODES[np.argsort(-S, axis=1)[:, :5]]
    tm = np.vectorize(MAJOR_OF.get)(top)
    ym = np.array([MAJOR_OF[c] for c in y])
    return {"top1": float((top[:, 0] == y).mean()),
            "top5": float((top == y[:, None]).any(1).mean()),
            "top5_major_group": float((tm == ym[:, None]).any(1).mean()),
            "macro_f1": float(f1_score(y, top[:, 0], average="macro", labels=CODES, zero_division=0))}

results = []
def evaluate(name, score_fn):
    for split, X, y in [("test", X_te, y_te), ("stress_test", X_ts, y_ts)]:
        results.append({"model": name, "split": split, **metrics(score_fn(X), y)})
    r = results[-1]
    print(f"{name:<28} stress test  Top-1 {r['top1']:.1%}  Top-5 {r['top5']:.1%}")
""")

md(r"""
## 3. โมเดล ① Cosine Similarity (ไม่ต้องเทรน)

$\cos(x, r) = \dfrac{x \cdot r}{\lVert x\rVert\,\lVert r\rVert}$ — ดู **ทิศทาง** ของคำตอบ ไม่ดูขนาด
ใครให้คะแนนตัวเองสูง/ต่ำทุกข้อเท่า ๆ กัน (bias) ผลแทบไม่เปลี่ยน
ทำ L2-normalize ทุกแถวให้ยาว 1 แล้วคูณเมทริกซ์ครั้งเดียว → cos กับทั้ง 910 อาชีพ
""")
code(r"""
def l2(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)

Rn = l2(R)
def cosine_scores(X):                 # (n, 76) → (n, 910)
    return l2(X) @ Rn.T

evaluate("① Cosine", cosine_scores)
""")

md(r"""
## 4. โมเดล ②a MLP Classifier (Supervised)

```
input 76 ──► hidden 256 (ReLU) ──► output 910 (softmax = ความน่าจะเป็นของแต่ละอาชีพ)
```
- `StandardScaler` ปรับทุกข้อให้ mean 0 / SD 1 ก่อนเข้า network
- `alpha=1e-3` = L2 regularization กัน overfit · `early_stopping` แบ่ง 10% ของ train ไว้ หยุดเมื่อไม่ดีขึ้น
""")
code(r"""
mlp = make_pipeline(StandardScaler(),
                    MLPClassifier(hidden_layer_sizes=(256,), alpha=1e-3, early_stopping=True,
                                  max_iter=200, random_state=SEED))
t = time.time()
mlp.fit(X_tr, y_tr)
net = mlp[-1]
print(f"เทรน {time.time() - t:.1f} วินาที · หยุดที่รอบ {net.n_iter_} · น้ำหนัก {[w.shape for w in net.coefs_]}")

def mlp_proba(X):                     # เรียงคอลัมน์ให้ตรง CODES (เหมือน ①)
    P = mlp.predict_proba(X)
    out = np.zeros((len(X), len(CODES)))
    out[:, [CODE_IDX[c] for c in mlp.classes_]] = P
    return out

evaluate("②a MLP (256)", mlp_proba)

plt.figure(figsize=(6, 2.6))
plt.plot(net.loss_curve_, label="train loss")
plt.twinx().plot(net.validation_scores_, color="C1", label="val accuracy")
plt.title("MLP training: loss (blue) / validation accuracy (orange)"); plt.tight_layout(); plt.show()
""")

md(r"""
## 5. Ensemble ① + ②a

cos อยู่ช่วง 0–1 และค่าของอาชีพต้น ๆ ใกล้กันมาก ส่วน MLP เป็นความน่าจะเป็น (รวม = 1) → บวกตรง ๆ ไม่ได้
จึงแปลง cos เป็นความน่าจะเป็นด้วย **softmax (T)** ก่อน แล้วรวม `w × softmax(cos) + (1 − w) × MLP`
หา `w` และ `T` ด้วย grid search บน **validation เท่านั้น** (ไม่แตะ stress test)
""")
code(r"""
def softmax(S, T):
    Z = (S - S.max(1, keepdims=True)) / T              # ลบค่าสูงสุดก่อน กัน exp ล้น
    E = np.exp(Z)
    return E / E.sum(1, keepdims=True)

Sc_val, Pm_val = cosine_scores(X_valc), mlp_proba(X_valc)
grid = []
for T in (0.005, 0.01, 0.02, 0.05):
    Pc = softmax(Sc_val, T)
    for w in np.round(np.arange(0, 1.01, 0.1), 1):
        grid.append({"T": T, "w": w, **metrics(w * Pc + (1 - w) * Pm_val, y_valc)})
grid = pd.DataFrame(grid)
best = grid.sort_values(["top5", "top1"], ascending=False).iloc[0]
W, T = float(best["w"]), float(best["T"])
print(f"เลือก w = {W} (น้ำหนัก ①), T = {T}  ·  val Top-5 {best['top5']:.1%}")

def ensemble_scores(X):
    return W * softmax(cosine_scores(X), T) + (1 - W) * mlp_proba(X)

evaluate("Ensemble ① + ②a", ensemble_scores)

pv = grid.pivot(index="T", columns="w", values="top5")
plt.figure(figsize=(8, 2.4)); plt.imshow(pv, aspect="auto", cmap="Blues")
plt.xticks(range(len(pv.columns)), pv.columns); plt.yticks(range(len(pv.index)), pv.index)
plt.xlabel("w (weight of cosine)"); plt.ylabel("T (softmax temperature)"); plt.colorbar(label="val Top-5"); plt.title("Ensemble grid search"); plt.show()
""")

md("### ผลแยกตามสถานการณ์ (stress test) — noise หรือ bias กระทบมากกว่ากัน")
code(r"""
rows = []
n = len(CODES)
for k, (sd, b) in enumerate(SCENARIOS):
    sl = slice(k * n, (k + 1) * n)
    for name, fn in [("① Cosine", cosine_scores), ("②a MLP", mlp_proba), ("Ensemble", ensemble_scores)]:
        rows.append({"สถานการณ์": f"noise {sd}" + ("" if b == 0 else f", bias {b:+d}"), "model": name,
                     "Top-5": metrics(fn(X_ts[sl]), y_ts[sl])["top5"]})
sc = pd.DataFrame(rows).pivot(index="สถานการณ์", columns="model", values="Top-5")
sc.style.format("{:.1%}").background_gradient(cmap="Blues", axis=None)
""")

md(r"""
## 6. โมเดล ③ K-Means (Unsupervised)

จัดกลุ่ม **โปรไฟล์ 910 อาชีพ** (ไม่ใช้คำตอบผู้ใช้ และไม่มีเฉลย → ไม่มี train/test)
- ทดลอง k = 4–30 เทียบกับ Hierarchical (Ward) ด้วย **silhouette** (−1 ถึง 1 ยิ่งสูงยิ่งแยกชัด)
- เลือก k ≥ 8 ให้กลุ่มละเอียดพอใช้แนะนำ "อาชีพใกล้เคียง"
- **ARI** เทียบกลุ่มที่ได้กับกลุ่มอาชีพ SOC ของ O*NET (0 = สุ่ม, 1 = ตรงกันทุกตัว)
""")
code(r"""
Rs = StandardScaler().fit_transform(R)
ks = list(range(4, 31))
sil = {"K-Means": [], "Hierarchical (Ward)": []}
for k in ks:
    sil["K-Means"].append(silhouette_score(Rs, KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Rs).labels_))
    sil["Hierarchical (Ward)"].append(silhouette_score(Rs, AgglomerativeClustering(n_clusters=k, linkage="ward").fit(Rs).labels_))
sil_df = pd.DataFrame({"k": ks, **sil})

cand = sil_df[sil_df.k >= 8]
best_alg = max(sil, key=lambda a: cand[a].max())
K = int(cand.loc[cand[best_alg].idxmax(), "k"])
clus = (KMeans(n_clusters=K, n_init=10, random_state=SEED) if best_alg == "K-Means"
        else AgglomerativeClustering(n_clusters=K, linkage="ward")).fit(Rs)
labels = clus.labels_
majors = np.array([MAJOR_OF[c] for c in CODES])
print(f"เลือก {best_alg}, k = {K} · silhouette {silhouette_score(Rs, labels):.3f} · ARI กับกลุ่ม SOC {adjusted_rand_score(majors, labels):.3f}")

plt.figure(figsize=(7, 2.6))
for a in sil: plt.plot(ks, sil[a], marker=".", label=a)
plt.axvline(K, color="gray", ls="--"); plt.xlabel("k"); plt.ylabel("silhouette"); plt.legend(); plt.show()
""")
code(r"""
# แผนที่อาชีพ: ย่อ 76 มิติเหลือ 2 ด้วย PCA แล้วระบายสีตามกลุ่ม
XY = PCA(n_components=2, random_state=SEED).fit_transform(Rs)
plt.figure(figsize=(8, 6))
plt.scatter(XY[:, 0], XY[:, 1], c=labels, cmap="tab10", s=10, alpha=0.8)
for c in range(K):                                     # ชื่อกลุ่ม = กลุ่ม SOC ที่พบมากที่สุด (อังกฤษ — ฟอนต์กราฟไม่มีภาษาไทย)
    m = labels == c
    top = meta.loc[CODES[m], "major_name"].value_counts().index[0]
    plt.annotate(f"{c}: {top}", XY[m].mean(0), fontsize=8, weight="bold", ha="center")
plt.title(f"910 occupations · {best_alg} k={K} · PCA 2D"); plt.xticks([]); plt.yticks([]); plt.show()

def similar_careers(code, k=5):                        # อาชีพกลุ่มเดียวกัน เรียงด้วย cosine ระหว่างโปรไฟล์
    i = CODE_IDX[code]
    same = [j for j in np.where(labels == labels[i])[0] if j != i]
    return [(TITLE[CODES[j]], round(float(Rn[j] @ Rn[i]), 3)) for j in sorted(same, key=lambda j: -(Rn[j] @ Rn[i]))[:k]]

print("ใกล้เคียง Registered Nurses:", similar_careers("29-1141.00", 3))
""")

md("## 7. สรุป + เทียบกับผลของโปรเจกต์ (`summary.json` จาก `train_models.py`)")
code(r"""
board = pd.DataFrame(results)
st = board[board.split == "stress_test"].set_index("model")[["top1", "top5", "top5_major_group", "macro_f1"]]
display(st.style.format("{:.1%}"))

proj = json.loads((DATA / "summary.json").read_text())
ref = {(r["model"], r["split"]): r for r in proj["occupation_results"]}
alias = {"① Cosine": "① Matching — cosine (baseline)", "②a MLP (256)": "②a Classifier — MLP (256)",
         "Ensemble ① + ②a": "Ensemble ① + ②a"}
chk = pd.DataFrame([{"model": m, "notebook Top-5": st.loc[m, "top5"],
                     "โปรเจกต์ Top-5": ref[(alias[m], "stress_test")]["top5"]} for m in alias])
chk["ต่าง"] = (chk["notebook Top-5"] - chk["โปรเจกต์ Top-5"]).abs()
display(chk.style.format({"notebook Top-5": "{:.2%}", "โปรเจกต์ Top-5": "{:.2%}", "ต่าง": "{:.4f}"}))
pe = proj["ensemble"]; pc = proj["clustering"]
print(f"Ensemble  notebook w={W}, T={T}  ·  โปรเจกต์ w={pe['w_matching']}, T={pe['T']}")
print(f"Clustering notebook {best_alg} k={K}  ·  โปรเจกต์ {pc['algorithm']} k={pc['k']}")
ok = chk["ต่าง"].max() < 1e-3 and W == pe["w_matching"] and T == pe["T"] and K == pc["k"]
print("✓ ตรงกับโปรเจกต์ทั้งหมด" if ok else "⚠️ ต่างจากโปรเจกต์ — ตรวจเวอร์ชัน scikit-learn (ต้อง 1.9.1)")
""")

md(r"""
## 8. ลองกับคำตอบของคุณเอง

แก้คะแนน (0–100) ของข้อที่อยากลอง ข้อที่ไม่ได้ใส่ใช้ค่ากลาง 50 · ดูชื่อข้อทั้งหมดได้ที่ `COLS`
คะแนนจากคำตอบ 1–5: `(คำตอบ − 1) ÷ 4 × 100` → 1 = 0, 2 = 25, 3 = 50, 4 = 75, 5 = 100
""")
code(r"""
my = {f: 50 for f in COLS}
my.update({"ri::Social": 100, "gtask::care": 100, "gtask::heal": 100, "ws::Empathy": 100, "grp::bio_medical": 75})

x = np.array([[my[f] for f in COLS]], float)
cos, mp, ens = cosine_scores(x)[0], mlp_proba(x)[0], ensemble_scores(x)[0]
top = np.argsort(-ens)[:5]
pd.DataFrame({"อาชีพ": [TITLE[CODES[i]] for i in top], "① cosine": cos[top].round(3),
              "②a MLP": mp[top].round(3), "Ensemble": ens[top].round(3), "③ กลุ่ม": labels[top]},
             index=range(1, 6))
""")

nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                                   "language_info": {"name": "python"}, "colab": {"provenance": []}},
      "nbformat": 4, "nbformat_minor": 5}
OUT_NB.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")

with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ["models/reference_vectors.csv", "models/occupation_meta.csv", "models/model_config.json", "summary.json"]:
        z.write(GEN / f, Path(f).name)
print(OUT_NB, f"{len(cells)} cells")
print(OUT_ZIP, f"{OUT_ZIP.stat().st_size / 1e6:.2f} MB")
