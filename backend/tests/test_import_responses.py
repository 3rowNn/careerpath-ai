"""ชุดเก็บข้อมูลผู้ใช้จริง: CSV แบบ Google Form export → labels.jsonl → ชั้นที่ 4 ของ evaluate.py"""

import csv
import json
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parents[2] / "datasets" / "real_users_kit"
sys.path.insert(0, str(KIT))
import build_kit as bk  # noqa: E402
import import_responses as ir  # noqa: E402

from app.main import ev, get_predictor  # noqa: E402

QS = bk.questions()
GOOD_OCC = "Data Scientist · Data Scientists — 15-2051.00"
IT_COL, BIZ_COL = bk.occ_col("15"), bk.occ_col("13")  # ฟอร์มจริงมี 22 คอลัมน์แบบนี้ กรอกแค่คอลัมน์ของกลุ่มที่เลือก


def row(consent=bk.CONSENT_YES, years=bk.YEARS[2], occ=GOOD_OCC, other="", answers=None, ts="2026/11/20 10:00:00"):
    a = answers or {q["title"]: "4" for q in QS}
    group = bk.GROUP_UNSURE if other else bk.group_label("15")
    return {"Timestamp": ts, bk.COL_CONSENT: consent, bk.COL_YEARS: years, bk.COL_GROUP: group,
            BIZ_COL: "", IT_COL: occ, bk.COL_OCC_OTHER: other, **a}


def write_csv(path: Path, rows: list[dict]):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def test_template_matches_question_bank():
    header = next(csv.reader((KIT / "template.csv").open(encoding="utf-8-sig")))
    assert len(ir.map_question_cols(header)) == len(QS) == len(get_predictor().features)
    assert header[:4] == [bk.COL_CONSENT, bk.COL_YEARS, bk.TEMPLATE_OCC_COL, bk.COL_OCC_OTHER]


def test_form_lists_every_model_occupation():
    p = get_predictor()
    occs = bk.occupations()
    assert {o["code"] for o in occs} == set(p.codes)
    gs = (KIT / "make_google_form.gs").read_text(encoding="utf-8")
    assert all(f"— {c}" in gs for c in p.codes)


def test_shortlist_codes_exist_in_model():
    p = get_predictor()
    with (KIT / "occupations_shortlist.csv").open(encoding="utf-8") as f:
        bad = [r["code"] for r in csv.DictReader(f) if r["code"] not in p.code_idx]
    assert not bad, bad


def test_import_end_to_end(tmp_path):
    missing_one = {q["title"]: "3" for q in QS}
    missing_one[QS[5]["title"]] = ""
    rows = [
        row(),                                                  # ผ่าน
        row(consent=bk.CONSENT_NO),                             # ไม่ยินยอม
        row(years=bk.YEARS[0]),                                 # ยังไม่ได้ทำงาน
        row(answers=missing_one, ts="2026/11/20 11:00:00"),     # ตอบไม่ครบ
        row(occ="", other="Product Owner", ts="2026/11/20 12:00:00"),            # ไม่แน่ใจ → รอระบุอาชีพ
        row(occ="something — 99-9999.99", ts="2026/11/20 13:00:00"),             # รหัสไม่มีในโมเดล
    ]
    src, out = tmp_path / "responses.csv", tmp_path / "labels.jsonl"
    write_csv(src, rows)

    acc, rej, needs = ir.main([str(src), "--out", str(out)])
    assert len(acc) == 1 and len(rej) == 4 and len(needs) == 1
    saved = [json.loads(x) for x in out.read_text().splitlines()]
    assert saved[0]["code"] == "15-2051.00" and saved[0]["years_in_role"] == "1-3" and len(saved[0]["answers"]) == len(QS)

    # เติมรหัสให้คนที่พิมพ์ชื่อตำแหน่งเอง แล้วรันซ้ำ → ได้เพิ่ม 1 คน และแถวเดิมไม่ถูกนำเข้าซ้ำ
    mp = tmp_path / "needs_mapping.csv"
    m = list(csv.DictReader(mp.open(encoding="utf-8-sig")))
    assert m[0]["occupation_text"] == "Product Owner"
    m[0]["code"] = "15-1299.09"
    with mp.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(m[0]))
        w.writeheader()
        w.writerows(m)
    ir.main([str(src), "--out", str(out), "--mapping", str(mp)])
    saved = [json.loads(x) for x in out.read_text().splitlines()]
    assert [s["code"] for s in saved] == ["15-2051.00", "15-1299.09"]

    # ไฟล์ที่นำเข้าใช้กับการประเมินชั้นที่ 4 ได้ทันที
    rep = ev.eval_real_users(get_predictor(), ev.load_real_users(out))
    assert rep["available"] and rep["n"] == 2


def test_dry_run_writes_nothing(tmp_path):
    src, out = tmp_path / "r.csv", tmp_path / "labels.jsonl"
    write_csv(src, [row()])
    ir.main([str(src), "--out", str(out), "--dry-run"])
    assert not out.exists()


def test_template_single_occupation_column(tmp_path):
    """กรอกผ่าน template.csv: คอลัมน์อาชีพเดียว ใส่แค่รหัสก็ได้"""
    src, out = tmp_path / "t.csv", tmp_path / "labels.jsonl"
    r = {bk.COL_CONSENT: bk.CONSENT_YES, bk.COL_YEARS: bk.YEARS[4], bk.TEMPLATE_OCC_COL: "15-1252.00",
         bk.COL_OCC_OTHER: "", **{q["title"]: "2" for q in QS}}
    write_csv(src, [r])
    acc, rej, needs = ir.main([str(src), "--out", str(out)])
    assert len(acc) == 1 and acc[0]["code"] == "15-1252.00" and acc[0]["years_in_role"] == "5+"
