"""
ฐานข้อมูล (ระยะ 3) — PostgreSQL + pgvector ตอนใช้งานจริง, SQLite ตอนเทสต์

ตาราง
  users          บัญชี (รหัสผ่าน hash ด้วย bcrypt) — JWT เก็บแค่ user_id
  careers        910 อาชีพ + skill_vector vector(76) ตาม feature_order ของโมเดลรอบ 4 (HNSW index, cosine)
  assessments    คำตอบ 1–5 + user_vector vector(76) + ผล recommend() ที่ backend คำนวณ (ไม่รับผลจาก client)
  user_targets   อาชีพเป้าหมาย / อาชีพที่อยากเป็น / สาขาที่จบ (1 แถวต่อผู้ใช้)
  roadmap_items  สถานะรายการใน Roadmap (todo/doing/done/passed)
  conversations  แชท AI Advisor · messages ข้อความในแชท
  real_labels    ข้อมูลผู้ใช้จริงจากการ์ดท้ายแบบประเมิน (POST /api/labels) — คำตอบ + อาชีพจริง ไม่มีชื่อ/อีเมล
                 (เดิมเขียนไฟล์ — บนเซิร์ฟเวอร์ที่ดิสก์ไม่ถาวร เช่น Hugging Face Spaces ไฟล์จะหาย)

ต่างจาก schema ร่าง careerpath-db (11 ตาราง): ไม่มี skills/career_skills/user_skills/view skill_gaps
เพราะ Skill Gap คำนวณจากโมเดล (predict.py) ทุกครั้ง · results รวมอยู่ใน assessments.result
"""

import os
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    inspect,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

DIM = 76  # ต้องตรงกับ len(feature_order) ใน model_config.json — ตรวจตอนเริ่ม (check_dim)


def now() -> datetime:
    return datetime.now(timezone.utc)


class Vec(TypeDecorator):
    """vector(76) บน PostgreSQL (pgvector) · JSON list บนฐานข้อมูลอื่น (SQLite ตอนเทสต์)"""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector

            return dialect.type_descriptor(Vector(DIM))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value, dialect):
        return None if value is None else [float(x) for x in value]

    def process_result_value(self, value, dialect):
        return None if value is None else [float(x) for x in value]


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str | None] = mapped_column(String(120))  # สถานะตอนนี้ (ไม่เข้าโมเดล)
    education: Mapped[str | None] = mapped_column(String(60))  # ระดับการศึกษา (ไม่เข้าโมเดล)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Career(Base):
    __tablename__ = "careers"
    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    major: Mapped[str] = mapped_column(String(2))
    skill_vector: Mapped[list[float]] = mapped_column(Vec)


class Assessment(Base):
    __tablename__ = "assessments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    answers: Mapped[dict] = mapped_column(JSON)  # feature → 1..5
    user_vector: Mapped[list[float]] = mapped_column(Vec)  # 0–100 ตาม feature_order
    result: Mapped[dict] = mapped_column(JSON)  # recommend() ที่ backend คำนวณ
    top_code: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class UserTarget(Base):
    __tablename__ = "user_targets"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    target_code: Mapped[str | None] = mapped_column(String(10))
    goal: Mapped[dict | None] = mapped_column(JSON)  # CareerResult ของอาชีพที่อยากเป็น (อันดับคำนวณจาก /target)
    major: Mapped[str | None] = mapped_column(String(20))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class RoadmapItem(Base):
    __tablename__ = "roadmap_items"
    __table_args__ = (UniqueConstraint("user_id", "key"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(120))  # `${code}|${itemId}`
    status: Mapped[str] = mapped_column(String(10))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class LearningRecord(Base):
    """บันทึกการเรียน: Roadmap ของอาชีพนี้ครบทุกรายการแล้ว (หน้าโปรไฟล์) — 1 แถวต่ออาชีพ"""
    __tablename__ = "learning_records"
    __table_args__ = (UniqueConstraint("user_id", "code"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(200))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # ครั้งแรกที่ครบ
    total: Mapped[int] = mapped_column(Integer)  # จำนวนรายการใน Roadmap
    skills: Mapped[int] = mapped_column(Integer)  # จำนวนทักษะใน Roadmap
    passed: Mapped[int] = mapped_column(Integer)  # ทักษะที่ผ่านเกณฑ์จากคะแนนประเมินจริง
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # id จาก client (uuid)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    career_code: Mapped[str | None] = mapped_column(String(10))
    career_title: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.seq"
    )


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(Text)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class RealLabel(Base):
    __tablename__ = "real_labels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)  # {answers, code, years_in_role, consent, created_at} รูปแบบเดียวกับ labels.jsonl
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# ---------------- engine ----------------
_engine = None
_Session: sessionmaker[Session] | None = None


def database_url() -> str | None:
    """DATABASE_URL — รับรูปแบบที่ผู้ให้บริการแจก (postgres:// หรือ postgresql://) แล้วระบุ driver psycopg ให้"""
    url = os.getenv("DATABASE_URL") or None
    if url and url.startswith(("postgres://", "postgresql://")):
        url = "postgresql+psycopg://" + url.split("://", 1)[1]
    return url


def init_db(url: str | None = None):
    """สร้าง engine + ตาราง (create_all) — ไม่มี URL = ปิดระบบบัญชี"""
    global _engine, _Session
    url = url or database_url()
    if not url:
        _engine, _Session = None, None
        return None
    kw = {}
    if url.startswith("sqlite"):
        kw = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
    _engine = create_engine(url, pool_pre_ping=True, **kw)
    if _engine.dialect.name == "sqlite":
        event.listen(_engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
    if _engine.dialect.name == "postgresql":
        with _engine.begin() as c:
            c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(_engine)
    _add_missing_columns(_engine)
    if _engine.dialect.name == "postgresql":
        with _engine.begin() as c:
            # HNSW index สำหรับค้นอาชีพที่ใกล้ที่สุดด้วย cosine (เทียบเท่าโมเดล ①)
            c.execute(text("CREATE INDEX IF NOT EXISTS careers_skill_vector_hnsw ON careers USING hnsw (skill_vector vector_cosine_ops)"))
    _Session = sessionmaker(_engine, expire_on_commit=False)
    return _engine


# คอลัมน์ที่เพิ่มหลังสร้างตารางครั้งแรก — create_all ไม่แก้ตารางที่มีอยู่แล้ว จึงเพิ่มเอง (ไม่ลบ/ไม่เปลี่ยนชนิดข้อมูล)
_LATE_COLUMNS = {"users": {"education": "VARCHAR(60)"}}


def _add_missing_columns(engine) -> None:
    insp = inspect(engine)
    for table, cols in _LATE_COLUMNS.items():
        have = {c["name"] for c in insp.get_columns(table)}
        with engine.begin() as c:
            for name, ddl in cols.items():
                if name not in have:
                    c.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def enabled() -> bool:
    return _Session is not None


def get_session():
    assert _Session is not None
    with _Session() as s:
        yield s


def seed_careers(predictor) -> int:
    """ใส่ 910 อาชีพ + skill_vector จาก reference vectors ของโมเดล (ครั้งแรกเท่านั้น)"""
    assert _Session is not None
    with _Session() as s:
        if s.query(Career).count() == len(predictor.codes):
            return 0
        s.query(Career).delete()
        for i, c in enumerate(predictor.codes):
            s.add(Career(code=c, title=predictor._title(c), major=c[:2], skill_vector=predictor.R[i].tolist()))
        s.commit()
        return len(predictor.codes)


def check_dim(predictor) -> None:
    if len(predictor.features) != DIM:
        raise RuntimeError(f"feature_order มี {len(predictor.features)} มิติ แต่ฐานข้อมูลใช้ vector({DIM}) — แก้ DIM ใน app/db.py")


# ---------------- ข้อมูลผู้ใช้จริง ----------------
def add_real_label(row: dict) -> int:
    """บันทึก 1 แถว แล้วคืนจำนวนแถวทั้งหมดในตาราง"""
    assert _Session is not None
    with _Session() as s:
        s.add(RealLabel(data=row))
        s.commit()
        return s.query(RealLabel).count()


def real_label_rows() -> list[dict]:
    if _Session is None:
        return []
    with _Session() as s:
        return [r.data for r in s.query(RealLabel).order_by(RealLabel.id)]


def real_label_count() -> int:
    if _Session is None:
        return 0
    with _Session() as s:
        return s.query(RealLabel).count()
