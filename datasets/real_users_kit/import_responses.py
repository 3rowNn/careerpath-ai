"""
นำเข้าคำตอบผู้ใช้จริง (CSV จาก Google Form หรือ template.csv) → datasets/real_users/labels.jsonl

    python import_responses.py responses.csv                 # ตรวจ + นำเข้า
    python import_responses.py responses.csv --dry-run       # ตรวจอย่างเดียว ไม่เขียนไฟล์
    python import_responses.py responses.csv --mapping needs_mapping.csv

คนที่เลือก "ไม่แน่ใจ" (พิมพ์ชื่อตำแหน่งเอง) จะถูกเขียนลง needs_mapping.csv ให้เติมรหัส O*NET ในคอลัมน์ code แล้วรันใหม่พร้อม --mapping
รันซ้ำไฟล์เดิมได้ — แถวที่นำเข้าแล้วจะถูกข้าม (ดูจาก source_id)
"""

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_kit import (  # noqa: E402
    COL_CONSENT, COL_OCC, COL_OCC_OTHER, COL_YEARS, CONSENT_YES, YEARS, questions,
)

MODEL_CONFIG = HERE.parent / "ml" / "output" / "general" / "models" / "model_config.json"
DEFAULT_OUT = HERE.parent / "real_users" / "labels.jsonl"
CODE_RE = re.compile(r"\b(\d{2}-\d{4}\.\d{2})\b")
YEARS_MAP = {YEARS[1]: "<1", YEARS[2]: "1-3", YEARS[3]: "3-5", YEARS[4]: "5+"}
TIMESTAMP_COLS = ("Timestamp", "ประทับเวลา", "การประทับเวลา")


def find_col(headers: list[str], title: str) -> str | None:
    return next((h for h in headers if h.strip() == title), None)


def map_question_cols(headers: list[str]) -> dict[str, str]:
    """หัวคอลัมน์ → feature: รับได้ทั้ง 'Q12. ...' (จาก Form/template) และชื่อ feature ตรง ๆ เช่น 'grp::law'"""
    by_no = {q["no"]: q["feature"] for q in questions()}
    feats = set(by_no.values())
    out = {}
    for h in headers:
        m = re.match(r"\s*Q(\d+)\.", h)
        if m and int(m.group(1)) in by_no:
            out[h] = by_no[int(m.group(1))]
        elif h.strip() in feats:
            out[h] = h.strip()
    return out


def source_id(row: dict) -> str:
    return hashlib.sha1(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def load_mapping(path: Path | None) -> dict[str, str]:
    if not path:
        return {}
    with path.open(encoding="utf-8-sig") as f:
        return {r["source_id"]: r["code"].strip() for r in csv.DictReader(f) if r.get("code", "").strip()}


def parse(csv_path: Path, valid_codes: set[str], mapping: dict[str, str]):
    with csv_path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        rows = list(reader)

    qcols = map_question_cols(headers)
    cols = {k: find_col(headers, t) for k, t in
            {"consent": COL_CONSENT, "years": COL_YEARS, "other": COL_OCC_OTHER}.items()}
    # ฟอร์มมีคอลัมน์อาชีพแยกตามกลุ่ม (22 คอลัมน์ กรอกแค่ 1) · template มีคอลัมน์เดียว
    occ_cols = [h for h in headers if h.strip().startswith(COL_OCC)]
    problems = [f"ไม่พบคอลัมน์ '{COL_CONSENT}'"] if not cols["consent"] else []
    if not occ_cols:
        problems.append(f"ไม่พบคอลัมน์ที่ขึ้นต้นด้วย '{COL_OCC}'")
    n_q = len(questions())
    if len(set(qcols.values())) != n_q:
        problems.append(f"พบคอลัมน์คำถาม {len(set(qcols.values()))}/{n_q} — หัวคอลัมน์ต้องขึ้นต้นด้วย 'Q<เลขข้อ>.' หรือเป็นชื่อ feature")
    if problems:
        raise SystemExit("ไฟล์ไม่ตรงรูปแบบ:\n  " + "\n  ".join(problems))
    ts_col = next((h for h in headers if h.strip() in TIMESTAMP_COLS), None)

    accepted, rejected, needs = [], [], []
    for i, row in enumerate(rows, start=2):  # เลขบรรทัดใน CSV (บรรทัด 1 = หัวตาราง)
        sid = source_id(row)

        def reject(reason):
            rejected.append({"line": i, "source_id": sid, "reason": reason})

        if (row.get(cols["consent"]) or "").strip() != CONSENT_YES:
            reject("ไม่ยินยอม")
            continue
        years_raw = (row.get(cols["years"]) or "").strip() if cols["years"] else ""
        if years_raw == YEARS[0]:
            reject("ยังไม่ได้ทำงาน — ไม่มีอาชีพจริงให้เทียบ")
            continue

        answers, bad = {}, []
        for col, feat in qcols.items():
            v = (row.get(col) or "").strip()
            if v not in {"1", "2", "3", "4", "5"}:
                bad.append(col.split(".")[0])
            else:
                answers[feat] = int(v)
        if bad:
            reject(f"คำตอบไม่ครบ/ไม่อยู่ใน 1–5: {', '.join(bad[:5])}{' …' if len(bad) > 5 else ''}")
            continue

        occ = next((v.strip() for c in occ_cols if (v := row.get(c) or "").strip()), "")
        m = CODE_RE.search(occ)
        code = m.group(1) if m else mapping.get(sid)
        if not code:
            other = (row.get(cols["other"]) or "").strip() if cols["other"] else ""
            if occ:
                reject(f"อ่านรหัสอาชีพไม่ได้: {occ[:40]}")
            elif other:
                needs.append({"source_id": sid, "line": i, "occupation_text": other, "code": ""})
            else:
                reject("ไม่ได้ระบุอาชีพ")
            continue
        if code not in valid_codes:
            reject(f"รหัส {code} ไม่อยู่ใน 910 อาชีพของโมเดล")
            continue

        created = (row.get(ts_col) or "").strip() if ts_col else ""
        accepted.append({
            "answers": answers, "code": code, "years_in_role": YEARS_MAP.get(years_raw), "consent": True,
            "created_at": created or datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "import", "source_id": sid,
        })
    return accepted, rejected, needs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", type=Path)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--mapping", type=Path, help="needs_mapping.csv ที่เติมคอลัมน์ code แล้ว")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    valid = set(json.loads(MODEL_CONFIG.read_text())["class_order"])
    accepted, rejected, needs = parse(a.csv, valid, load_mapping(a.mapping))

    existing = set()
    if a.out.exists():
        existing = {json.loads(line).get("source_id") for line in a.out.read_text(encoding="utf-8").splitlines() if line.strip()}
    new = [r for r in accepted if r["source_id"] not in existing]

    print(f"อ่าน {a.csv.name}: ผ่าน {len(accepted)} (ใหม่ {len(new)}, เคยนำเข้าแล้ว {len(accepted) - len(new)}) · "
          f"ไม่ผ่าน {len(rejected)} · รอระบุอาชีพ {len(needs)}")
    for r in rejected:
        print(f"  ✗ บรรทัด {r['line']}: {r['reason']}")

    if needs:
        npath = a.csv.with_name("needs_mapping.csv")
        if not a.dry_run:
            with npath.open("w", encoding="utf-8-sig", newline="") as f:
                w = csv.DictWriter(f, fieldnames=["source_id", "line", "occupation_text", "code"])
                w.writeheader()
                w.writerows(needs)
        print(f"  → {len(needs)} คนพิมพ์ชื่อตำแหน่งเอง: เติมรหัส O*NET (หาใน occupations_all.csv) ในคอลัมน์ code ของ {npath.name} แล้วรันใหม่ด้วย --mapping {npath.name}")

    if a.dry_run:
        print("(dry-run: ไม่ได้เขียนไฟล์)")
    elif new:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        with a.out.open("a", encoding="utf-8") as f:
            for r in new:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        total = sum(1 for line in a.out.read_text(encoding="utf-8").splitlines() if line.strip())
        print(f"เขียนเพิ่ม {len(new)} คน → {a.out} (รวม {total} คน)")
    return accepted, rejected, needs


if __name__ == "__main__":
    main()
