"""
สร้างชุดเก็บข้อมูลผู้ใช้จริงจากแหล่งข้อมูลเดียว (คำถามและรายชื่ออาชีพจะตรงกับโมเดลเสมอ)

อ่าน:   ../ml/output/general/question_bank_general.csv   คำถามรอบที่ 4 (76 ข้อ)
        ../ml/output/models/model_config.json         910 อาชีพที่โมเดลรู้จัก
        ../data_gate_output/occupation_meta.csv       ชื่ออาชีพ + SOC major group
        occupations_shortlist.csv                     ชื่อภาษาไทยของอาชีพที่พบบ่อย (ไม่บังคับ)
เขียน:  make_google_form.gs   วางใน script.google.com แล้วกด Run → ได้ Google Form
        template.csv          ถ้าจะเก็บผ่าน Excel/Sheets แทน Form
        occupations_all.csv   รายชื่อ 910 อาชีพ + รหัส (ใช้หารหัสตอนกรอก template หรือเติม needs_mapping)

ในฟอร์ม เลือกอาชีพ 2 ขั้น: กลุ่มอาชีพ (22 กลุ่ม SOC) → อาชีพในกลุ่มนั้น  ครบทั้ง 910 อาชีพ

รัน:  python build_kit.py
"""

import csv
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASETS = HERE.parent
QB = DATASETS / "ml" / "output" / "general" / "question_bank_general.csv"   # แบบประเมินรอบที่ 4 (ตรงกับเว็บ)
MODEL_CONFIG = DATASETS / "ml" / "output" / "general" / "models" / "model_config.json"
META = DATASETS / "data_gate_output" / "occupation_meta.csv"
SHORTLIST = HERE / "occupations_shortlist.csv"
THAI_TITLES = DATASETS / "onet_thai" / "onet_thai_titles.csv"  # ชื่อไทยครบ 910 อาชีพ (แปลโดย Claude)

# ข้อความคงที่ — import_responses.py อ้างอิงข้อความเหล่านี้
COL_CONSENT = "การยินยอม"
COL_YEARS = "ทำงานในอาชีพปัจจุบันมานานเท่าไร"
COL_GROUP = "กลุ่มอาชีพของคุณ"
COL_OCC = "อาชีพปัจจุบันของคุณ"  # ในฟอร์มมี 22 ข้อ: "อาชีพปัจจุบันของคุณ — <กลุ่ม>" · ใน template มีคอลัมน์เดียว
COL_OCC_OTHER = "ชื่อตำแหน่งงานของคุณ"
CONSENT_YES = "ยินยอม"
CONSENT_NO = "ไม่ยินยอม"
YEARS = ["ยังไม่ได้ทำงาน", "น้อยกว่า 1 ปี", "1–3 ปี", "3–5 ปี", "มากกว่า 5 ปี"]
GROUP_UNSURE = "ไม่แน่ใจ / หาไม่เจอ (พิมพ์ชื่อตำแหน่งเอง)"

# SOC 2018 major group — ชื่อไทย (ตรงกับ frontend/src/lib/labels.ts)
SOC_MAJOR = {
    "11": "บริหารจัดการ", "13": "ธุรกิจและการเงิน", "15": "คอมพิวเตอร์ ไอที และคณิตศาสตร์",
    "17": "สถาปัตยกรรมและวิศวกรรม", "19": "วิทยาศาสตร์ชีวภาพ กายภาพ และสังคม", "21": "บริการชุมชนและสังคม",
    "23": "กฎหมาย", "25": "การศึกษาและห้องสมุด", "27": "ศิลปะ ออกแบบ บันเทิง สื่อ", "29": "บุคลากรการแพทย์",
    "31": "สนับสนุนการแพทย์", "33": "บริการด้านความปลอดภัย", "35": "อาหารและเครื่องดื่ม",
    "37": "ดูแลอาคารและพื้นที่", "39": "บริการส่วนบุคคล", "41": "งานขาย", "43": "งานสำนักงานและธุรการ",
    "45": "เกษตร ประมง ป่าไม้", "47": "ก่อสร้างและขุดเจาะ", "49": "ติดตั้ง ซ่อมบำรุง", "51": "การผลิต",
    "53": "ขนส่งและขนย้าย",
}


def group_label(major: str) -> str:
    return f"{SOC_MAJOR[major]} ({major})"


def occ_col(major: str) -> str:
    return f"{COL_OCC} — {group_label(major)}"


def questions() -> list[dict]:
    with QB.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        low, high = [s.split("=", 1)[1].strip() for s in re.split(r"\s*…\s*", r["scale"])]
        out.append({"no": int(r["no"]), "section": r["section"], "feature": r["feature"],
                    "title": f"Q{r['no']}. {r['question_th']}", "low": low, "high": high})
    return out


def occupations() -> list[dict]:
    """910 อาชีพของโมเดล + ชื่อไทย (onet_thai_titles.csv · ถ้าไม่มีไฟล์ใช้ shortlist) · เรียงตามกลุ่ม แล้วตามชื่อไทย"""
    codes = json.loads(MODEL_CONFIG.read_text())["class_order"]
    with META.open(encoding="utf-8") as f:
        meta = {r["O*NET-SOC Code"]: r for r in csv.DictReader(f)}
    src = THAI_TITLES if THAI_TITLES.exists() else SHORTLIST
    with src.open(encoding="utf-8") as f:
        th = {r["code"]: r["title_th"] for r in csv.DictReader(f)}
    out = [{"code": c, "major": c[:2], "title_en": meta[c]["Title"], "title_th": th.get(c, "")} for c in codes]
    return sorted(out, key=lambda o: (o["major"], o["title_th"] or o["title_en"]))


def occ_label(o: dict) -> str:
    name = f"{o['title_th']} · {o['title_en']}" if o["title_th"] else o["title_en"]
    return f"{name} — {o['code']}"


def build_gs(qs: list[dict], occs: list[dict]) -> str:
    groups = []
    for major in SOC_MAJOR:
        items = [occ_label(o) for o in occs if o["major"] == major]
        if items:
            groups.append({"label": group_label(major), "col": occ_col(major), "occupations": items})
    data = {
        "questions": qs, "groups": groups, "years": YEARS, "groupUnsure": GROUP_UNSURE,
        "cols": {"consent": COL_CONSENT, "years": COL_YEARS, "group": COL_GROUP, "occOther": COL_OCC_OTHER},
        "consentYes": CONSENT_YES, "consentNo": CONSENT_NO,
    }
    return f"""/**
 * CareerPath AI — สร้าง Google Form เก็บข้อมูลผู้ใช้จริง (ไฟล์นี้สร้างจาก build_kit.py — อย่าแก้มือ)
 * วิธีใช้: script.google.com → New project → วางทั้งไฟล์ → เลือกฟังก์ชัน createForm → Run → อนุญาตสิทธิ์
 * ลิงก์แก้ไข/ลิงก์ส่งให้ผู้ตอบ จะแสดงใน Execution log
 *
 * เลือกอาชีพ 2 ขั้น: กลุ่มอาชีพ → (ไปส่วนของกลุ่มนั้น) → อาชีพ  ครบทั้ง {len(occs)} อาชีพของโมเดล
 */
const DATA = {json.dumps(data, ensure_ascii=False, indent=1)};

function createForm() {{
  const form = FormApp.create('CareerPath AI — แบบสำรวจทักษะของคนทำงานจริง');
  form.setDescription(
    'แบบสำรวจนี้ใช้วัดความแม่นของโมเดล Machine Learning ที่แนะนำอาชีพ (โปรเจกต์วิชา data/ML)\\n\\n' +
    '• ใช้เวลาประมาณ 10–15 นาที (' + DATA.questions.length + ' ข้อ ตอบด้วยคะแนน 1–5)\\n' +
    '• เหมาะกับคนที่ทำงานอยู่แล้ว ควรทำงานในตำแหน่งปัจจุบันมาแล้ว 1 ปีขึ้นไป\\n' +
    '• ไม่เก็บชื่อ อีเมล หรือข้อมูลที่ระบุตัวตน\\n' +
    '• ตอบตามความเป็นจริงของตัวคุณ ไม่มีคำตอบถูกหรือผิด'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(false);
  try {{ form.setRequireLogin(false); }} catch (e) {{ /* ใช้ได้เฉพาะบัญชี Workspace */ }}
  const NEXT = FormApp.PageNavigationType;

  // ส่วนที่ 1: ยินยอม
  const consent = form.addMultipleChoiceItem()
    .setTitle(DATA.cols.consent)
    .setHelpText('ยินยอมให้ใช้คำตอบแบบไม่ระบุตัวตน เพื่อวัดและปรับปรุงความแม่นของโมเดลในโปรเจกต์นี้เท่านั้น')
    .setRequired(true);
  consent.setChoices([consent.createChoice(DATA.consentYes, NEXT.CONTINUE), consent.createChoice(DATA.consentNo, NEXT.SUBMIT)]);

  // ส่วนที่ 2: อายุงาน + กลุ่มอาชีพ
  form.addPageBreakItem().setTitle('เกี่ยวกับงานของคุณ');
  const years = form.addMultipleChoiceItem().setTitle(DATA.cols.years).setRequired(true);
  years.setChoices(DATA.years.map((y, i) => years.createChoice(y, i === 0 ? NEXT.SUBMIT : NEXT.CONTINUE)));
  const group = form.addListItem()
    .setTitle(DATA.cols.group)
    .setHelpText('เลือกกลุ่มก่อน แล้วหน้าถัดไปจะให้เลือกอาชีพในกลุ่มนั้น (สายไอทีอยู่ในกลุ่ม 15)')
    .setRequired(true);

  // ส่วนของแต่ละกลุ่ม: dropdown อาชีพในกลุ่ม
  const groupPages = DATA.groups.map((g) => {{
    const page = form.addPageBreakItem().setTitle('เลือกอาชีพ: ' + g.label)
      .setHelpText('ชื่ออาชีพตามฐานข้อมูล O*NET — เลือกที่ใกล้กับงานจริงที่สุด');
    form.addListItem().setTitle(g.col).setChoiceValues(g.occupations).setRequired(true);
    return page;
  }});
  const otherPage = form.addPageBreakItem().setTitle('ระบุตำแหน่งงาน');
  form.addTextItem().setTitle(DATA.cols.occOther).setHelpText('เช่น Product Owner, นักวิเคราะห์สินเชื่อ').setRequired(true);

  group.setChoices(
    DATA.groups.map((g, i) => group.createChoice(g.label, groupPages[i]))
      .concat([group.createChoice(DATA.groupUnsure, otherPage)])
  );

  // ส่วนคำถาม 71 ข้อ
  let section = null;
  const sectionPages = [];
  DATA.questions.forEach((q) => {{
    if (q.section !== section) {{
      section = q.section;
      sectionPages.push(form.addPageBreakItem().setTitle(section).setHelpText('ให้คะแนน 1–5: 1 = ' + q.low + ' … 5 = ' + q.high));
    }}
    form.addScaleItem().setTitle(q.title).setBounds(1, 5).setLabels(q.low, q.high).setRequired(true);
  }});

  // จบส่วนของแต่ละกลุ่ม → ข้ามไปคำถามข้อ 1 (setGoToPage ของ page break กำหนดทางออกของ "ส่วนก่อนหน้า")
  groupPages.slice(1).concat([otherPage]).forEach((p) => p.setGoToPage(sectionPages[0]));

  Logger.log('ลิงก์ส่งให้ผู้ตอบ: ' + form.getPublishedUrl());
  Logger.log('ลิงก์แก้ไขฟอร์ม: ' + form.getEditUrl());
}}
"""


TEMPLATE_OCC_COL = f"{COL_OCC} (รหัส O*NET จาก occupations_all.csv)"


def build_template(qs: list[dict]) -> list[str]:
    return [COL_CONSENT, COL_YEARS, TEMPLATE_OCC_COL, COL_OCC_OTHER] + [q["title"] for q in qs]


if __name__ == "__main__":
    qs, occs = questions(), occupations()
    assert len(qs) == len(json.loads(MODEL_CONFIG.read_text())["feature_order"]), "คำถามไม่ตรงกับโมเดล"
    (HERE / "make_google_form.gs").write_text(build_gs(qs, occs), encoding="utf-8")
    with (HERE / "template.csv").open("w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig ให้ Excel อ่านภาษาไทยได้
        csv.writer(f).writerow(build_template(qs))
    with (HERE / "occupations_all.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["group", "code", "title_en", "title_th"])
        w.writerows([group_label(o["major"]), o["code"], o["title_en"], o["title_th"]] for o in occs)
    print(f"เขียน make_google_form.gs, template.csv, occupations_all.csv — {len(qs)} คำถาม, {len(occs)} อาชีพ "
          f"({sum(1 for o in occs if o['title_th'])} มีชื่อไทย)")
