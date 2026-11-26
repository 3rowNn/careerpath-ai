"""ระบบบัญชี (ระยะ 3) — SQLite ในหน่วยความจำ · เทสต์ pgvector อยู่ท้ายไฟล์ (ต้องตั้ง PG_TEST_URL)"""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app, get_predictor

SAMPLE = json.loads((Path(__file__).resolve().parents[2] / "frontend/src/data/sample_result.json").read_text())
ANSWERS = SAMPLE["answers"]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def signup(client, email, name="ทดสอบ"):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "name": name})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_register_login_me(client):
    h = signup(client, "A@Example.com")
    assert client.get("/api/me", headers=h).json()["email"] == "a@example.com"  # เก็บอีเมลตัวเล็ก
    # สมัครซ้ำไม่ได้
    assert client.post("/api/auth/register", json={"email": "a@example.com", "password": "password123", "name": "x"}).status_code == 409
    ok = client.post("/api/auth/login", json={"email": "a@example.com", "password": "password123"})
    assert ok.status_code == 200 and ok.json()["token"]
    # รหัสผิดกับอีเมลที่ไม่มี ได้ข้อความเดียวกัน
    bad1 = client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrongpass1"})
    bad2 = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrongpass1"})
    assert bad1.status_code == bad2.status_code == 401 and bad1.json() == bad2.json()


def test_password_is_hashed(client):
    signup(client, "hash@example.com")
    with next(db.get_session()) as s:
        u = s.query(db.User).filter_by(email="hash@example.com").one()
        assert u.password_hash.startswith("$2") and "password123" not in u.password_hash


@pytest.mark.parametrize("header", [None, "Bearer nope", "Basic abc"])
def test_requires_valid_token(client, header):
    h = {"Authorization": header} if header else {}
    assert client.get("/api/me", headers=h).status_code == 401


def test_short_password_rejected(client):
    r = client.post("/api/auth/register", json={"email": "s@example.com", "password": "short", "name": "x"})
    assert r.status_code == 422


def test_assessment_computed_on_server(client):
    h = signup(client, "assess@example.com")
    r = client.post("/api/assessments", json={"answers": ANSWERS}, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    # ผลตรงกับ predictor และกับข้อมูลตัวอย่างของ frontend
    vec = {f: (a - 1) / 4 * 100 for f, a in ANSWERS.items()}
    want = [c["code"] for c in get_predictor().recommend(vec, k=5)["careers"]]
    assert [c["code"] for c in body["result"]["careers"]] == want == [c["code"] for c in SAMPLE["recommend"]["careers"]]
    # เก็บ user_vector 76 มิติ และตั้งเป้าหมาย = อันดับ 1
    with next(db.get_session()) as s:
        a = s.get(db.Assessment, body["id"])
        assert len(a.user_vector) == 76
    st = client.get("/api/me/state", headers=h).json()
    assert st["latest"]["id"] == body["id"] and st["targets"]["target_code"] == want[0]
    assert len(st["history"]) == 1 and st["history"][0]["top_code"] == want[0]


def test_reassessment_keeps_target_and_goal(client):
    """ประเมินใหม่ต้องไม่ทิ้งเป้าหมาย — Skill Gap/Roadmap เทียบกับอาชีพเดิมจึงเห็นพัฒนาการ"""
    h = signup(client, "keep@example.com")
    client.post("/api/assessments", json={"answers": ANSWERS}, headers=h)
    vec = {f: (a - 1) / 4 * 100 for f, a in ANSWERS.items()}
    p = get_predictor()
    top = [c["code"] for c in p.recommend(vec, k=5)["careers"]]
    goal_code = "29-1141.00"
    assert goal_code not in top
    # 1) เป้าหมายเป็นอันดับ 3 ใน Top 5 → ประเมินซ้ำแล้วยังเป็นอาชีพเดิม
    client.put("/api/me/targets", json={"target_code": top[2]}, headers=h)
    client.post("/api/assessments", json={"answers": ANSWERS}, headers=h)
    assert client.get("/api/me/state", headers=h).json()["targets"]["target_code"] == top[2]
    # 2) อาชีพที่อยากเป็น (นอก Top 5) → คงไว้ และอันดับคำนวณใหม่จากคำตอบชุดใหม่
    client.put("/api/me/targets", json={"target_code": goal_code, "goal": {"code": goal_code, "rank": 999}}, headers=h)
    better = {**ANSWERS, **{f: 5 for f in p.features if f.startswith("grp::")}}
    client.post("/api/assessments", json={"answers": better}, headers=h)
    t = client.get("/api/me/state", headers=h).json()["targets"]
    want = p.target({f: (a - 1) / 4 * 100 for f, a in better.items()}, goal_code)["career"]["rank"]
    assert t["target_code"] == goal_code and t["goal"]["rank"] == want != 999


def test_learning_records(client):
    """บันทึกการเรียน: ครั้งแรกที่ครบเก็บวันที่ไว้ บันทึกซ้ำอัปเดตตัวเลขแต่ไม่เปลี่ยนวันที่ · แยกตามผู้ใช้"""
    h = signup(client, "learn@example.com")
    code = "29-1141.00"
    rec = {"code": code, "title": "พยาบาลวิชาชีพ", "completedAt": 1_700_000_000_000, "total": 9, "skills": 6, "passed": 2}
    assert client.put(f"/api/learning/{code}", json=rec, headers=h).status_code == 200
    r = client.put(f"/api/learning/{code}", json={**rec, "completedAt": 1_800_000_000_000, "passed": 6}, headers=h).json()
    assert r["completedAt"] == rec["completedAt"] and r["passed"] == 6
    assert [x["code"] for x in client.get("/api/me/state", headers=h).json()["learning"]] == [code]
    assert client.put("/api/learning/00-0000.00", json={**rec, "code": "00-0000.00"}, headers=h).status_code == 404
    assert client.put(f"/api/learning/{code}", json={**rec, "code": "15-1252.00"}, headers=h).status_code == 422
    other = signup(client, "learn2@example.com")
    assert client.get("/api/me/state", headers=other).json()["learning"] == []
    assert client.delete(f"/api/learning/{code}", headers=h).status_code == 204
    assert client.get("/api/me/state", headers=h).json()["learning"] == []


def test_assessment_validation(client):
    h = signup(client, "valid@example.com")
    partial = dict(list(ANSWERS.items())[:10])
    assert client.post("/api/assessments", json={"answers": partial}, headers=h).status_code == 422
    assert client.post("/api/assessments", json={"answers": {**ANSWERS, "grp::nope": 3}}, headers=h).status_code == 422
    assert client.post("/api/assessments", json={"answers": {**ANSWERS, "grp::numbers": 9}}, headers=h).status_code == 422


def test_cannot_read_other_users_data(client):
    h1, h2 = signup(client, "one@example.com"), signup(client, "two@example.com")
    aid = client.post("/api/assessments", json={"answers": ANSWERS}, headers=h1).json()["id"]
    assert client.get(f"/api/assessments/{aid}", headers=h2).status_code == 404
    conv = {"id": "c-1", "title": "แชท", "careerCode": None, "careerTitle": None, "createdAt": 1_700_000_000_000,
            "messages": [{"role": "user", "text": "สวัสดี"}]}
    assert client.put("/api/conversations/c-1", json=conv, headers=h1).status_code == 200
    # คนอื่นแก้ทับไม่ได้ และไม่เห็นในรายการของตัวเอง
    assert client.put("/api/conversations/c-1", json=conv, headers=h2).status_code == 404
    assert client.get("/api/me/state", headers=h2).json()["conversations"] == []
    assert client.get("/api/assessments", headers=h2).json() == []


def test_targets_roadmap_conversations_sync(client):
    h = signup(client, "sync@example.com")
    t = client.put("/api/me/targets", json={"target_code": "29-1141.00", "goal": {"code": "29-1141.00", "rank": 214}, "major": "nursing"}, headers=h)
    assert t.status_code == 200 and t.json()["goal"]["rank"] == 214
    assert client.put("/api/me/targets", json={"target_code": "99-9999.99"}, headers=h).status_code == 404
    assert client.put("/api/me/targets", json={"clear_goal": True}, headers=h).json()["goal"] is None

    r = client.put("/api/roadmap", json={"items": {"29-1141.00|grp::bio_medical": "doing", "29-1141.00|reassess": "done"}}, headers=h)
    assert r.json() == {"29-1141.00|grp::bio_medical": "doing", "29-1141.00|reassess": "done"}
    r = client.put("/api/roadmap", json={"items": {"29-1141.00|grp::bio_medical": "passed"}}, headers=h)
    assert r.json()["29-1141.00|grp::bio_medical"] == "passed"
    assert client.put("/api/roadmap", json={"items": {"x": "bogus"}}, headers=h).status_code == 422

    conv = {"id": "c-sync", "title": "ถามเรื่องพยาบาล", "careerCode": "29-1141.00", "careerTitle": "พยาบาลวิชาชีพ",
            "createdAt": 1_700_000_000_000, "messages": [{"role": "user", "text": "ต้องเรียนอะไร"}, {"role": "assistant", "text": "ชีววิทยา"}]}
    client.put("/api/conversations/c-sync", json=conv, headers=h)
    conv["messages"].append({"role": "user", "text": "ขอบคุณ"})
    client.put("/api/conversations/c-sync", json=conv, headers=h)
    st = client.get("/api/me/state", headers=h).json()
    assert [m["text"] for m in st["conversations"][0]["messages"]] == ["ต้องเรียนอะไร", "ชีววิทยา", "ขอบคุณ"]
    assert client.delete("/api/conversations/c-sync", headers=h).status_code == 204
    assert client.get("/api/me/state", headers=h).json()["conversations"] == []


def test_delete_account(client):
    h = signup(client, "bye@example.com")
    client.post("/api/assessments", json={"answers": ANSWERS}, headers=h)
    assert client.delete("/api/me", headers=h).status_code == 204
    assert client.get("/api/me", headers=h).status_code == 401
    assert client.post("/api/auth/login", json={"email": "bye@example.com", "password": "password123"}).status_code == 401


def test_careers_seeded(client):
    with next(db.get_session()) as s:
        assert s.query(db.Career).count() == 910
        c = s.get(db.Career, "29-1141.00")
        assert len(c.skill_vector) == 76


def test_disabled_without_database():
    """ไม่ตั้ง DATABASE_URL → ระบบบัญชี 503 ส่วน API เดิมใช้ได้"""
    old = os.environ.pop("DATABASE_URL")
    try:
        with TestClient(app) as c:
            assert c.post("/api/auth/login", json={"email": "a@example.com", "password": "x"}).status_code == 503
            assert c.get("/api/health").status_code == 200
    finally:
        os.environ["DATABASE_URL"] = old
        db.init_db()


# ---------------- pgvector (ต้องมี PostgreSQL: PG_TEST_URL=postgresql+psycopg://...) ----------------
@pytest.mark.skipif(not os.getenv("PG_TEST_URL"), reason="ตั้ง PG_TEST_URL เพื่อเทสต์กับ PostgreSQL + pgvector")
def test_pgvector_matches_model_cosine():
    """ค้นอาชีพที่ใกล้ที่สุดด้วย pgvector (<=> cosine distance) ต้องได้ลำดับเดียวกับโมเดล ① Cosine Matching"""
    from sqlalchemy import text

    p = get_predictor()
    eng = db.init_db(os.environ["PG_TEST_URL"])
    try:
        db.seed_careers(p)
        vec = [(ANSWERS[f] - 1) / 4 * 100 for f in p.features]
        with eng.connect() as c:
            c.execute(text("SET hnsw.ef_search = 200"))
            got = [r[0] for r in c.execute(text("SELECT code FROM careers ORDER BY skill_vector <=> CAST(:v AS vector) LIMIT 10"), {"v": str(vec)})]
        want = list(p.codes[(-p.matching_scores(__import__("numpy").array([vec]))[0]).argsort()[:10]])
        assert got[:5] == want[:5]
    finally:
        db.init_db()


def _claims(token):
    import jwt as pyjwt

    return pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])


def test_expired_token_rejected(client):
    from datetime import datetime, timedelta, timezone

    import jwt as pyjwt

    h = signup(client, "exp@example.com")
    uid = client.get("/api/me", headers=h).json()["id"]
    old = pyjwt.encode({"sub": str(uid), "exp": datetime.now(timezone.utc) - timedelta(seconds=5)},
                       os.environ["JWT_SECRET"], algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {old}"})
    assert r.status_code == 401 and "หมดอายุ" in r.json()["detail"]
    # token ที่เซ็นด้วย secret อื่นใช้ไม่ได้
    forged = pyjwt.encode({"sub": str(uid), "exp": datetime.now(timezone.utc) + timedelta(days=1)}, "x" * 40, algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_token_holds_only_user_id_and_remember(client):
    body = {"email": "rem@example.com", "password": "password123", "name": "ร"}
    reg = client.post("/api/auth/register", json=body).json()
    assert set(_claims(reg["token"])) == {"sub", "exp"}
    long_ = client.post("/api/auth/login", json={**body, "remember": True}).json()["token"]
    short = client.post("/api/auth/login", json={**body, "remember": False}).json()["token"]
    days = (_claims(long_)["exp"] - _claims(short)["exp"]) / 86400
    assert days > 10  # ไม่ติ๊ก "จดจำฉัน" = 1 วัน · ติ๊ก = 14 วัน


def test_profile_fields(client):
    h = signup(client, "prof@example.com")
    r = client.patch("/api/me", headers=h, json={"education": "ปริญญาตรี", "status": "กำลังหางาน", "name": "ใหม่"})
    assert r.status_code == 200
    assert {k: r.json()[k] for k in ("education", "status", "name")} == {"education": "ปริญญาตรี", "status": "กำลังหางาน", "name": "ใหม่"}
    # ส่งค่าว่าง = ล้าง
    assert client.patch("/api/me", headers=h, json={"education": ""}).json()["education"] is None
    # สาขาที่จบเก็บใน targets (ใช้กับการ์ดสายที่เรียนจบ)
    assert client.put("/api/me/targets", headers=h, json={"major": "cs"}).json()["major"] == "cs"


def test_adds_missing_column_to_old_table(tmp_path):
    """ฐานข้อมูลเก่าที่สร้างก่อนมีคอลัมน์ education ต้องใช้ต่อได้"""
    from sqlalchemy import create_engine, inspect, text

    url = f"sqlite:///{tmp_path / 'old.db'}"
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(254), password_hash VARCHAR(100), "
                       "name VARCHAR(120), status VARCHAR(120), created_at DATETIME)"))
    eng.dispose()
    try:
        db.init_db(url)
        assert "education" in {c["name"] for c in inspect(db._engine).get_columns("users")}
    finally:
        db.init_db("sqlite://")
        db.seed_careers(get_predictor())
