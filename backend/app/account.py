"""
บัญชีผู้ใช้ + ข้อมูลส่วนตัว (ระยะ 3) — ทุก endpoint อยู่ใต้ /api และต้องตั้ง DATABASE_URL (ไม่ตั้ง = 503)

- รหัสผ่าน hash ด้วย bcrypt · JWT (HS256) เก็บแค่ user_id (sub) + วันหมดอายุ
- ผลประเมินคำนวณที่ backend ด้วย CareerPredictor ตัวเดียวกับ /api/recommend — ไม่รับ "ผล" จาก client
- ทุก query กรองด้วย user_id จาก token — เข้าถึงข้อมูลของคนอื่นไม่ได้
"""

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import bcrypt
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import db
from .deps import get_predictor

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_dev_secret = secrets.token_urlsafe(48)


def jwt_secret() -> str:
    s = os.getenv("JWT_SECRET")
    if not s or s == "change-me":
        log.warning("ไม่ได้ตั้ง JWT_SECRET — ใช้ค่าสุ่มชั่วคราว (token ใช้ไม่ได้หลังรีสตาร์ต) ตั้งใน backend/.env")
        return _dev_secret
    return s


# ---------------- dependencies ----------------
def session():
    if not db.enabled():
        raise HTTPException(503, "ยังไม่ได้ตั้งค่าฐานข้อมูล (DATABASE_URL) — ระบบบัญชีปิดอยู่")
    yield from db.get_session()


S = Annotated[Session, Depends(session)]


def make_token(user_id: int, remember: bool = True) -> str:
    """remember=False ("จดจำฉัน" ไม่ติ๊ก) = token อายุ 1 วัน · ติ๊ก = JWT_EXPIRE_DAYS (ค่าเริ่มต้น 14 วัน)"""
    days = float(os.getenv("JWT_EXPIRE_DAYS", "14")) if remember else 1.0
    payload = {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(days=days)}
    return jwt.encode(payload, jwt_secret(), algorithm="HS256")


def current_user(s: S, authorization: Annotated[str | None, Header()] = None) -> db.User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "ต้องเข้าสู่ระบบ")
    try:
        uid = int(jwt.decode(authorization[7:], jwt_secret(), algorithms=["HS256"])["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "เซสชันหมดอายุ — เข้าสู่ระบบใหม่")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(401, "token ไม่ถูกต้อง")
    u = s.get(db.User, uid)
    if u is None:
        raise HTTPException(401, "ไม่พบบัญชี")
    return u


U = Annotated[db.User, Depends(current_user)]


# ---------------- schemas ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt ใช้ได้สูงสุด 72 ไบต์
    name: str = Field(min_length=1, max_length=120)
    status: str | None = Field(None, max_length=120)
    education: str | None = Field(None, max_length=60)
    remember: bool = True


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)
    remember: bool = True


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    status: str | None = None
    education: str | None = None


class AuthOut(BaseModel):
    token: str
    user: UserOut


class MePatch(BaseModel):
    """ข้อมูลโปรไฟล์ — ไม่ใช่ input ของโมเดล (สาขาที่จบเก็บใน /me/targets)"""
    name: str | None = Field(None, min_length=1, max_length=120)
    status: str | None = Field(None, max_length=120)
    education: str | None = Field(None, max_length=60)


Answer = Annotated[int, Field(ge=1, le=5)]


class AssessmentIn(BaseModel):
    answers: dict[str, Answer]


class HistoryOut(BaseModel):
    id: int
    created_at: datetime
    top_code: str
    scores: dict[str, float]  # code → skill_coverage_percent ของ Top 5


class AssessmentOut(BaseModel):
    id: int
    created_at: datetime
    answers: dict[str, int]
    result: dict


class TargetsIn(BaseModel):
    target_code: str | None = None
    goal: dict | None = None
    major: str | None = None
    clear_goal: bool = False


class TargetsOut(BaseModel):
    target_code: str | None = None
    goal: dict | None = None
    major: str | None = None


RoadmapStatus = Literal["todo", "doing", "done", "passed"]


class RoadmapIn(BaseModel):
    items: dict[Annotated[str, Field(max_length=120)], RoadmapStatus]


class MessageIO(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=20_000)


class ConversationIO(BaseModel):
    id: str = Field(max_length=64)
    title: str = Field(max_length=200)
    careerCode: str | None = None
    careerTitle: str | None = None
    createdAt: int  # ms ตาม frontend
    messages: list[MessageIO] = Field(max_length=500)


class LearningIO(BaseModel):
    code: str = Field(max_length=10)
    title: str = Field(max_length=200)
    completedAt: int  # ms ตาม frontend
    total: int = Field(ge=0)
    skills: int = Field(ge=0)
    passed: int = Field(ge=0)


class StateOut(BaseModel):
    user: UserOut
    latest: AssessmentOut | None
    history: list[HistoryOut]
    targets: TargetsOut
    roadmap: dict[str, str]
    conversations: list[ConversationIO]
    learning: list[LearningIO] = []


# ---------------- helpers ----------------
def user_out(u: db.User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, status=u.status, education=u.education)


def history_row(a: db.Assessment) -> HistoryOut:
    return HistoryOut(
        id=a.id, created_at=a.created_at, top_code=a.top_code,
        scores={c["code"]: c["skill_coverage_percent"] for c in a.result.get("careers", [])},
    )


def conv_out(c: db.Conversation) -> ConversationIO:
    return ConversationIO(
        id=c.id, title=c.title, careerCode=c.career_code, careerTitle=c.career_title,
        createdAt=int(c.created_at.timestamp() * 1000),
        messages=[MessageIO(role=m.role, text=m.text) for m in c.messages],
    )


# ---------------- auth ----------------
@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, s: S):
    email = body.email.lower()
    if s.scalar(select(db.User).where(db.User.email == email)):
        raise HTTPException(409, "อีเมลนี้มีบัญชีแล้ว — เข้าสู่ระบบแทน")
    u = db.User(email=email, name=body.name.strip(), status=body.status, education=body.education or None,
                password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode())
    s.add(u)
    s.commit()
    return AuthOut(token=make_token(u.id, body.remember), user=user_out(u))


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, s: S):
    u = s.scalar(select(db.User).where(db.User.email == body.email.lower()))
    # ข้อความเดียวกันทั้งอีเมลไม่มีและรหัสผิด — ไม่บอกว่ามีบัญชีนี้หรือไม่
    if u is None or not bcrypt.checkpw(body.password.encode(), u.password_hash.encode()):
        raise HTTPException(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
    return AuthOut(token=make_token(u.id, body.remember), user=user_out(u))


@router.get("/me", response_model=UserOut)
def me(u: U):
    return user_out(u)


@router.patch("/me", response_model=UserOut)
def update_me(body: MePatch, u: U, s: S):
    if body.name is not None:
        u.name = body.name.strip()
    if body.status is not None:
        u.status = body.status or None
    if body.education is not None:
        u.education = body.education or None
    s.commit()
    return user_out(u)


@router.delete("/me", status_code=204)
def delete_me(u: U, s: S):
    """ลบบัญชีและข้อมูลทั้งหมดของผู้ใช้ — messages ถูกลบตาม conversations ด้วย FK ON DELETE CASCADE"""
    for model in (db.Conversation, db.RoadmapItem, db.LearningRecord, db.UserTarget, db.Assessment):
        s.query(model).filter(model.user_id == u.id).delete(synchronize_session=False)
    s.delete(u)
    s.commit()


# ---------------- ผลประเมิน ----------------
@router.post("/assessments", response_model=AssessmentOut, status_code=201)
def create_assessment(body: AssessmentIn, u: U, s: S):
    p = get_predictor()
    unknown = sorted(set(body.answers) - set(p.features))
    if unknown:
        raise HTTPException(422, f"ไม่รู้จัก feature: {', '.join(unknown[:5])}")
    missing = [f for f in p.features if f not in body.answers]
    if missing:
        raise HTTPException(422, f"ตอบไม่ครบ {len(missing)} ข้อ")
    vec = {f: (body.answers[f] - 1) / 4 * 100 for f in p.features}  # สูตรเดียวกับ frontend (คำตอบ − 1) ÷ 4 × 100
    result = p.recommend(vec, k=5)
    a = db.Assessment(user_id=u.id, answers=dict(body.answers), user_vector=[vec[f] for f in p.features],
                      result=result, top_code=result["careers"][0]["code"])
    s.add(a)
    # ประเมินใหม่ = คงเป้าหมายเดิมไว้ (Skill Gap/Roadmap ต้องเทียบกับอาชีพเดิมจึงเห็นพัฒนาการ) — เหมือน frontend saveResult
    # อาชีพที่อยากเป็น: คำนวณอันดับใหม่จากคำตอบชุดนี้ · เป้าหมายที่หลุด Top 5 และไม่ใช่อาชีพที่อยากเป็น → อันดับ 1
    t = s.get(db.UserTarget, u.id) or db.UserTarget(user_id=u.id)
    goal_code = (t.goal or {}).get("code")
    if goal_code:
        t.goal = p.target(vec, goal_code)["career"]
    top_codes = {c["code"] for c in result["careers"]}
    if t.target_code not in top_codes and not (goal_code and t.target_code == goal_code):
        t.target_code = a.top_code
    s.add(t)
    s.commit()
    return AssessmentOut(id=a.id, created_at=a.created_at, answers=a.answers, result=a.result)


@router.get("/assessments", response_model=list[HistoryOut])
def list_assessments(u: U, s: S, limit: int = 12):
    rows = s.scalars(select(db.Assessment).where(db.Assessment.user_id == u.id)
                     .order_by(db.Assessment.created_at.desc(), db.Assessment.id.desc()).limit(max(1, min(limit, 100)))).all()
    return [history_row(a) for a in reversed(rows)]


@router.get("/assessments/{aid}", response_model=AssessmentOut)
def get_assessment(aid: int, u: U, s: S):
    a = s.get(db.Assessment, aid)
    if a is None or a.user_id != u.id:
        raise HTTPException(404, "ไม่พบผลประเมิน")
    return AssessmentOut(id=a.id, created_at=a.created_at, answers=a.answers, result=a.result)


# ---------------- เป้าหมาย / Roadmap / แชท ----------------
@router.put("/me/targets", response_model=TargetsOut)
def put_targets(body: TargetsIn, u: U, s: S):
    t = s.get(db.UserTarget, u.id) or db.UserTarget(user_id=u.id)
    if body.target_code is not None:
        if body.target_code not in get_predictor().code_idx:
            raise HTTPException(404, f"ไม่พบอาชีพ {body.target_code}")
        t.target_code = body.target_code
    if body.goal is not None:
        t.goal = body.goal
    if body.clear_goal:
        t.goal = None
    if body.major is not None:
        t.major = body.major or None
    s.add(t)
    s.commit()
    return TargetsOut(target_code=t.target_code, goal=t.goal, major=t.major)


@router.put("/roadmap", response_model=dict[str, str])
def put_roadmap(body: RoadmapIn, u: U, s: S):
    """อัปเดตหลายรายการพร้อมกัน (ใช้ตอนย้ายข้อมูลจากเบราว์เซอร์ด้วย)"""
    have = {r.key: r for r in s.scalars(select(db.RoadmapItem).where(db.RoadmapItem.user_id == u.id))}
    for k, st in body.items.items():
        if k in have:
            have[k].status = st
        else:
            s.add(db.RoadmapItem(user_id=u.id, key=k, status=st))
    s.commit()
    return {r.key: r.status for r in s.scalars(select(db.RoadmapItem).where(db.RoadmapItem.user_id == u.id))}


def learning_out(r: db.LearningRecord) -> LearningIO:
    at = r.completed_at if r.completed_at.tzinfo else r.completed_at.replace(tzinfo=timezone.utc)  # SQLite ไม่เก็บ tz
    return LearningIO(code=r.code, title=r.title, completedAt=int(at.timestamp() * 1000),
                      total=r.total, skills=r.skills, passed=r.passed)


@router.put("/learning/{code}", response_model=LearningIO)
def put_learning(code: str, body: LearningIO, u: U, s: S):
    """บันทึกว่า Roadmap ของอาชีพนี้ครบแล้ว — มีอยู่แล้ว = คงวันที่ครบครั้งแรก อัปเดตตัวเลขล่าสุด"""
    if body.code != code:
        raise HTTPException(422, "code ไม่ตรงกับ URL")
    if code not in get_predictor().code_idx:
        raise HTTPException(404, f"ไม่พบอาชีพ {code}")
    r = s.scalars(select(db.LearningRecord).where(db.LearningRecord.user_id == u.id,
                                                  db.LearningRecord.code == code)).first()
    if r is None:
        r = db.LearningRecord(user_id=u.id, code=code,
                              completed_at=datetime.fromtimestamp(body.completedAt / 1000, timezone.utc))
        s.add(r)
    r.title, r.total, r.skills, r.passed = body.title, body.total, body.skills, body.passed
    s.commit()
    s.refresh(r)
    return learning_out(r)


@router.delete("/learning/{code}", status_code=204)
def delete_learning(code: str, u: U, s: S):
    s.query(db.LearningRecord).filter(db.LearningRecord.user_id == u.id,
                                      db.LearningRecord.code == code).delete(synchronize_session=False)
    s.commit()


@router.put("/conversations/{cid}", response_model=ConversationIO)
def put_conversation(cid: str, body: ConversationIO, u: U, s: S):
    if body.id != cid:
        raise HTTPException(422, "id ไม่ตรงกับ URL")
    c = s.get(db.Conversation, cid)
    if c is not None and c.user_id != u.id:
        raise HTTPException(404, "ไม่พบบทสนทนา")
    if c is None:
        c = db.Conversation(id=cid, user_id=u.id,
                            created_at=datetime.fromtimestamp(body.createdAt / 1000, timezone.utc))
        s.add(c)
    c.title, c.career_code, c.career_title = body.title, body.careerCode, body.careerTitle
    c.messages = [db.Message(seq=i, role=m.role, text=m.text) for i, m in enumerate(body.messages)]
    s.commit()
    s.refresh(c)
    return conv_out(c)


@router.delete("/conversations/{cid}", status_code=204)
def delete_conversation(cid: str, u: U, s: S):
    c = s.get(db.Conversation, cid)
    if c is not None and c.user_id == u.id:
        s.delete(c)
        s.commit()


# ---------------- ทั้งหมดในครั้งเดียว (ตอนเข้าสู่ระบบ) ----------------
@router.get("/me/state", response_model=StateOut)
def state(u: U, s: S):
    latest = s.scalars(select(db.Assessment).where(db.Assessment.user_id == u.id)
                       .order_by(db.Assessment.created_at.desc(), db.Assessment.id.desc()).limit(1)).first()
    t = s.get(db.UserTarget, u.id)
    convs = s.scalars(select(db.Conversation).where(db.Conversation.user_id == u.id)
                      .order_by(db.Conversation.created_at.desc())).all()
    return StateOut(
        user=user_out(u),
        latest=None if latest is None else AssessmentOut(id=latest.id, created_at=latest.created_at,
                                                          answers=latest.answers, result=latest.result),
        history=list_assessments(u, s),
        targets=TargetsOut(target_code=t.target_code, goal=t.goal, major=t.major) if t else TargetsOut(),
        roadmap={r.key: r.status for r in s.scalars(select(db.RoadmapItem).where(db.RoadmapItem.user_id == u.id))},
        conversations=[conv_out(c) for c in convs],
        learning=[learning_out(r) for r in s.scalars(
            select(db.LearningRecord).where(db.LearningRecord.user_id == u.id)
            .order_by(db.LearningRecord.completed_at.desc()))],
    )
