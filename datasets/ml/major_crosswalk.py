"""
สาขาที่จบ → อาชีพที่เกี่ยวข้อง (ไม่ต้องเทรน — เปิดตาราง)

ข้อมูล:
- datasets/cip/CIP2020_SOC2018_Crosswalk.xlsx  ตาราง CIP 2020 → SOC 2018 ของ NCES (ทางการ, จับคู่ตามความหมาย ไม่ใช่ข้อมูลการทำงานจริง)
- datasets/cip/CIPCode2020.csv                 ชื่อ/คำอธิบายสาขาของ CIP (ใช้ตรวจรหัส)
- datasets/cip/thai_majors.csv                 รายชื่อสาขาไทย → รหัส CIP (ร่างโดย Claude — ควรให้ผู้รู้ตรวจ)
  รหัส CIP แบบสั้น เช่น "52.03" = ทุกรหัสที่ขึ้นต้นด้วย 52.03 (52.0301, 52.0302, ...)

ต่อกับ 910 อาชีพ: รหัส O*NET-SOC 2019 ตัด 7 ตัวแรกได้ SOC 2018 (29-1141.01 → 29-1141)

รัน:  python major_crosswalk.py [--models output/general/models]
ผล:   <models>/major_occupations.json  (predict.py อ่านอัตโนมัติ)
"""

import argparse
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
CIP_DIR = HERE.parent / "cip"
MAX_CIP_FOR_ALL_OTHER = 50


def build(models: Path) -> dict:
    cw = pd.read_excel(CIP_DIR / "CIP2020_SOC2018_Crosswalk.xlsx", "CIP-SOC", dtype=str)
    cw = cw[cw.SOC2018Code != "99-9999"]
    # รหัส "All Other" (xx-xx99) ที่ crosswalk ผูกกับสาขามากเกิน 50 สาขา = ถังรวม เช่น 11-9199 Managers, All Other (128 สาขา)
    # O*NET แตกรหัสนี้เป็นอาชีพเฉพาะทาง (Wind Energy Operations Managers ฯลฯ) ถ้าไม่ตัด จิตวิทยาจะเชื่อมไปอาชีพเหล่านี้ — กฎตายตัว
    n_cip = cw.groupby("SOC2018Code").CIP2020Code.nunique()
    catch_all = sorted(s for s, n in n_cip.items() if s.endswith("99") and n > MAX_CIP_FOR_ALL_OTHER)
    cw = cw[~cw.SOC2018Code.isin(catch_all)]
    cip_titles = cw.drop_duplicates("CIP2020Code").set_index("CIP2020Code")["CIP2020Title"].str.rstrip(".")
    codes = json.loads((models / "model_config.json").read_text())["class_order"]
    by_soc: dict[str, list[str]] = {}
    for c in codes:
        by_soc.setdefault(c[:7], []).append(c)

    majors, problems = [], []
    for r in pd.read_csv(CIP_DIR / "thai_majors.csv", dtype=str).itertuples():
        prefixes = [p.strip() for p in r.cip.split(";") if p.strip()]
        cips = sorted({c for p in prefixes for c in cip_titles.index if c.startswith(p)})
        bad = [p for p in prefixes if not any(c.startswith(p) for c in cip_titles.index)]
        if bad:
            problems.append(f"{r.id}: ไม่พบรหัส CIP {bad}")
        socs = sorted(set(cw[cw.CIP2020Code.isin(cips)].SOC2018Code))
        occ = sorted({o for s in socs for o in by_soc.get(s, [])})
        if not occ:
            problems.append(f"{r.id}: ไม่มีอาชีพใน 910 ที่เชื่อมได้")
        majors.append({"id": r.id, "faculty": r.faculty, "major_th": r.major_th, "cip": cips,
                       "cip_titles": [cip_titles[c] for c in cips], "codes": occ})
    reach = {o for m in majors for o in m["codes"]}
    return {
        "source": "NCES CIP 2020 → SOC 2018 Crosswalk (qualitative) + thai_majors.csv (ร่างโดย Claude)",
        "excluded_catch_all_soc": catch_all,
        "n_majors": len(majors), "occupations_reachable": len(reach), "problems": problems, "majors": majors,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", type=Path, default=HERE / "output" / "general" / "models")
    a = ap.parse_args()
    out = build(a.models)
    path = a.models / "major_occupations.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    n = [len(m["codes"]) for m in out["majors"]]
    print(f"{out['n_majors']} สาขา · อาชีพที่เชื่อมได้ต่อสาขา: น้อยสุด {min(n)} · กลาง {sorted(n)[len(n) // 2]} · มากสุด {max(n)}")
    print(f"อาชีพใน 910 ที่มีอย่างน้อย 1 สาขาเชื่อม: {out['occupations_reachable']}")
    for p in out["problems"]:
        print("  ⚠", p)
    print("→", path)


if __name__ == "__main__":
    main()
