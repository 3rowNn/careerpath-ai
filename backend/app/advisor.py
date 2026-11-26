"""
AI Advisor — LLM (Gemini) + RAG แบบเรียกเครื่องมือ

หลักการ: ML เป็นตัวคำนวณ LLM เป็นแค่ผู้อธิบาย
- ทุกตัวเลข (อันดับ, ทักษะครอบคลุม, Skill Gap, เหตุผลรายคำถาม) มาจาก CareerPredictor (predict.py) แบบอ่านอย่างเดียว
- ข้อความอาชีพ (ชื่อไทย, คำอธิบาย, งานหลัก) มาจากคลัง backend/data/advisor/ (scripts/build_advisor_index.py)
- ค้นอาชีพจากคำบรรยาย = embedding (gemini-embedding-001) + cosine ใน numpy (910 แถว — ไม่ต้องใช้ฐานข้อมูล)
ไม่แก้โมเดล ไม่เทรน ไม่เปลี่ยนสูตรใด ๆ ของ ML

ตั้งค่า (backend/.env): GEMINI_API_KEY (ไม่ตั้ง = 503), ADVISOR_MODEL (ค่าเริ่มต้น gemini-3.5-flash)
"""

import csv
import json
import os
from functools import lru_cache
from typing import Literal

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .deps import ROOT, get_predictor

router = APIRouter(prefix="/api/advisor")

DATA = ROOT / "backend" / "data" / "advisor"
MODEL = os.getenv("ADVISOR_MODEL", "gemini-3.5-flash")
# โควตาฟรีมัก 503 "high demand" — ลองโมเดลสำรองตามลำดับ (ผลยังมาจากเครื่องมือชุดเดียวกัน ต่างแค่สำนวน)
FALLBACK_MODELS = [m for m in os.getenv("ADVISOR_FALLBACK_MODELS", "gemini-2.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite").split(",") if m]
MAX_TOOL_CALLS = 6


# ---------------- schemas ----------------
class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=8000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)
    user: dict[str, float] | None = None  # คะแนน 0–100 ตาม feature_order (ชุดเดียวกับ /recommend) — None = ยังไม่ได้ประเมิน
    target_code: str | None = None  # อาชีพที่แชทนี้คุยถึง (กดถาม AI จากหน้าอาชีพ หรือเป้าหมายใน Skill Gap)


class ChatOut(BaseModel):
    reply: str
    tools_used: list[str]
    model: str


# ---------------- คลังความรู้ (อ่านอย่างเดียว) ----------------
@lru_cache(maxsize=1)
def knowledge():
    kb = json.loads((DATA / "careers_kb.json").read_text(encoding="utf-8"))
    emb_path, meta_path = DATA / "careers_emb.npy", DATA / "index_meta.json"
    if emb_path.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        return kb, np.load(emb_path), meta
    return kb, None, None


@lru_cache(maxsize=1)
def feature_text() -> dict[str, str]:
    """ชื่อภาษาไทยของแต่ละคำถาม (ตัด "แค่ไหน" ท้ายประโยค) — จากคลังคำถามรอบ 4"""
    path = ROOT / "datasets" / "ml" / "output" / "general" / "question_bank_general.csv"
    with path.open(encoding="utf-8") as f:
        return {r["feature"]: r["question_th"].removesuffix("แค่ไหน").removesuffix("ได้ดี").strip() for r in csv.DictReader(f)}


@lru_cache(maxsize=1)
def client():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    from google import genai
    from google.genai import types

    # function calling ใช้ได้เฉพาะ v1beta (SDK เลือก v1 ให้ key บางแบบ)
    return genai.Client(api_key=key, http_options=types.HttpOptions(api_version="v1beta", timeout=60_000))


@lru_cache(maxsize=1)
def major_names() -> dict[str, str]:
    """รหัส SOC major group → ชื่อกลุ่ม (จาก occupation_meta ของโมเดล)"""
    p = get_predictor()
    if p.meta is None:
        return {}
    return {str(m): str(n) for m, n in p.meta[["major", "major_name"]].drop_duplicates().itertuples(index=False)}


def _name(feature: str, fallback: str) -> str:
    p = get_predictor()
    if feature.startswith("grp::"):
        return p.name_th.get(feature, fallback)
    return feature_text().get(feature, fallback)


def _title(code: str) -> str:
    kb = knowledge()[0]
    return (kb.get(code) or {}).get("title_th") or get_predictor()._title(code)


def _level(v: float) -> str:
    """คะแนน 0–100 → ระดับคำตอบ 1–5 (สูตรเดียวกับ frontend toAnswer)"""
    return f"{round(v / 25) + 1}/5"


# ---------------- เครื่องมือ (Retrieval) ----------------
def make_tools(user: dict[str, float] | None):
    """สร้างเครื่องมือที่ผูกกับคำตอบของผู้ใช้คนนี้ — ทุกตัวเรียก predict.py แบบอ่านอย่างเดียว"""
    p = get_predictor()
    vec = None if user is None else {f: float(user.get(f, 0.0)) for f in p.features}
    no_assess = {"error": "ผู้ใช้ยังไม่ได้ทำแบบประเมิน — แนะนำให้ทำแบบประเมิน 76 ข้อก่อน"}

    def bad_code(code: str):
        if code in p.code_idx:
            return None
        return {"error": f"ไม่พบรหัสอาชีพ {code} — ใช้ search_careers หาอาชีพจากชื่อหรือคำบรรยายก่อน"}

    def get_my_top_careers() -> dict:
        """ผลแนะนำอาชีพ Top 5 ของผู้ใช้จากโมเดล ML (Ensemble ① Cosine + ②a MLP), กลุ่มอาชีพที่เหมาะ (②b kNN)
        และระดับความมั่นใจ — ใช้เมื่อผู้ใช้ถามว่าเหมาะกับอาชีพอะไร หรือถามถึงผลประเมินของตัวเอง"""
        if vec is None:
            return no_assess
        r = p.recommend(vec, k=5)
        conf = r["confidence"]
        return {
            "top5": [
                {"rank": c["rank"], "code": c["code"], "title": _title(c["code"]),
                 "skill_coverage_percent": c["skill_coverage_percent"]}
                for c in r["careers"]
            ],
            "note_skill_coverage": "skill_coverage_percent = ทักษะครอบคลุม (ทักษะของผู้ใช้ถึงระดับที่อาชีพต้องการกี่ %) ไม่ใช่ % ความเหมาะ",
            "career_groups_by_knn_model": [{"group": major_names().get(g["major"], g["major"]), "probability": g["probability"]}
                                           for g in r["major_groups"][:3]],
            "confidence": {
                "level": conf["level"],
                "top1_accuracy_in_simulated_users": conf["sim_top1_accuracy"],
                "top5_accuracy_in_simulated_users": conf["sim_top5_accuracy"],
                "note": "ความแม่นวัดจากผู้ใช้จำลอง ไม่ใช่คนจริง",
            },
        }

    def explain_career(code: str) -> dict:
        """อธิบายว่าทำไมอาชีพนี้ถึงได้อันดับนี้สำหรับผู้ใช้: คำตอบข้อไหนช่วยดัน (positive) ข้อไหนฉุด (negative)
        คำนวณจากโมเดล ① Cosine แยกรายคำถาม — ใช้เมื่อผู้ใช้ถามว่า "ทำไม"
        Args:
            code: รหัสอาชีพ O*NET เช่น 13-2011.00
        """
        if vec is None:
            return no_assess
        if e := bad_code(code):
            return e
        x = p.explain(vec, code, k=5)
        row = lambda r: {"question": _name(r["feature"], r["name"]), "user_level": _level(r["user"]),
                         "career_needs": _level(r["required"])}
        return {"career": _title(code), "rank_by_matching_model": x["rank_matching"],
                "helps_most": [row(r) for r in x["positive"]], "holds_back": [row(r) for r in x["negative"]]}

    def get_skill_gap(code: str) -> dict:
        """ทักษะที่ผู้ใช้ยังขาดสำหรับอาชีพนี้ เรียงตาม Skill Priority (สิ่งที่ควรเรียนก่อน) + เครื่องมือที่อาชีพนี้ใช้
        ใช้เมื่อผู้ใช้ถามว่าต้องเรียนอะไร พัฒนาอะไร หรือจุดแข็ง/จุดอ่อน
        Args:
            code: รหัสอาชีพ O*NET เช่น 13-2011.00
        """
        if vec is None:
            return no_assess
        if e := bad_code(code):
            return e
        g = p.skill_gap(vec, code, k=8)
        strong = sorted((r for r in g["all"] if r["gap"] <= 0), key=lambda r: -r["required"])[:4]
        return {
            "career": _title(code),
            "skills_met": f'{g["skills_met"]}/{g["skills_total"]}',
            "learn_first": [{"skill": r["name"], "user_level": _level(r["user"]), "needed_level": _level(r["required"]),
                             "gap_points_0_100": round(r["gap"], 1)} for r in g["top_priorities"]],
            "strengths": [r["name"] for r in strong],
            "tools_used": g["tools_used"],
        }

    def check_target_career(code: str) -> dict:
        """อาชีพที่ผู้ใช้อยากเป็น (เลือกจาก 910 อาชีพ): อันดับของอาชีพนี้สำหรับผู้ใช้ และถ้าเพิ่มทักษะอย่างเดียว
        จะเข้า Top 5 ได้ไหม (counterfactual) — ใช้เมื่อผู้ใช้ถามว่า "ถ้าอยากเป็น X ห่างแค่ไหน"
        Args:
            code: รหัสอาชีพ O*NET เช่น 29-1141.00
        """
        if vec is None:
            return no_assess
        if e := bad_code(code):
            return e
        t = p.target(vec, code)
        cf, cfa = t["counterfactual"], t["counterfactual_all"]
        return {
            "career": _title(code),
            "rank_out_of_910": t["career"]["rank"],
            "skill_coverage_percent": t["career"]["skill_coverage_percent"],
            "skills_only": {"reaches_top5": cf["reached"], "rank_after": cf["rank_after"],
                            "skills_to_raise": [_name(c["feature"], c.get("name", "")) for c in cf.get("changes", [])][:6]},
            "if_interests_and_habits_also_match": {"reaches_top5": cfa["reached"], "rank_after": cfa["rank_after"]},
            "not_skill_related_blockers": [_name(b["feature"], b["name"]) for b in cf.get("blocking", [])][:4],
        }

    def get_career_info(code: str) -> dict:
        """ข้อมูลอาชีพจาก O*NET: ชื่อไทย/อังกฤษ คำอธิบาย งานหลักที่ทำ และอาชีพใกล้เคียง (③ K-Means)
        ใช้เมื่อผู้ใช้ถามว่าอาชีพนี้ทำงานอะไร
        Args:
            code: รหัสอาชีพ O*NET เช่น 15-1252.00
        """
        if e := bad_code(code):
            return e
        c = knowledge()[0].get(code, {})
        sim = p.similar_careers(code, k=4)
        return {
            "code": code, "title_th": c.get("title_th"), "title_en": c.get("title_en"),
            "career_group": c.get("major_name"), "description_en": c.get("description"),
            "main_tasks_en": c.get("tasks", []),
            "similar_careers": [{"code": s["code"], "title": _title(s["code"])} for s in sim],
            "source": "O*NET (ตลาดแรงงานสหรัฐฯ) — ชื่อไทยแปลโดย AI",
        }

    def search_careers(query: str) -> dict:
        """ค้นอาชีพจาก 910 อาชีพด้วยชื่อหรือคำบรรยาย (ภาษาไทยหรืออังกฤษ) เช่น "นักบัญชี", "งานที่ได้อยู่กับเด็ก",
        "งานกลางแจ้ง" — คืนรหัสอาชีพไว้ใช้กับเครื่องมืออื่น
        Args:
            query: ชื่ออาชีพหรือคำบรรยายลักษณะงานที่ต้องการ
        """
        return {"results": search(query, k=8)}

    return [get_my_top_careers, explain_career, get_skill_gap, check_target_career, get_career_info, search_careers]


def search(query: str, k: int = 8) -> list[dict]:
    """ชื่อตรงก่อน (substring) แล้วเติมด้วยการค้นตามความหมาย (embedding)"""
    kb, X, meta = knowledge()
    q = query.strip().lower()
    hits = [c for c in kb.values() if q and (q in c["title_th"].lower() or q in c["title_en"].lower() or q in c["aliases"].lower())]
    out = [{"code": c["code"], "title": c["title_th"], "match": "name"} for c in hits[:k]]
    if len(out) < k and X is not None and client() is not None:
        from google.genai import types

        r = client().models.embed_content(
            model=meta["model"], contents=[query],
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY", output_dimensionality=meta["dim"]),
        )
        v = np.asarray(r.embeddings[0].values, dtype=np.float32)
        s = X @ (v / np.linalg.norm(v))
        seen = {o["code"] for o in out}
        for i in np.argsort(-s):
            code = meta["codes"][i]
            if code not in seen:
                out.append({"code": code, "title": kb[code]["title_th"], "match": f"meaning {float(s[i]):.2f}"})
            if len(out) >= k:
                break
    return out


# ---------------- prompt ----------------
SYSTEM = """คุณคือ "AI Advisor" ของ CareerPath AI เว็บแนะนำอาชีพสำหรับคนที่ยังไม่มีทิศทางอาชีพ
(เรียนจบแล้วยังไม่มีงาน ไม่รู้ว่าตัวเองเก่งอะไร หรือไม่รู้ว่าอยากเป็นอะไร) ทุกสายอาชีพสำคัญเท่ากัน ไม่ใช่แค่สาย IT

หน้าที่ของคุณคืออธิบายผลจากโมเดล ML ของเว็บให้เข้าใจง่าย และช่วยวางแผน — คุณไม่ได้เป็นคนคำนวณผล

กฎ:
1. ตัวเลข อันดับ ระดับทักษะ และรายชื่ออาชีพ ต้องมาจากผลของเครื่องมือเท่านั้น ห้ามคิดหรือเดาเอง
   ถ้าต้องใช้ข้อมูลของผู้ใช้หรืออาชีพ ให้เรียกเครื่องมือก่อนตอบเสมอ
2. ถ้าผู้ใช้พูดถึงอาชีพด้วยชื่อ ให้ใช้ search_careers หารหัสก่อน แล้วค่อยเรียกเครื่องมืออื่น
3. skill_coverage_percent คือ "ทักษะครอบคลุม" ไม่ใช่ % ความเหมาะกับอาชีพ — อย่าพูดว่า "เหมาะ 80%"
4. ถ้าพูดถึงความแม่นของโมเดล ต้องบอกว่าวัดจากผู้ใช้จำลอง ไม่ใช่คนจริง
5. ข้อมูลอาชีพมาจาก O*NET ซึ่งเป็นตลาดแรงงานสหรัฐฯ — เรื่องเงินเดือน ตลาดงาน หรือใบอนุญาตในไทย
   เครื่องมือไม่มีข้อมูล ให้บอกตรง ๆ และแนะนำให้ตรวจสอบจากแหล่งในไทย ห้ามแต่งตัวเลข
6. ถ้าเครื่องมือตอบ error หรือไม่มีข้อมูล ให้บอกตามจริง
7. ตอบเป็นภาษาไทย กระชับ เป็นกันเอง ให้กำลังใจได้แต่ไม่โอ้อวด ใช้ bullet เมื่อเป็นรายการ
   ใช้ชื่ออาชีพภาษาไทย (ไม่ต้องแสดงรหัสอาชีพ เว้นแต่ผู้ใช้ถาม)
8. ตอบเฉพาะเรื่องอาชีพ การเรียนรู้ และการพัฒนาตัวเอง ถ้าถามเรื่องอื่นให้ชวนกลับมาเรื่องอาชีพอย่างสุภาพ"""


def system_prompt(body: ChatIn) -> str:
    p = get_predictor()
    ctx = ["สถานะผู้ใช้: " + ("ทำแบบประเมินแล้ว (เครื่องมือใช้คำตอบของผู้ใช้ได้)" if body.user else "ยังไม่ได้ทำแบบประเมิน")]
    if body.target_code and body.target_code in p.code_idx:
        ctx.append(f"อาชีพที่ผู้ใช้กำลังสนใจในแชทนี้ (คำว่า 'อาชีพนี้' หมายถึงอาชีพนี้): {_title(body.target_code)} (รหัส {body.target_code})")
    return SYSTEM + "\n\n" + "\n".join(ctx)


# ---------------- endpoint ----------------
@router.post("/chat", response_model=ChatOut)
def chat(body: ChatIn):
    c = client()
    if c is None:
        raise HTTPException(503, "ยังไม่ได้ตั้งค่า GEMINI_API_KEY — AI Advisor ปิดอยู่")
    p = get_predictor()
    if body.user is not None:
        unknown = sorted(set(body.user) - set(p.features))
        if unknown:
            raise HTTPException(422, f"ไม่รู้จัก feature: {', '.join(unknown[:5])}")

    from google.genai import errors, types

    contents = [
        types.Content(role="model" if t.role == "assistant" else "user", parts=[types.Part(text=t.text)])
        for t in body.history[-20:]
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=body.message)]))
    config = types.GenerateContentConfig(
        system_instruction=system_prompt(body),
        tools=make_tools(body.user),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=MAX_TOOL_CALLS),
    )
    r, used_model, last = None, MODEL, None
    for m in dict.fromkeys([MODEL, *FALLBACK_MODELS]):  # ไม่ซ้ำ คงลำดับ
        try:
            r, used_model = c.models.generate_content(model=m, contents=contents, config=config), m
            break
        except errors.ServerError as e:  # 503 high demand / 504 — ลองโมเดลถัดไป
            last = e
        except errors.ClientError as e:
            if e.code in (404, 429):  # ไม่มีโมเดลนี้ในบัญชี / โควตาของโมเดลนี้เต็ม — ลองโมเดลถัดไป
                last = e
                continue
            raise HTTPException(502, f"เรียก AI ไม่สำเร็จ ({e.code})") from e
    if r is None:
        if isinstance(last, errors.ClientError) and last.code == 429:
            raise HTTPException(429, "โควตา AI เต็มชั่วคราว ลองใหม่อีกสักครู่") from last
        raise HTTPException(503, "บริการ AI มีผู้ใช้มากชั่วคราว ลองใหม่อีกสักครู่") from last

    used: list[str] = []
    for h in r.automatic_function_calling_history or []:
        for part in h.parts or []:
            if part.function_call and part.function_call.name not in used:
                used.append(part.function_call.name)
    text = (r.text or "").strip() or "ขออภัย ตอนนี้ตอบไม่ได้ ลองถามใหม่อีกครั้งนะครับ"
    return ChatOut(reply=text, tools_used=used, model=used_model)
