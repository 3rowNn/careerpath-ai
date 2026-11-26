"""AI Advisor: เครื่องมือต้องคืนค่าเดียวกับ predict.py (LLM แค่อธิบาย ไม่คำนวณใหม่) — ไม่เรียก Gemini จริง"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import advisor
from app.main import app, get_predictor

SAMPLE = json.loads((Path(__file__).resolve().parents[2] / "frontend/src/data/sample_result.json").read_text())
USER = {f: (a - 1) / 4 * 100 for f, a in SAMPLE["answers"].items()}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def tools(user):
    return {t.__name__: t for t in advisor.make_tools(user)}


def test_chat_without_key_is_503(client):
    r = client.post("/api/advisor/chat", json={"message": "สวัสดี", "user": USER})
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]


def test_chat_rejects_unknown_feature(client, monkeypatch):
    monkeypatch.setattr(advisor, "client", lambda: object())
    r = client.post("/api/advisor/chat", json={"message": "x", "user": {"grp::nope": 1}})
    assert r.status_code == 422


def test_top_careers_tool_matches_predictor():
    p = get_predictor()
    want = p.recommend(USER, k=5)
    got = tools(USER)["get_my_top_careers"]()
    assert [c["code"] for c in got["top5"]] == [c["code"] for c in want["careers"]]
    assert [c["skill_coverage_percent"] for c in got["top5"]] == [c["skill_coverage_percent"] for c in want["careers"]]
    assert got["confidence"]["level"] == want["confidence"]["level"]


def test_skill_gap_and_target_tools_match_predictor():
    p = get_predictor()
    code = p.recommend(USER, k=1)["careers"][0]["code"]
    g = tools(USER)["get_skill_gap"](code)
    want = p.skill_gap(USER, code, k=8)
    assert [r["skill"] for r in g["learn_first"]] == [r["name"] for r in want["top_priorities"]]
    assert g["skills_met"] == f'{want["skills_met"]}/{want["skills_total"]}'
    t = tools(USER)["check_target_career"]("29-1141.00")
    assert t["rank_out_of_910"] == p.target(USER, "29-1141.00")["career"]["rank"]


def test_tools_without_assessment_and_bad_code():
    T = tools(None)
    assert "error" in T["get_my_top_careers"]() and "error" in T["get_skill_gap"]("29-1141.00")
    assert "error" in tools(USER)["explain_career"]("99-9999.99")
    info = T["get_career_info"]("29-1141.00")  # ข้อมูลอาชีพไม่ต้องใช้ผลประเมิน
    assert info["title_th"] and info["main_tasks_en"]


def test_search_by_thai_name_without_llm():
    codes = [r["code"] for r in advisor.search("พยาบาลวิชาชีพ")]
    assert "29-1141.00" in codes
