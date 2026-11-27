"""
CareerPath AI — FastAPI backend
ห่อ CareerPredictor (datasets/ml/predict.py) เป็น REST API ทุก endpoint อยู่ใต้ /api

รัน (จากโฟลเดอร์ backend):
    .venv/bin/uvicorn app.main:app --reload --port 8000
"""

import json
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    CareerDetailOut,
    CareerListItem,
    ExplainIn,
    ExplainOut,
    HealthOut,
    LabelIn,
    LabelOut,
    MajorIn,
    MajorItem,
    MajorOut,
    RecommendIn,
    RecommendOut,
    SimilarCareerOut,
    SkillGapIn,
    SkillGapOut,
    TargetIn,
    TargetOut,
)

from .deps import MODEL_DIR, ROOT, get_predictor  # noqa: F401  (MODEL_DIR/ROOT ใช้ใน endpoint อื่น)
from . import db
from .account import router as account_router
from .advisor import router as advisor_router

from evaluation import evaluate as ev  # noqa: E402
from predict import CareerPredictor  # noqa: E402


@asynccontextmanager
async def lifespan(_: FastAPI):
    p = get_predictor()  # โหลดตอนเริ่ม ไม่ให้ request แรกช้า
    if db.init_db():  # ไม่ตั้ง DATABASE_URL = ปิดระบบบัญชี ส่วนอื่นใช้ได้ปกติ
        db.check_dim(p)
        db.seed_careers(p)
    yield


app = FastAPI(title="CareerPath AI API", version="0.1.0", lifespan=lifespan)
# เว็บกับ API คนละโดเมน (Vercel + Hugging Face Spaces): CORS_ORIGINS = โดเมนจริง (คั่นด้วย ,)
# CORS_ORIGIN_REGEX (ไม่บังคับ) = ลิงก์ preview ของ Vercel เช่น ^https://careerpath-ai-[a-z0-9-]+\.vercel\.app$
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


def check_features(user: dict[str, float], p: CareerPredictor) -> None:
    unknown = sorted(set(user) - set(p.features))
    if unknown:
        raise HTTPException(422, f"ไม่รู้จัก feature: {', '.join(unknown[:5])}")


def check_code(code: str, p: CareerPredictor) -> None:
    if code not in p.code_idx:
        raise HTTPException(404, f"ไม่พบอาชีพ {code}")


@api.get("/health", response_model=HealthOut)
def health(p: CareerPredictor = Depends(get_predictor)):
    return {"status": "ok", "features": len(p.features), "careers": len(p.codes), "feature_set": p.cfg.get("feature_set")}


@api.get("/features", response_model=list[str])
def features(p: CareerPredictor = Depends(get_predictor)):
    """ลำดับ feature ที่โมเดลใช้ (ตรงกับ model_config.json)"""
    return p.features


@api.post("/recommend", response_model=RecommendOut)
def recommend(body: RecommendIn, p: CareerPredictor = Depends(get_predictor)):
    """① Cosine + ②a MLP → Ensemble Top-k, ②b กลุ่มอาชีพ, ③ คลัสเตอร์, ความมั่นใจ (calibrate จากผู้ใช้จำลอง)"""
    check_features(body.user, p)
    return p.recommend(body.user, k=body.k)


@api.post("/skill-gap", response_model=SkillGapOut)
def skill_gap(body: SkillGapIn, p: CareerPredictor = Depends(get_predictor)):
    """Skill Gap + Skill Priority ของอาชีพเป้าหมาย"""
    check_features(body.user, p)
    check_code(body.code, p)
    return p.skill_gap(body.user, body.code, k=body.k)


@api.post("/explain", response_model=ExplainOut)
def explain(body: ExplainIn, p: CareerPredictor = Depends(get_predictor)):
    """ทำไมอาชีพนี้ขึ้นมา: แยกคะแนน ① Cosine เป็นรายคำถาม (ผลรวม = cos กับอาชีพนี้ − cos เฉลี่ยทุกอาชีพ)"""
    check_features(body.user, p)
    check_code(body.code, p)
    return p.explain(body.user, body.code, k=body.k)


@api.post("/target", response_model=TargetOut, response_model_by_alias=True)
def target(body: TargetIn, p: CareerPredictor = Depends(get_predictor)):
    """อาชีพที่ผู้ใช้อยากเป็น (จาก 910 อาชีพ): อันดับตาม Ensemble + เหตุผล + counterfactual 2 แบบ
    (เพิ่มทักษะอย่างเดียว / ถ้าความชอบและนิสัยตรงด้วย)"""
    check_features(body.user, p)
    check_code(body.code, p)
    return p.target(body.user, body.code, k=body.k)


@api.get("/majors", response_model=list[MajorItem])
def majors(p: CareerPredictor = Depends(get_predictor)):
    """รายชื่อสาขาไทยที่เชื่อมกับอาชีพได้ (datasets/cip/thai_majors.csv)"""
    return [{"id": m["id"], "faculty": m["faculty"], "major_th": m["major_th"]} for m in p.majors.values()]


@api.post("/major", response_model=MajorOut)
def major(body: MajorIn, p: CareerPredictor = Depends(get_predictor)):
    """อาชีพที่สาขานี้เกี่ยวข้อง (CIP–SOC ของ NCES) เรียงตามความเข้ากับผู้ใช้ด้วย Ensemble"""
    check_features(body.user, p)
    if body.major not in p.majors:
        raise HTTPException(404, f"ไม่พบสาขา {body.major}")
    return p.major_view(body.user, body.major, k=body.k)


@api.get("/careers/{code}/similar", response_model=list[SimilarCareerOut])
def similar(code: str, k: int = 5, p: CareerPredictor = Depends(get_predictor)):
    """③ อาชีพในคลัสเตอร์เดียวกัน เรียงตามความคล้าย"""
    check_code(code, p)
    return p.similar_careers(code, k=max(1, min(k, 20)))


@api.get("/careers/{code}", response_model=CareerDetailOut)
def career_detail(code: str, p: CareerPredictor = Depends(get_predictor)):
    """รายละเอียดอาชีพ: คำอธิบาย O*NET + ระดับที่ต้องการ 76 ข้อ + เครื่องมือ + คลัสเตอร์ — อ่านจากไฟล์ของโมเดล ไม่คำนวณคะแนนใหม่"""
    check_code(code, p)
    i = p.code_idx[code]
    z = (p.R[i] - p.ref_mean) / p.ref_std
    imp = p.importance.loc[code] if code in p.importance.index else None
    meta = p.meta.loc[code] if p.meta is not None and code in p.meta.index else None
    reqs = []
    for j, f in enumerate(p.features):
        v = imp[f] if imp is not None else None
        reqs.append({
            "feature": f, "domain": f.split("::")[0], "name": p.name_th.get(f, f.split("::")[1]),
            "required": round(float(p.R[i, j]), 1), "distinctiveness": round(float(z[j]), 3),
            "onet_importance": None if v is None or v != v else round(float(v), 1),  # v != v → NaN
        })
    return {
        "code": code, "title": p._title(code),
        "description": None if meta is None else str(meta["Description"]),
        "major": code[:2], "major_name": None if meta is None else str(meta["major_name"]),
        "cluster": int(p.clu["labels"][code]),
        "requirements": reqs,
        "tools": [f.split("::")[1] for f, v in p.tools.loc[code].items() if v >= 50],  # เกณฑ์เดียวกับ skill_gap()
    }


@api.get("/careers", response_model=list[CareerListItem])
def careers(p: CareerPredictor = Depends(get_predictor)):
    """รายชื่อ 910 อาชีพ + ข้อมูลสำหรับกรอง (กลุ่มอาชีพ, คลัสเตอร์ ③, ความสนใจเด่น) — อ่านจากไฟล์ของโมเดล"""
    ri = [j for j, f in enumerate(p.features) if f.startswith("ri::")]
    rows = []
    for i, c in enumerate(p.codes):
        top = sorted(ri, key=lambda j: -p.R[i, j])[:2]
        rows.append({"code": c, "title": p._title(c), "major": c[:2], "cluster": int(p.clu["labels"][c]),
                     "riasec": [p.features[j].split("::")[1] for j in top]})
    return sorted(rows, key=lambda x: x["title"])


# ---------- ผู้ใช้จริง (ไม่บังคับ) ----------
# ไม่มีข้อมูล = ระบบทำงานปกติ · มีข้อมูล = evaluate.py ใช้เป็นชั้นที่ 4 อัตโนมัติ
# เก็บที่: ตาราง real_labels (มีฐานข้อมูล) — ไม่มีฐานข้อมูลจึงเขียนไฟล์ labels.jsonl
# ตอนวัดผลรวม 2 แหล่ง: ไฟล์ (นำเข้าจาก Google Form ด้วย import_responses.py) + ตาราง (จากเว็บ)
_labels_lock = threading.Lock()


def labels_path() -> Path:
    return Path(os.getenv("REAL_USERS_FILE", ROOT / "datasets" / "real_users" / "labels.jsonl"))


@api.post("/labels", response_model=LabelOut)
def add_label(body: LabelIn, p: CareerPredictor = Depends(get_predictor)):
    if not body.consent:
        raise HTTPException(422, "ต้องยินยอมก่อนจึงจะบันทึกได้")
    check_features(body.answers, p)
    missing = set(p.features) - set(body.answers)
    if missing:
        raise HTTPException(422, f"ต้องตอบครบ {len(p.features)} ข้อ (ขาด {len(missing)} ข้อ)")
    check_code(body.code, p)
    row = body.model_dump() | {"created_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    path = labels_path()
    with _labels_lock:
        if db.enabled():
            total = db.add_real_label(row) + len(ev.load_real_users(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            total = sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    _report_cache.clear()
    return {"saved": True, "total": total}


# ---------- รายงานผลประเมินโมเดล ----------
_report_cache: dict = {}


@api.get("/evaluation")
def evaluation(p: CareerPredictor = Depends(get_predictor)):
    """persona + ความเสถียร + ผู้ใช้จริง (ถ้ามี) — คำนวณใหม่เมื่อข้อมูลผู้ใช้จริงเปลี่ยน"""
    path = labels_path()
    key = (path.stat().st_mtime if path.exists() else 0, db.real_label_count())
    if _report_cache.get("key") != key:
        db_rows = [r for r in db.real_label_rows() if r.get("consent") and r.get("code") and r.get("answers")]
        _report_cache.update(key=key, report=ev.build_report(p, real_rows=ev.load_real_users(path) + db_rows))
    return _report_cache["report"]


app.include_router(api)
app.include_router(account_router)
app.include_router(advisor_router)  # AI Advisor (LLM อธิบายผล ML — ไม่คำนวณใหม่)
