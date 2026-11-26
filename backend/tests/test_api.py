import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_predictor

SAMPLE = json.loads((Path(__file__).resolve().parents[2] / "frontend/src/data/sample_result.json").read_text())
USER = {f: (a - 1) / 4 * 100 for f, a in SAMPLE["answers"].items()}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health").json()
    assert r == {"status": "ok", "features": 76, "careers": 910, "feature_set": "general"}


def test_recommend_matches_predictor_directly(client):
    r = client.post("/api/recommend", json={"user": USER, "k": 5})
    assert r.status_code == 200
    body = r.json()
    assert [c["code"] for c in body["careers"]] == [c["code"] for c in get_predictor().recommend(USER, k=5)["careers"]]
    # ผลตรงกับที่ frontend ใช้เป็นข้อมูลตัวอย่าง (สร้างจาก predict.py ตัวเดียวกัน)
    assert [c["code"] for c in body["careers"]] == [c["code"] for c in SAMPLE["recommend"]["careers"]]
    assert body["missing_features"] == []


def test_recommend_changes_with_answers(client):
    """คำตอบต่างกัน ผลต้องต่างกัน — ต่างจากโหมดตัวอย่างของ frontend"""
    artsy = {f: 0.0 for f in USER}
    artsy.update({"grp::arts": 100, "ri::Artistic": 100, "gtask::create": 100, "task::ui": 100, "grp::media_language": 100})
    a = client.post("/api/recommend", json={"user": USER}).json()["careers"][0]["code"]
    b = client.post("/api/recommend", json={"user": artsy}).json()["careers"][0]["code"]
    assert a != b


def test_skill_gap(client):
    code = SAMPLE["recommend"]["careers"][0]["code"]
    r = client.post("/api/skill-gap", json={"user": USER, "code": code}).json()
    assert r["skills_total"] == 30
    assert r["skills_met"] == SAMPLE["skill_gaps"][code]["skills_met"]
    assert all(row["gap"] > 0 for row in r["top_priorities"])
    prios = [row["priority"] for row in r["top_priorities"]]
    assert prios == sorted(prios, reverse=True)


def test_similar(client):
    r = client.get("/api/careers/15-2051.00/similar").json()
    assert 0 < len(r) <= 5 and all("similarity" in x for x in r)


@pytest.mark.parametrize(
    "path,payload,status",
    [
        ("/api/recommend", {"user": {"grp::nope": 50}}, 422),  # feature ที่ไม่มี
        ("/api/recommend", {"user": {"grp::numbers": 150}}, 422),  # เกิน 0–100
        ("/api/recommend", {"user": {}}, 422),  # ว่าง
        ("/api/skill-gap", {"user": {"grp::numbers": 50}, "code": "99-9999.99"}, 404),
    ],
)
def test_validation(client, path, payload, status):
    assert client.post(path, json=payload).status_code == status


def test_similar_unknown(client):
    assert client.get("/api/careers/99-9999.99/similar").status_code == 404


# ---------- ระยะ 2: อธิบายผล + ความมั่นใจ ----------
def test_explain_sums_exactly(client):
    """ผลรวม contribution ทุกข้อ = cos(ผู้ใช้, อาชีพ) − cos เฉลี่ยทุกอาชีพ (แยกได้พอดี ไม่ใช่การประมาณ)"""
    p = get_predictor()
    code = SAMPLE["recommend"]["careers"][0]["code"]
    full = p.explain(USER, code, k=len(p.features))
    total = sum(r["contribution"] for r in full["positive"] + full["negative"])
    assert abs(total - (full["similarity"] - full["mean_similarity"])) < 1e-3
    assert abs(sum(full["by_domain"].values()) - total) < 1e-3
    r = client.post("/api/explain", json={"user": USER, "code": code, "k": 3}).json()
    assert len(r["positive"]) == 3 and all(x["contribution"] > 0 for x in r["positive"])
    assert all(x["contribution"] < 0 for x in r["negative"])
    # similarity ตรงกับคะแนน ① ใน /recommend
    rec = client.post("/api/recommend", json={"user": USER}).json()["careers"][0]
    assert abs(r["similarity"] - rec["matching_similarity"]) < 1e-3


def test_explain_validation(client):
    assert client.post("/api/explain", json={"user": USER, "code": "99-9999.99"}).status_code == 404
    assert client.post("/api/explain", json={"user": {"grp::nope": 1}, "code": "15-2051.00"}).status_code == 422


def test_confidence_calibrated(client):
    cal = get_predictor().calibration
    assert cal is not None, "รัน datasets/ml/calibrate_confidence.py ก่อน"
    top1 = [b["top1"] for b in cal["bins"]]
    assert top1 == sorted(top1), "คะแนนสูงขึ้น ความแม่นในผู้ใช้จำลองต้องไม่ลดลง"
    assert cal["agreement"]["top1_if_agree"] > cal["agreement"]["top1_if_disagree"]
    c = client.post("/api/recommend", json={"user": USER}).json()["confidence"]
    assert c["level"] in {"low", "medium", "high"} and 0 <= c["bin"] < c["n_bins"]


# ---------- อาชีพที่อยากเป็น + counterfactual ----------
def test_target_counterfactual_verified(client):
    """อันดับหลังเปลี่ยนคำตอบตามที่ counterfactual เสนอ ต้องตรงกับ /recommend จริง"""
    for code in ("29-1141.00", "27-1024.00"):
        r = client.post("/api/target", json={"user": USER, "code": code}).json()
        assert r["total"] == 910 and r["career"]["rank"] > 5
        for key in ("counterfactual", "counterfactual_all"):
            cf = r[key]
            u2 = dict(USER) | {c["feature"]: c["to"] for c in cf["changes"]}
            top = [c["code"] for c in client.post("/api/recommend", json={"user": u2, "k": 20}).json()["careers"]]
            assert (code in top[:5]) == cf["reached"]
            if cf["rank_after"] <= 20:
                assert top.index(code) + 1 == cf["rank_after"]
            # skills: เพิ่มเฉพาะทักษะ ไม่ลด
            if key == "counterfactual":
                assert all(c["feature"].startswith("grp::") and c["to"] > c["from"] for c in cf["changes"])


def test_target_in_top5_needs_no_change(client):
    code = SAMPLE["recommend"]["careers"][0]["code"]
    cf = client.post("/api/target", json={"user": USER, "code": code}).json()["counterfactual"]
    assert cf["already"] and cf["reached"] and cf["levels"] == 0


# ---------- สาขาที่จบ ----------
def test_majors_link_to_expected_careers(client):
    ms = {m["id"] for m in client.get("/api/majors").json()}
    assert len(ms) >= 90
    # ตรวจความสมเหตุสมผลของตาราง (สาขา → อาชีพที่ต้องมีแน่ ๆ)
    expect = {"nursing": "29-1141.00", "accounting": "13-2011.00", "law": "23-1011.00",
              "edu_early": "25-2011.00", "voc_electrical": "47-2111.00", "graphic": "27-1024.00"}
    for mid, code in expect.items():
        r = client.post("/api/major", json={"user": USER, "major": mid, "k": 50}).json()
        assert code in [c["code"] for c in r["careers"]], mid


def test_major_ranked_by_model(client):
    r = client.post("/api/major", json={"user": USER, "major": "accounting"}).json()
    ranks = [c["rank"] for c in r["careers"]]
    assert ranks == sorted(ranks) and r["best_rank"] == ranks[0]
    assert client.post("/api/major", json={"user": USER, "major": "nope"}).status_code == 404


# ---------- รายละเอียดอาชีพ (อ่านอย่างเดียว) ----------
def test_career_detail_matches_model_files(client):
    p = get_predictor()
    code = "29-1141.00"
    r = client.get(f"/api/careers/{code}")
    assert r.status_code == 200
    d = r.json()
    assert d["code"] == code and d["major"] == "29" and d["description"]
    assert [x["feature"] for x in d["requirements"]] == p.features
    i = p.code_idx[code]
    assert all(abs(x["required"] - p.R[i, j]) < 0.06 for j, x in enumerate(d["requirements"]))
    assert d["cluster"] == p.clu["labels"][code]
    # เครื่องมือตรงกับที่ skill_gap() ใช้
    assert d["tools"] == p.skill_gap(USER, code)["tools_used"]
    # มี importance เฉพาะกลุ่มทักษะ
    assert any(x["onet_importance"] is not None for x in d["requirements"] if x["domain"] == "grp")


def test_career_detail_unknown(client):
    assert client.get("/api/careers/99-9999.99").status_code == 404


def test_careers_list_has_filters(client):
    p = get_predictor()
    rows = client.get("/api/careers").json()
    assert len(rows) == 910
    nurse = next(r for r in rows if r["code"] == "29-1141.00")
    assert nurse["major"] == "29" and nurse["cluster"] == p.clu["labels"]["29-1141.00"]
    assert len(nurse["riasec"]) == 2 and nurse["riasec"][0] in {"Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"}
