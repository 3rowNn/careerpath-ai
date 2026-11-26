"""
CareerPath AI — เทรนและเปรียบเทียบโมเดล ML
==========================================

ต่อยอดจาก Week 9 Data Gate (data_gate_analysis.ipynb) โดยใช้ข้อมูลที่ clean แล้วใน data_gate_output/

โมเดล
  ① Career Matching     : cosine similarity กับโปรไฟล์อาชีพ (ไม่ต้องเทรน)
  ② Career Classifier   : ②a ทำนายอาชีพ (910 คลาส) และ ②b ทำนายกลุ่มอาชีพ (22 คลาส)
                           เทียบหลายอัลกอริทึม เลือกตัวที่ดีที่สุดจาก validation
  ③ Career Clustering   : K-Means / Hierarchical จัดกลุ่มอาชีพที่ทักษะคล้ายกัน
  Ensemble              : รวม ① + ②a ปรับน้ำหนักจาก validation
  Skill Priority        : permutation importance (โมเดล) + distinctiveness (ข้อมูลอาชีพ)

วิธีรัน (จากโฟลเดอร์ datasets/ml):
    pip install scikit-learn pandas numpy matplotlib joblib
    python train_models.py
"""

import argparse
import json
import time
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import adjusted_rand_score, f1_score, silhouette_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
HERE = Path(__file__).resolve().parent

p = argparse.ArgumentParser()
p.add_argument("--data", default=str(HERE.parent / "data_gate_output"))
p.add_argument("--out", default=str(HERE / "output"))
p.add_argument("--feature-set", choices=["core", "D", "short", "general"], default="general",
               help="core = 101 features เดิม | D = core + tech 23 + ความชอบ 12 (136) | "
                    "short = รอบ 3 (71 ข้อ): กลุ่มทักษะ 30 + RIASEC 6 + tech 23 + ความชอบงาน IT 12 · "
                    "general = รอบ 4 (76 ข้อ ทุกสายอาชีพ): กลุ่มทักษะ 30 + RIASEC 6 + ลักษณะงานทั่วไป 18 + งาน IT 12 + นิสัย 10")
args = p.parse_args()

DATA = Path(args.data)
OUT = Path(args.out)
FIG = OUT / "figures"
MODELS = OUT / "models"
for d in (OUT, FIG, MODELS):
    d.mkdir(parents=True, exist_ok=True)

BLUE, ORANGE, AQUA, GRAY, PURPLE = "#2a78d6", "#eb6834", "#1baf7a", "#8a8984", "#7b5cd6"
plt.rcParams.update({
    "figure.dpi": 110, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e6e5e0", "grid.linewidth": 0.6, "axes.axisbelow": True,
    "axes.edgecolor": "#b5b4ae", "axes.titleweight": "bold", "axes.titlesize": 12, "font.size": 10,
})


def savefig(name):
    plt.tight_layout()
    plt.savefig(FIG / f"{name}.png", dpi=150, bbox_inches="tight")
    plt.close()


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# =====================================================================
# 0. โหลดข้อมูล
# =====================================================================
features = pd.read_csv(DATA / "occupation_features.csv", index_col=0)
meta = pd.read_csv(DATA / "occupation_meta.csv", index_col=0, dtype={"major": str})
req_long = pd.read_csv(DATA / "occupation_requirements_long.csv")
train_df = pd.read_csv(DATA / "synthetic_users_train.csv")
val_df = pd.read_csv(DATA / "synthetic_users_val.csv")
test_df = pd.read_csv(DATA / "synthetic_users_test.csv")

CORE_COLS = [c for c in train_df.columns if c != "true_code"]      # ab:: kn:: sk:: ri:: (101 มิติ)
CODES = np.asarray(features.index, dtype=object)                  # ลำดับคลาสที่ใช้ทุกโมเดล
CODE_IDX = {c: i for i, c in enumerate(CODES)}
FS = args.feature_set
if FS == "core":
    COLS = CORE_COLS
elif FS == "short":
    # แบบประเมินฉบับสั้น: 95 ทักษะรวมเป็น 30 กลุ่ม (สร้างโดย short_assessment.py)
    need = [HERE / "output" / "it_focus" / "occupation_task_preferences.csv",
            HERE / "output" / "short" / "occupation_skill_groups.csv"]
    if not all(f.exists() for f in need):
        raise SystemExit("รัน python task_preferences.py และ python short_assessment.py ก่อน")
    features = features.join(pd.read_csv(need[0], index_col=0)).join(pd.read_csv(need[1], index_col=0))
    GRP_COLS = [c for c in features.columns if c.startswith("grp::")]
    RI_COLS = [c for c in CORE_COLS if c.startswith("ri::")]
    TECH_COLS = [c for c in features.columns if c.startswith("tech::")]
    TASK_COLS = [c for c in features.columns if c.startswith("task::")]
    COLS = GRP_COLS + RI_COLS + TECH_COLS + TASK_COLS
elif FS == "general":
    # รอบที่ 4: ทุกสายอาชีพ (สร้างโดย general_assessment.py) — ตัดเครื่องมือ IT 23 ข้อ เพิ่มลักษณะงานทั่วไป + นิสัย
    need = [HERE / "output" / "it_focus" / "occupation_task_preferences.csv",
            HERE / "output" / "short" / "occupation_skill_groups.csv",
            HERE / "output" / "general" / "occupation_general_tasks.csv",
            HERE / "output" / "general" / "question_bank_general.csv"]
    if not all(f.exists() for f in need):
        raise SystemExit("รัน python task_preferences.py, short_assessment.py และ general_assessment.py ก่อน")
    for f in need[:3]:
        features = features.join(pd.read_csv(f, index_col=0))
    qb_general = pd.read_csv(need[3])
    COLS = [f for f in qb_general["feature"] if not f.startswith("ws::")] + [f for f in qb_general["feature"] if f.startswith("ws::")]
    TECH_COLS = []
    TASK_COLS = [c for c in COLS if c.startswith("task::")]
else:
    # ชุด D: เพิ่ม tech tags (จาก Data Gate) + คำถามความชอบ (สร้างโดย task_preferences.py)
    task_csv = HERE / "output" / "it_focus" / "occupation_task_preferences.csv"
    if not task_csv.exists():
        raise SystemExit("ไม่พบ output/it_focus/occupation_task_preferences.csv — รัน python task_preferences.py ก่อน")
    features = features.join(pd.read_csv(task_csv, index_col=0))
    TECH_COLS = [c for c in features.columns if c.startswith("tech::")]
    TASK_COLS = [c for c in features.columns if c.startswith("task::")]
    COLS = CORE_COLS + TECH_COLS + TASK_COLS
R = features.loc[CODES, COLS].to_numpy(float)                      # Reference: 910 อาชีพ × len(COLS) (0–100)
MAJOR_OF = meta["major"].to_dict()
MAJOR_NAME = meta.drop_duplicates("major").set_index("major")["major_name"].to_dict()
TITLE = meta["Title"].to_dict()


def make_users(n_per_occ, noise_sd, bias, seed):
    """ผู้ใช้จำลอง = โปรไฟล์อาชีพ + bias + noise (สุ่ม SD/bias ต่อคนได้เมื่อให้เป็นช่วง)"""
    r = np.random.default_rng(seed)
    U = np.repeat(R, n_per_occ, axis=0)
    n = len(U)
    sd = noise_sd if np.isscalar(noise_sd) else r.uniform(*noise_sd, size=(n, 1))
    b = bias if np.isscalar(bias) else r.uniform(*bias, size=(n, 1))
    U = U + b + r.normal(0, 1, U.shape) * sd
    return np.clip(U, 0, 100), np.repeat(CODES, n_per_occ)


if FS == "core":
    # ใช้ train/val/test จาก Data Gate ตรง ๆ
    def xy(df):
        return df[CORE_COLS].to_numpy(float), df["true_code"].to_numpy(object)
    X_tr0, y_tr0 = xy(train_df)
    X_val, y_val = xy(val_df)
    X_te, y_te = xy(test_df)
else:
    # สร้างใหม่ด้วยวิธีเดียวกับ Data Gate (10 คน/อาชีพ, noise 15, แบ่ง 70/15/15 stratified, seed 42)
    U0, yU0 = make_users(10, 15, 0.0, SEED)
    idx = np.arange(len(U0))
    i_tr, i_tmp = train_test_split(idx, test_size=0.30, stratify=yU0, random_state=SEED)
    i_va, i_te = train_test_split(i_tmp, test_size=0.50, stratify=yU0[i_tmp], random_state=SEED)
    X_tr0, y_tr0 = U0[i_tr], yU0[i_tr]
    X_val, y_val = U0[i_va], yU0[i_va]
    X_te, y_te = U0[i_te], yU0[i_te]
log(f"Feature set {FS}: {len(COLS)} มิติ | Reference {R.shape[0]} อาชีพ | train {len(X_tr0)} | val {len(X_val)} | test {len(X_te)}")


# =====================================================================
# 1. Data augmentation + Stress test sets
# =====================================================================
# ชุด train เดิมสร้างด้วย noise SD 15 ไม่มี bias ทั้งหมด ผู้ใช้จริงจะตอบไม่แม่นต่างกันไป
# และประเมินตัวเองสูง/ต่ำเกินจริง จึงเพิ่มผู้ใช้จำลองที่ noise และ bias หลากหลายเข้าไปใน train
# (seed แยกจาก val/test ทั้งหมด)
X_aug, y_aug = make_users(20, noise_sd=(5, 30), bias=(-15, 15), seed=1001)
X_tr = np.vstack([X_tr0, X_aug])
y_tr = np.concatenate([y_tr0, y_aug])
log(f"Train หลัง augmentation: {len(X_tr):,} คน ({len(X_tr0):,} เดิม + {len(X_aug):,} ใหม่)")

SCENARIOS = [(sd, b) for sd in (15, 25, 35) for b in (0, 15, -15)]


def scen_label(sd, b):
    return f"noise {sd}" + ("" if b == 0 else f", bias {b:+d}")


def make_stress(seed):
    Xs, ys, ss = [], [], []
    for k, (sd, b) in enumerate(SCENARIOS):
        X, y = make_users(1, sd, b, seed + k)
        Xs.append(X); ys.append(y); ss += [scen_label(sd, b)] * len(y)
    return np.vstack(Xs), np.concatenate(ys), np.asarray(ss)


X_vs, y_vs, s_vs = make_stress(2001)   # stress validation (ใช้เลือกโมเดล/น้ำหนัก)
X_ts, y_ts, s_ts = make_stress(3001)   # stress test (ใช้รายงานผลสุดท้ายเท่านั้น)
X_valc = np.vstack([X_val, X_vs])
y_valc = np.concatenate([y_val, y_vs])
log(f"Stress val {len(X_vs):,} | Stress test {len(X_ts):,} ({len(SCENARIOS)} สถานการณ์ × {len(CODES)} อาชีพ)")


# =====================================================================
# 2. Metrics
# =====================================================================
def to_major(codes):
    return np.asarray([MAJOR_OF[c] for c in codes], dtype=object)


def metrics_from_scores(S, y):
    """S: (n, 910) คะแนนเรียงตาม CODES — ยิ่งสูงยิ่งเหมาะ"""
    top = CODES[np.argsort(-S, axis=1)[:, :5]]
    hit5 = (top == y[:, None]).any(axis=1)
    tm = np.vectorize(MAJOR_OF.get)(top)
    ym = to_major(y)
    return {
        "top1": float((top[:, 0] == y).mean()),
        "top5": float(hit5.mean()),
        "top5_major_group": float((tm == ym[:, None]).any(axis=1).mean()),
        "macro_f1": float(f1_score(y, top[:, 0], average="macro", labels=CODES, zero_division=0)),
    }


def eval_block(score_fn, name):
    rows = []
    for split, X, y in [("val", X_val, y_val), ("stress_val", X_vs, y_vs),
                        ("test", X_te, y_te), ("stress_test", X_ts, y_ts)]:
        rows.append({"model": name, "split": split, **metrics_from_scores(score_fn(X), y)})
    return rows


# =====================================================================
# 3. โมเดล ① Career Matching (ไม่ต้องเทรน)
# =====================================================================
def l2(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True).clip(1e-9)


Rn = l2(R)
mu_tr, sd_tr = X_tr.mean(0), X_tr.std(0) + 1e-9         # fit จาก train เท่านั้น
Rz = l2((R - mu_tr) / sd_tr)


def match_cosine(X):            # เหมือน baseline ใน Data Gate
    return l2(X) @ Rn.T


def match_centered(X):          # z-score ก่อน cosine: ลดผลของ bias ที่ผู้ใช้ให้คะแนนตัวเองสูง/ต่ำทั้งหมด
    return l2((X - mu_tr) / sd_tr) @ Rz.T


log("① Career Matching ...")
results = []
results += eval_block(match_cosine, "① Matching — cosine (baseline)")
results += eval_block(match_centered, "① Matching — centered cosine")


# =====================================================================
# 4. โมเดล ②a Career Classifier (910 อาชีพ)
# =====================================================================
# Random Forest / Gradient Boosting ไม่เหมาะกับ 910 คลาส: แต่ละต้นต้องเก็บความน่าจะเป็น 910 ค่าทุก node
# (หน่วยความจำหลายร้อย MB ต่อต้น) และ boosting ต้องสร้าง 910 ต้นต่อรอบ จึงเทียบที่ระดับกลุ่มอาชีพ (②b) แทน
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


occ_models, timing = {}, {}
for name, mdl in OCC_CANDIDATES.items():
    log(f"②a เทรน {name} ...")
    t = time.time()
    mdl.fit(X_tr, y_tr)
    timing[name] = round(time.time() - t, 1)
    occ_models[name] = mdl
    results += eval_block(lambda X, m=mdl: proba_aligned(m, X), f"②a Classifier — {name}")

res_df = pd.DataFrame(results)


def val_score(model_name):
    r = res_df[(res_df.model == model_name) & res_df.split.isin(["val", "stress_val"])]
    return r["top5"].mean()


best_occ_name = max(OCC_CANDIDATES, key=lambda n: val_score(f"②a Classifier — {n}"))
best_occ = occ_models[best_occ_name]
best_match_name = max(["① Matching — cosine (baseline)", "① Matching — centered cosine"], key=val_score)
best_match = match_cosine if "baseline" in best_match_name else match_centered
log(f"เลือก ① = {best_match_name} | ②a = {best_occ_name} (ตัดสินจาก Top-5 เฉลี่ยของ val + stress val)")


# =====================================================================
# 5. Ensemble ① + ②a
# =====================================================================
def softmax(S, T):
    Z = (S - S.max(1, keepdims=True)) / T
    E = np.exp(Z)
    return E / E.sum(1, keepdims=True)


Sm_val, Pc_val = best_match(X_valc), proba_aligned(best_occ, X_valc)
grid = []
for T in (0.005, 0.01, 0.02, 0.05):
    Pm = softmax(Sm_val, T)
    for w in np.round(np.arange(0, 1.01, 0.1), 1):
        m = metrics_from_scores(w * Pm + (1 - w) * Pc_val, y_valc)
        grid.append({"T": T, "w_matching": w, **m})
grid = pd.DataFrame(grid)
best = grid.sort_values(["top5", "top1"], ascending=False).iloc[0]
ENS_T, ENS_W = float(best["T"]), float(best["w_matching"])
log(f"Ensemble: w_matching={ENS_W}, T={ENS_T} (val top5 {best['top5']:.3f})")
grid.to_csv(OUT / "ensemble_grid_search.csv", index=False)


def ensemble_scores(X):
    return ENS_W * softmax(best_match(X), ENS_T) + (1 - ENS_W) * proba_aligned(best_occ, X)


results += eval_block(ensemble_scores, "Ensemble ① + ②a")
res_df = pd.DataFrame(results)
res_df.round(4).to_csv(OUT / "01_occupation_model_comparison.csv", index=False)


# =====================================================================
# 6. โมเดล ②b Major-group Classifier (22 กลุ่มอาชีพ)
# =====================================================================
ym_tr, ym_val, ym_te, ym_vs, ym_ts = map(to_major, (y_tr, y_val, y_te, y_vs, y_ts))
GRP_CANDIDATES = {
    "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000)),
    "kNN (k=15)": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=15, weights="distance")),
    "Random Forest": RandomForestClassifier(n_estimators=200, min_samples_leaf=3, n_jobs=-1, random_state=SEED),
    "HistGradientBoosting": HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, early_stopping=True,
                                                           random_state=SEED),
    "MLP (256)": make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(256,), alpha=1e-3,
                                                               early_stopping=True, max_iter=200, random_state=SEED)),
}
grp_rows, grp_models = [], {}
for name, mdl in GRP_CANDIDATES.items():
    log(f"②b เทรน {name} ...")
    t = time.time()
    mdl.fit(X_tr, ym_tr)
    timing[f"②b {name}"] = round(time.time() - t, 1)
    grp_models[name] = mdl
    for split, X, y in [("val", X_val, ym_val), ("stress_val", X_vs, ym_vs),
                        ("test", X_te, ym_te), ("stress_test", X_ts, ym_ts)]:
        P = mdl.predict_proba(X)
        top3 = mdl.classes_[np.argsort(-P, axis=1)[:, :3]]
        pred = top3[:, 0]
        grp_rows.append({"model": f"②b {name}", "split": split,
                         "accuracy": float((pred == y).mean()),
                         "top3": float((top3 == y[:, None]).any(axis=1).mean()),
                         "macro_f1": float(f1_score(y, pred, average="macro", zero_division=0))})
grp_df = pd.DataFrame(grp_rows)
grp_df.round(4).to_csv(OUT / "02_major_group_model_comparison.csv", index=False)
best_grp_name = max(GRP_CANDIDATES, key=lambda n: grp_df[(grp_df.model == f"②b {n}") &
                                                          grp_df.split.isin(["val", "stress_val"])]["macro_f1"].mean())
best_grp = grp_models[best_grp_name]
log(f"เลือก ②b = {best_grp_name}")


# =====================================================================
# 7. Stress test รายสถานการณ์ (รายงานผลบน stress test เท่านั้น)
# =====================================================================
stress_rows = []
for name, fn in [(best_match_name, best_match),
                 (f"②a Classifier — {best_occ_name}", lambda X: proba_aligned(best_occ, X)),
                 ("Ensemble ① + ②a", ensemble_scores)]:
    S_all = fn(X_ts)
    for sc in pd.unique(s_ts):
        mask = s_ts == sc
        stress_rows.append({"model": name, "scenario": sc, **metrics_from_scores(S_all[mask], y_ts[mask])})
stress_df = pd.DataFrame(stress_rows)
stress_df.round(4).to_csv(OUT / "03_stress_test_by_scenario.csv", index=False)


# =====================================================================
# 8. โมเดล ③ Career Clustering
# =====================================================================
log("③ Clustering ...")
Rs = StandardScaler().fit_transform(R)
ks = list(range(4, 31))
sil = {"K-Means": [], "Hierarchical (Ward)": []}
for k in ks:
    km = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Rs)
    sil["K-Means"].append(silhouette_score(Rs, km.labels_))
    ag = AgglomerativeClustering(n_clusters=k, linkage="ward").fit(Rs)
    sil["Hierarchical (Ward)"].append(silhouette_score(Rs, ag.labels_))
sil_df = pd.DataFrame({"k": ks, **sil})
sil_df.round(4).to_csv(OUT / "04_clustering_silhouette.csv", index=False)

# เลือก k ในช่วง 8–30 เพื่อให้กลุ่มละเอียดพอใช้แนะนำ "อาชีพใกล้เคียง" (k น้อยกว่านี้กลุ่มกว้างเกินไป)
cand = sil_df[sil_df.k >= 8]
best_alg = max(sil, key=lambda a: cand[a].max())
K = int(cand.loc[cand[best_alg].idxmax(), "k"])
if best_alg == "K-Means":
    clus = KMeans(n_clusters=K, n_init=10, random_state=SEED).fit(Rs)
    labels = clus.labels_
else:
    clus = AgglomerativeClustering(n_clusters=K, linkage="ward").fit(Rs)
    labels = clus.labels_
majors = to_major(CODES)
ari = adjusted_rand_score(majors, labels)
log(f"③ เลือก {best_alg}, k={K}, silhouette={silhouette_score(Rs, labels):.3f}, ARI กับกลุ่มอาชีพ SOC={ari:.3f}")

# ตั้งชื่อกลุ่มอัตโนมัติจาก feature ที่โดดเด่นที่สุด 3 ตัว + อาชีพตัวอย่าง
Z = pd.DataFrame(Rs, index=CODES, columns=COLS)
clu_rows = []
for c in range(K):
    members = CODES[labels == c]
    top_feats = Z.loc[members].mean().nlargest(3).index
    dist_to_center = ((Z.loc[members] - Z.loc[members].mean()) ** 2).sum(axis=1)
    examples = [TITLE[m] for m in dist_to_center.nsmallest(3).index]      # อาชีพที่อยู่ใกล้ศูนย์กลางกลุ่มที่สุด
    clu_rows.append({"cluster": c, "size": len(members),
                     "signature": " · ".join(f.split("::")[1] for f in top_feats),
                     "top_major_group": pd.Series(to_major(members)).map(MAJOR_NAME).value_counts().index[0],
                     "examples": " | ".join(examples)})
clu_info = pd.DataFrame(clu_rows).sort_values("size", ascending=False)
clu_info.to_csv(OUT / "05_cluster_summary.csv", index=False)

pca = PCA(n_components=2, random_state=SEED).fit(Rs)
XY = pca.transform(Rs)
career_map = pd.DataFrame({"code": CODES, "title": [TITLE[c] for c in CODES],
                           "major_group": [MAJOR_NAME[MAJOR_OF[c]] for c in CODES],
                           "cluster": labels, "pca_x": XY[:, 0].round(4), "pca_y": XY[:, 1].round(4)})
career_map.to_csv(OUT / "career_clusters.csv", index=False)


# =====================================================================
# 9. Skill Priority
# =====================================================================
# (ก) Global permutation importance ของโมเดล ②a: สลับค่า feature ทีละตัว แล้วดูว่า Top-5 ลดลงเท่าไร
log("Permutation importance ...")
rng = np.random.default_rng(SEED)
base_top5 = metrics_from_scores(proba_aligned(best_occ, X_val), y_val)["top5"]
imp = []
for j, col in enumerate(COLS):
    drops = []
    for _ in range(3):
        Xp = X_val.copy()
        Xp[:, j] = rng.permutation(Xp[:, j])
        drops.append(base_top5 - metrics_from_scores(proba_aligned(best_occ, Xp), y_val)["top5"])
    imp.append({"feature": col, "domain": col.split("::")[0], "name": col.split("::")[1],
                "importance_top5_drop": float(np.mean(drops)), "std": float(np.std(drops))})
imp_df = pd.DataFrame(imp).sort_values("importance_top5_drop", ascending=False)
imp_df.round(5).to_csv(OUT / "06_permutation_importance.csv", index=False)

# (ข) ทักษะเด่นของแต่ละอาชีพ (distinctiveness): ระดับที่ต้องการสูงกว่าค่าเฉลี่ยทุกอาชีพกี่ SD
#     ใช้คู่กับ O*NET Importance จัดลำดับทักษะที่ควรพัฒนาในหน้า Skill Gap
IM = req_long.copy()
prefix = {"Abilities": "ab::", "Knowledge": "kn::", "Essential Skills": "sk::"}
IM["feature"] = IM["domain"].map(prefix) + IM["Element Name"]
IM = IM.pivot_table(index="O*NET-SOC Code", columns="feature", values="importance_0_100")
if FS in ("short", "general"):
    # importance ของกลุ่มทักษะ = ค่าเฉลี่ย importance ของทักษะในกลุ่ม
    sg = pd.read_csv(HERE / "output" / "short" / "skill_groups.csv")
    IM = pd.DataFrame({r.feature: IM[r.members.split(" | ")].mean(axis=1) for r in sg.itertuples()})
IM.reindex(index=CODES).to_csv(MODELS / "onet_importance.csv")
key_rows = []
for code in CODES:
    z = Z.loc[code]
    skill_like = [c for c in COLS if c.split("::")[0] in ("ab", "kn", "sk", "grp", "tech")]   # ไม่รวมความสนใจ/ความชอบ
    for f in z[skill_like].nlargest(10).index:
        key_rows.append({"code": code, "title": TITLE[code], "feature": f, "name": f.split("::")[1],
                         "required_level_0_100": round(float(features.loc[code, f]), 1),
                         "distinctiveness_z": round(float(z[f]), 3),
                         "onet_importance_0_100": (round(float(IM.loc[code, f]), 1)
                                                   if f in IM.columns and code in IM.index else None)})
pd.DataFrame(key_rows).to_csv(OUT / "career_key_skills.csv", index=False)


# =====================================================================
# 10. บันทึกโมเดลและ config
# =====================================================================
joblib.dump(best_occ, MODELS / "occupation_classifier.joblib", compress=3)
joblib.dump(best_grp, MODELS / "major_group_classifier.joblib", compress=3)
joblib.dump({"algorithm": best_alg, "k": K, "labels": dict(zip(CODES, labels.tolist())),
             "pca": pca, "scaler": StandardScaler().fit(R)}, MODELS / "clustering.joblib", compress=3)
config = {
    "feature_order": COLS,
    "feature_set": FS,
    "class_order": CODES.tolist(),
    "matching": {"method": best_match_name, "train_mean": mu_tr.tolist(), "train_std": sd_tr.tolist()},
    "occupation_classifier": best_occ_name,
    "major_group_classifier": best_grp_name,
    "ensemble": {"w_matching": ENS_W, "softmax_T": ENS_T},
    "clustering": {"algorithm": best_alg, "k": K},
    "skill_priority_weights": {"gap": 1.0, "onet_importance": 0.5, "distinctiveness": 0.5},
    "trained_at": time.strftime("%Y-%m-%d %H:%M"),
    "note": "เทรนด้วยผู้ใช้จำลอง (synthetic) ทั้งหมด — ต้องวัดผลซ้ำกับ real-user test set",
}
(MODELS / "model_config.json").write_text(json.dumps(config, ensure_ascii=False, indent=1))
features.loc[CODES, COLS].to_csv(MODELS / "reference_vectors.csv")
# ไฟล์ประกอบให้ predict.py ใช้ได้จากโฟลเดอร์ models อย่างเดียว
# เครื่องมือที่อาชีพใช้ (O*NET Software Skills) — ใช้แนะนำใน Roadmap แม้แบบประเมินจะไม่ได้ถามเรื่องเครื่องมือ
features.loc[CODES, [c for c in features.columns if c.startswith("tech::")]].to_csv(MODELS / "tools_reference.csv")
if FS in ("short", "general"):
    import shutil
    shutil.copy(HERE / "output" / "short" / "skill_groups.csv", MODELS / "skill_groups.csv")
meta.loc[CODES].to_csv(MODELS / "occupation_meta.csv")
pd.Series(timing, name="train_seconds").to_csv(OUT / "07_training_time.csv")


# =====================================================================
# 11. กราฟ
# =====================================================================
log("วาดกราฟ ...")
# 11.1 เปรียบเทียบโมเดลอาชีพ (test vs stress test)
order = res_df.model.unique()
fig, axes = plt.subplots(1, 2, figsize=(12, 4.2), sharey=True)
for ax, metric, title in [(axes[0], "top5", "Top-5 accuracy"), (axes[1], "top1", "Top-1 accuracy")]:
    t = res_df[res_df.split == "test"].set_index("model").loc[order, metric]
    s = res_df[res_df.split == "stress_test"].set_index("model").loc[order, metric]
    yy = np.arange(len(order))
    ax.barh(yy + 0.2, t * 100, 0.38, color=BLUE, label="test (same as training noise)")
    ax.barh(yy - 0.2, s * 100, 0.38, color=ORANGE, label="stress test (noisier, biased users)")
    for i, (a, b) in enumerate(zip(t, s)):
        ax.text(a * 100 + 1, i + 0.2, f"{a:.1%}", va="center", fontsize=8)
        ax.text(b * 100 + 1, i - 0.2, f"{b:.1%}", va="center", fontsize=8)
    ax.set_xlim(0, 112); ax.set_title(title); ax.grid(axis="y", visible=False)
axes[0].set_yticks(np.arange(len(order)))
axes[0].set_yticklabels([o.replace("②a Classifier — ", "②a ").replace("① Matching — ", "① ") for o in order])
axes[0].invert_yaxis()
h, l = axes[0].get_legend_handles_labels()
fig.legend(h, l, frameon=False, fontsize=9, loc="lower center", ncol=2, bbox_to_anchor=(0.5, -0.06))
savefig("01_occupation_model_comparison")

# 11.2 Stress test รายสถานการณ์
fig, ax = plt.subplots(figsize=(10, 4.2))
scs = list(pd.unique(s_ts))
xx = np.arange(len(scs))
for k, (name, col) in enumerate(zip(stress_df.model.unique(), [GRAY, BLUE, ORANGE])):
    v = stress_df[stress_df.model == name].set_index("scenario").loc[scs, "top5"] * 100
    ax.bar(xx + (k - 1) * 0.27, v, 0.27, color=col, label=name.replace("②a Classifier — ", "②a "))
ax.set_xticks(xx); ax.set_xticklabels(scs, rotation=30, ha="right")
ax.set_ylabel("Top-5 accuracy (%)"); ax.set_ylim(0, 105)
ax.set_title("Stress test: accuracy when users answer less precisely or over/under-rate themselves")
ax.legend(frameon=False, fontsize=9, loc="upper center", bbox_to_anchor=(0.5, -0.32), ncol=3)
ax.grid(axis="x", visible=False)
savefig("02_stress_test_by_scenario")

# 11.3 ②b
g = grp_df[grp_df.split.isin(["test", "stress_test"])].pivot(index="model", columns="split", values="macro_f1")
g = g.loc[[f"②b {n}" for n in GRP_CANDIDATES]]
fig, ax = plt.subplots(figsize=(8, 3.6))
yy = np.arange(len(g))
ax.barh(yy + 0.2, g["test"] * 100, 0.38, color=BLUE, label="test")
ax.barh(yy - 0.2, g["stress_test"] * 100, 0.38, color=ORANGE, label="stress test")
for i, (a, b) in enumerate(zip(g["test"], g["stress_test"])):
    ax.text(a * 100 + 1, i + 0.2, f"{a:.1%}", va="center", fontsize=8)
    ax.text(b * 100 + 1, i - 0.2, f"{b:.1%}", va="center", fontsize=8)
ax.set_yticks(yy); ax.set_yticklabels([i.replace("②b ", "") for i in g.index]); ax.invert_yaxis()
ax.set_xlim(0, 112); ax.set_xlabel("Macro-F1 (%)"); ax.set_title("②b Major-group classifier (22 groups)")
ax.legend(frameon=False, fontsize=8, loc="lower right"); ax.grid(axis="y", visible=False)
savefig("03_major_group_comparison")

# 11.4 Silhouette
fig, ax = plt.subplots(figsize=(8, 3.6))
ax.plot(sil_df.k, sil_df["K-Means"], marker="o", ms=4, color=BLUE, label="K-Means")
ax.plot(sil_df.k, sil_df["Hierarchical (Ward)"], marker="o", ms=4, color=ORANGE, label="Hierarchical (Ward)")
ax.axvline(K, color=GRAY, ls="--", lw=1); ax.text(K + 0.3, ax.get_ylim()[1] * 0.97, f"chosen k={K}", fontsize=8, va="top")
ax.axvspan(3.5, 7.5, color="#f1f0ec", zorder=0); ax.text(5.5, ax.get_ylim()[0], "too coarse", ha="center", va="bottom", fontsize=8, color=GRAY)
ax.set_xlabel("k (number of clusters)"); ax.set_ylabel("Silhouette score"); ax.set_title("③ Choosing the number of career clusters")
ax.legend(frameon=False)
savefig("04_clustering_silhouette")

# 11.5 Career map (PCA)
fig, ax = plt.subplots(figsize=(8.5, 6))
cmap = plt.get_cmap("tab20", K)
ax.scatter(XY[:, 0], XY[:, 1], c=labels, cmap=cmap, s=12, alpha=0.85, linewidths=0)
for t in ["15-2051.00", "15-1252.00", "29-1141.00", "27-1024.00", "13-2011.00", "47-2111.00"]:
    if t in CODE_IDX:
        i = CODE_IDX[t]
        ax.annotate(TITLE[t], XY[i], fontsize=7.5, xytext=(5, 4), textcoords="offset points")
ev = pca.explained_variance_ratio_
ax.set_xlabel(f"PC1 ({ev[0]:.0%} variance)"); ax.set_ylabel(f"PC2 ({ev[1]:.0%} variance)")
ax.set_title(f"③ Career map — {len(CODES)} occupations, {K} clusters ({best_alg})")
savefig("05_career_map_pca")

# 11.6 Permutation importance
top = imp_df.head(15).iloc[::-1]
fig, ax = plt.subplots(figsize=(7.5, 5))
dom_col = {"ab": BLUE, "kn": ORANGE, "sk": AQUA, "grp": BLUE, "ri": PURPLE, "tech": "#3f3f46", "task": "#d6a01b",
           "gtask": AQUA, "ws": "#c2417a"}
ax.barh(top["name"], top["importance_top5_drop"] * 100, color=[dom_col[d] for d in top["domain"]], xerr=top["std"] * 100,
        error_kw=dict(ecolor=GRAY, lw=0.8))
ax.set_xlabel("Drop in Top-5 accuracy when shuffled (percentage points)")
ax.set_title(f"Skill Priority — permutation importance ({best_occ_name})")
from matplotlib.patches import Patch
dom_label = {"ab": "Ability", "kn": "Knowledge", "sk": "Skill", "grp": "Skill group", "ri": "Interest (RIASEC)",
             "tech": "Tech tag", "task": "Task preference", "gtask": "General task preferences", "ws": "Work styles"}
shown = [d for d in dom_label if d in set(top["domain"])]          # เฉพาะกลุ่มที่มีอยู่ในกราฟ
ax.legend(handles=[Patch(color=dom_col[d], label=dom_label[d]) for d in shown],
          frameon=False, fontsize=8, loc="lower right")
ax.grid(axis="y", visible=False)
savefig("06_permutation_importance")

# =====================================================================
# 12. สรุป
# =====================================================================
summary = {
    "best_matching": best_match_name,
    "best_occupation_classifier": best_occ_name,
    "best_major_group_classifier": best_grp_name,
    "ensemble": {"w_matching": ENS_W, "T": ENS_T},
    "clustering": {"algorithm": best_alg, "k": K, "silhouette": round(float(silhouette_score(Rs, labels)), 4),
                   "ari_vs_soc_major": round(float(ari), 4)},
    "occupation_results": res_df[res_df.split.isin(["test", "stress_test"])].round(4).to_dict("records"),
    "major_group_results": grp_df[grp_df.split.isin(["test", "stress_test"])].round(4).to_dict("records"),
    "training_seconds": timing,
}
(OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
log("เสร็จ")
print(res_df[res_df.split.isin(["test", "stress_test"])].round(3).to_string(index=False))
print(grp_df[grp_df.split.isin(["test", "stress_test"])].round(3).to_string(index=False))
