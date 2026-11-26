"""
เทสต์การประเมินหลายชั้น
- persona / ความเสถียร: เกณฑ์ตั้งต่ำกว่าผลปัจจุบันเล็กน้อย เป็นตัวกันถอยหลัง (regression guard) ไม่ใช่การอ้างว่าแม่น
- ผู้ใช้จริง: ทดสอบว่า pipeline ทำงานทั้งตอนไม่มีข้อมูลและตอนมีข้อมูล (ใช้ข้อมูลสังเคราะห์ในไฟล์ชั่วคราว)
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app, ev, get_predictor


@pytest.fixture(scope="module")
def p():
    return get_predictor()


@pytest.fixture(scope="module")
def personas():
    return json.loads(ev.PERSONAS.read_text(encoding="utf-8"))["personas"]


def test_personas_regression_guard(p, personas):
    r = ev.eval_personas(p, personas)
    # รอบที่ 4 (12 พ.ย. 2026, persona 28 แบบ): soc hit@5 79%, strict 71%, นอกสาย IT soc 75% — ต่ำกว่านี้มาก = ถอยหลัง
    assert r["soc"]["hit_at_5"] >= 0.7
    assert r["strict"]["hit_at_5"] >= 0.6
    assert r["by_group"]["non_it"]["soc"]["hit_at_5"] >= 0.65, "กลุ่มเป้าหมายหลัก (ทุกสาย) ต้องไม่ถอยหลัง"
    top = [x for x in r["rows"] if x["id"] in {"bi_analyst", "frontend_dev", "qa_tester", "dba", "chef", "driver", "accountant"}]
    assert all(x["rank_strict"] == 1 for x in top), [(x["id"], x["rank_strict"]) for x in top]


def test_stability(p, personas):
    s = ev.eval_stability(p, personas, trials=10)
    assert s["top5_overlap_mean"] >= 0.85
    assert s["top1_unchanged_rate"] >= 0.85


def test_closing_gap_never_lowers_coverage(p, personas):
    assert ev.eval_monotonic(p, personas)["coverage_not_decreased_rate"] == 1.0


def _synthetic_labels(p, personas, n):
    rows = []
    for i in range(n):
        ps = personas[i % len(personas)]
        rows.append({"answers": ev.persona_answers(p, ps), "code": ps["expected"][0], "consent": True})
    return rows


def test_real_users_absent(p, tmp_path):
    r = ev.eval_real_users(p, ev.load_real_users(tmp_path / "none.jsonl"))
    assert r["available"] is False and r["n"] == 0


def test_real_users_small_reports_without_tuning(p, personas):
    r = ev.eval_real_users(p, _synthetic_labels(p, personas, 10))
    assert r["available"] and r["n"] == 10 and "suggested_weight" not in r


def test_real_users_enough_suggests_weight(p, personas):
    r = ev.eval_real_users(p, _synthetic_labels(p, personas, ev.MIN_REAL_FOR_TUNING))
    assert 0 <= r["suggested_weight"] <= 1 and len(r["weight_grid"]) == 21


def test_label_endpoint_roundtrip(p, personas, tmp_path, monkeypatch):
    f = tmp_path / "labels.jsonl"
    monkeypatch.setenv("REAL_USERS_FILE", str(f))
    answers = ev.persona_answers(p, personas[0])
    with TestClient(app) as c:
        assert c.get("/api/evaluation").json()["real_users"]["available"] is False
        body = {"answers": answers, "code": "15-2051.00", "years_in_role": "1-3", "consent": True}
        assert c.post("/api/labels", json=body).json() == {"saved": True, "total": 1}
        assert c.post("/api/labels", json=body | {"consent": False}).status_code == 422
        assert c.post("/api/labels", json=body | {"answers": {"grp::numbers": 3}}).status_code == 422  # ไม่ครบ 71 ข้อ
        assert c.post("/api/labels", json=body | {"code": "99-9999.99"}).status_code == 404
        rep = c.get("/api/evaluation").json()
    assert rep["real_users"]["available"] is True and rep["real_users"]["n"] == 1
    saved = json.loads(f.read_text().splitlines()[0])
    assert set(saved) == {"answers", "code", "years_in_role", "consent", "created_at"}  # ไม่มีข้อมูลระบุตัวตน


def test_careers_list():
    with TestClient(app) as c:
        r = c.get("/api/careers").json()
    assert len(r) == 910 and {"code", "title"} <= set(r[0])


def test_counterfactual_eval(p, personas):
    cf = ev.eval_counterfactual(p, personas[:6])
    assert cf["verified_rate"] == 1.0, "อันดับที่ counterfactual รายงานต้องตรงกับการคำนวณใหม่เสมอ"
    assert cf["all"]["20"]["reached_rate"] >= cf["skills"]["20"]["reached_rate"]
