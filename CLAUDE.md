# CareerPath AI — AI Career Predictor + Skill Gap Analyzer

โปรเจกต์วิชา data/ML ของ ปฏิภาณ นาชัยฤทธิ์ เว็บแอปที่ให้ผู้ใช้ทำแบบประเมิน
แล้วแนะนำอาชีพ Top 5, บอก Skill Gap และ Roadmap การเรียนรู้

**กลุ่มผู้ใช้:** คนที่ยังไม่มีทิศทางอาชีพ — เรียนจบแล้วแต่ยังไม่มีงาน, ไม่รู้ว่าตัวเองเก่งอะไร, ไม่รู้ว่าอยากเป็นอะไร
(ไม่ใช่เครื่องมือวัดนักศึกษา IT — ทุกสายอาชีพสำคัญเท่ากัน) · ข้อมูลผู้ใช้จริงสำหรับ *วัดผล* ยังต้องมาจากคนทำงาน
เพราะมีอาชีพจริงเป็นเฉลย ส่วนผู้ใช้เว็บคือคนที่ยังไม่มี

**จุดหลักของโปรเจกต์คือ ML ไม่ใช่ LLM** — LLM (AI Advisor) เป็นแค่ส่วนเสริมที่อธิบายผลจากโมเดล ML

## สถานะ
- Week 9 Data Gate เสร็จแล้ว (`datasets/data_gate_analysis.ipynb`, ผลใน `datasets/data_gate_output/`)
- เทรนโมเดล ML เสร็จ 3 รอบแล้ว (`datasets/ml/`) — รายละเอียดและตัวเลขทั้งหมดอยู่ใน `docs/ML.md`
- นี่คือ**โปรเจกต์ final** — เป้าคือเว็บแอปที่ ML เด่น (ไม่ใช่ RAG/LLM) ไม่ได้ทำเพื่อนำเสนอครั้งเดียว
- เอกสาร .md ทั้งหมดอยู่ใน `docs/` (27 พ.ย.) ยกเว้น `README.md` และ `CLAUDE.md` ที่ root — สารบัญ `docs/README.md`
- Colab (27 พ.ย.): `colab/CareerPath_3models.ipynb` (Cosine · MLP · K-Means + Ensemble, ใช้ `careerpath_3models_data.zip`
  ผลตรงกับ summary.json) และ `CareerPath_train_test.ipynb` (ครบทุกโมเดล, bundle จาก `sh colab/make_bundle.sh`)
  — notebook สร้างจาก `build_3models_notebook.py` / `build_notebook.py` (แก้ที่สคริปต์ แล้วรันใหม่ ไม่แก้ .ipynb ตรง)
- รวมโปรเจกต์ไว้ที่ `~/AI-career` แล้ว (12 พ.ย.) — `~/Project-4-1` เป็นสำเนาเก่า ไม่ต้องแก้ที่นั่น
- Frontend ครบ 8 หน้าตามดีไซน์ (`frontend/`), Backend FastAPI ห่อ predict.py (`backend/`) ต่อกันแล้ว
- ปรับ UI ตาม `docs/UI_PROMPTS.md` (13 พ.ย.): P01 design system, P02 หน้าแรก, P06 Skill Gap, P05 รายละเอียดอาชีพ, P08 Career Explorer, P04 แบบประเมิน (ขั้นทบทวน + คีย์ 1–5), P07 Roadmap (`src/data/learning_resources.json` verified=false ทั้งหมด — ต้องให้คนตรวจ) · P03 สมาชิกจริง (13 พ.ย.): หน้า /account (RequireAuth), "จดจำฉัน" = token 1 วัน + sessionStorage
  ตัวเลข % ในรายการ Top 5 = ทักษะครอบคลุม (ไม่ใช่ % ความเหมาะ) ต้องมีป้ายกำกับเสมอ (`CoverageValue`, `RankNote` ใน ui.tsx)
- บัญชีจริง (ระยะ 3): `backend/app/account.py` + `db.py` (PostgreSQL + pgvector `vector(76)`, bcrypt, JWT เก็บแค่ user_id)
  ไม่ตั้ง DATABASE_URL = ระบบบัญชีปิด (503) · ยังไม่เข้าสู่ระบบ = เก็บใน localStorage แล้วย้ายขึ้นบัญชีตอนสมัคร/ล็อกอิน
  คอลัมน์ที่เพิ่มทีหลังใส่ใน `_LATE_COLUMNS` (db.py) — create_all ไม่แก้ตารางเดิม
  บันทึกการเรียน (14 พ.ย.): ตาราง `learning_records` + `PUT/DELETE /api/learning/{code}` — Roadmap ครบ → บันทึกอัตโนมัติ แสดงที่ /account
- AI Advisor (13 พ.ย.): `backend/app/advisor.py` Gemini (`GEMINI_API_KEY` ใน backend/.env, ไม่ตั้ง = 503 → เว็บใช้คำตอบสรุปจาก ML)
  RAG แบบเรียกเครื่องมือ 6 ตัวที่ห่อ predict.py **อ่านอย่างเดียว** (LLM อธิบาย ไม่คำนวณ) + ค้นอาชีพด้วย embedding
  (`gemini-embedding-001` 768 มิติ, cosine ใน numpy — คลังที่ `backend/data/advisor/` สร้างด้วย `scripts/build_advisor_index.py`)
  โควตาฟรีมัก 503 → สลับโมเดลสำรองอัตโนมัติ (`ADVISOR_FALLBACK_MODELS`) · ห้ามแก้ ML เพื่อ Advisor

## ข้อมูล
- สาขาที่จบ (ไม่บังคับ): `datasets/cip/` ตาราง CIP 2020–SOC 2018 ของ NCES (จับคู่ตามความหมาย ไม่ใช่ข้อมูลการทำงานจริง)
  + `thai_majors.csv` 97 สาขาไทย → รหัส CIP (ร่างโดย Claude — ควรให้ผู้รู้ตรวจ) · ไม่ต้องเทรน: เปิดตาราง แล้วให้ Ensemble จัดอันดับในสาย
- ชื่ออาชีพภาษาไทยครบ 910: `datasets/onet_thai/onet_thai_titles.csv` (**แปลโดย Claude** ไม่ใช่ชื่อทางการ — ควรให้ผู้รู้ตรวจ)
  → frontend `src/data/thai_titles.json` (แปลงชื่อที่ `api/client.ts` จุดเดียว: `title` = ไทย, `title_en` = O*NET) และ Google Form
- O*NET (ตลาดแรงงานสหรัฐฯ) 910 อาชีพ: Abilities 52, Knowledge 33, Essential Skills 10, RIASEC 6,
  Software Skills (ใช้ 23 tech tags), Task Statements — ไฟล์ .xlsx อยู่ใน `datasets/`
- **ไม่มี label จริงจากผู้ใช้** ใช้ผู้ใช้จำลอง = โปรไฟล์อาชีพ + noise + bias
  - stress test 9 สถานการณ์: noise 15/25/35 × bias 0/+15/−15
- ทุกตัวเลขความแม่นมาจากผู้ใช้จำลอง — **ไม่บังคับต้องมีผู้ใช้จริง** แต่ระบบรองรับถ้ามี (ดู "การประเมินหลายชั้น")

## การประเมินหลายชั้น (`datasets/ml/evaluation/evaluate.py --models <dir>` → `<dir>/../evaluation/report.json`, API `GET /api/evaluation`)
1. Stress test ผู้ใช้จำลอง (train_models.py) — วัดความทนต่อ noise/bias ไม่ใช่ความเหมาะกับคนจริง
2. Persona 28 แบบ (สาย IT 12 / นอกสาย 16 · `personas.json` ร่างโดย Claude — ควรให้ผู้รู้ตรวจ) 2 เกณฑ์:
   strict = ตรงรหัสที่คาด · soc = อยู่ SOC broad occupation เดียวกัน (6 ตัวแรกของรหัส — กฎตายตัว)
   รอบ 4: soc hit@5 79% (นอกสาย IT 75%, อันดับกลาง 3) · ②b ถูก 75% — **อย่าปรับ personas.json ให้ตรงผลโมเดล**
3. ความเสถียร (รอบ 4): เปลี่ยน 2 คำตอบ Top5 ซ้ำ 90%, อันดับ 1 คงเดิม 91% · ปิด Gap แล้วทักษะครอบคลุมไม่ลด 100%
   Counterfactual (เป้าหมาย = อาชีพอันดับ 20/100/400 ของ persona): เพิ่มทักษะอย่างเดียวเข้า Top 5 ได้ 36% / 0% / 0%
   · ขยับความชอบ/นิสัยได้ด้วย 100% ทุกระยะ · อันดับที่รายงานตรงกับ recommend() 100%
4. ผู้ใช้จริง (ถ้ามี): `datasets/real_users/labels.jsonl` (gitignored, ไม่มีชื่อ/อีเมล) เก็บผ่านการ์ดไม่บังคับท้ายแบบประเมิน
   (`POST /api/labels`) · ไม่มีไฟล์ = ข้าม · ≥30 คน = เสนอน้ำหนัก Ensemble ใหม่ (ไม่ apply อัตโนมัติ)
   ช่องทางนอกเว็บ: `datasets/real_users_kit/` — สคริปต์สร้าง Google Form ตามแบบประเมินปัจจุบัน + `import_responses.py` (CSV → labels.jsonl)
   แก้คำถาม/รายการอาชีพแล้วรัน `build_kit.py` ใหม่ ให้ Form ตรงกับแบบประเมินบนเว็บเสมอ

## โมเดล (รอบที่ 4 ใช้จริง: แบบประเมิน 76 ข้อ ทุกสายอาชีพ — `datasets/ml/output/general/`)
76 ข้อ = กลุ่มทักษะ 30 (Ward จาก 95 ทักษะ) + RIASEC 6 + ลักษณะงานทั่วไป 18 (`gtask::` จาก Task Statements)
+ งาน IT 12 (`task::`) + นิสัย 10 (`ws::` Work Styles) — ตัดเครื่องมือ IT 23 ข้อของรอบ 3 ออก (คนนอกสายตอบไม่ได้)
บนเว็บ/ฟอร์มแสดงเป็น 4 หมวด: งาน IT 12 ข้ออยู่ในหมวด 3 "ลักษณะงานที่ชอบ" (30 ข้อ) ไม่มีหัวข้อ IT แยก — ไม่เปลี่ยน feature/โมเดล
(ตัดออกแล้วนอกสาย IT แม่นลดด้วย: ดู `13_round4_comparison.csv` ชุด B vs C)
รอบ 3 (71 ข้อ, เอียงสาย IT) ยังอยู่ที่ `output/models/` ไว้เทียบ · รายละเอียด/ตารางเทียบ: `docs/ML.md` ส่วน 4b

| โมเดล | หน้าที่ | ใช้ที่หน้าเว็บ |
|---|---|---|
| ① Cosine Matching | เทียบเวกเตอร์ผู้ใช้กับ 910 อาชีพ | Career Recommendation |
| ②a MLP(256) | จำแนก 910 อาชีพ | รวมกับ ① เป็น Ensemble (น้ำหนัก 0.9 : 0.1) |
| ②b kNN (k=15) | จำแนก 22 กลุ่มอาชีพ (SOC major group) | กลุ่มอาชีพที่เหมาะ |
| ③ K-Means + PCA | จัดกลุ่มอาชีพ | อาชีพใกล้เคียง + แผนที่อาชีพ |
| Skill Priority | gap × (1 + 0.5·O*NET importance + 0.5·distinctiveness) | Skill Gap Dashboard |

ผล stress test รอบ 4: Ensemble Top-5 83.4%, Top-1 65.0% (รอบ 3: 74.6% / 57.0%) · สาย IT Top-1 85.2% (รอบ 3: 97.2%)

## ไฟล์สำคัญ
```
backend/                  FastAPI — ทุก endpoint อยู่ใต้ /api (ดู README.md ที่ root)
├── app/main.py           /health /features /recommend /skill-gap /explain /target /majors /major /careers (+major/cluster/riasec) /careers/{code} /careers/{code}/similar /labels /evaluation
├── scripts/make_sample_result.py  สร้าง frontend/src/data/sample_result.json ใหม่จากโมเดลจริง
├── app/schemas.py        pydantic models (ตรงกับ frontend/src/api/types.ts)
├── tests/test_api.py     pytest
└── requirements.txt      ตรึง scikit-learn==1.9.1 (เวอร์ชันที่ใช้เทรน — ห้ามเปลี่ยนจนกว่าจะเทรนใหม่)
frontend/                 React + Vite + TS + Tailwind v4 + TanStack Query + ECharts
├── src/api/client.ts     เรียก API; ไม่ตั้ง VITE_API_URL = โหมดตัวอย่าง (src/data/sample_result.json)
├── src/pages/            Home Login Account(/account) Assessment Careers CareerDetail(/careers/:code) Goal(อาชีพที่อยากเป็น) Explore(สำรวจอาชีพ) SkillGap Dashboard Roadmap Advisor
└── .env.local            VITE_API_URL=/api (vite proxy → :8000)
datasets/ml/
├── task_preferences.py   คำถามงาน IT 12 ข้อจาก Task Statements
├── short_assessment.py   รวมทักษะเป็น 30 กลุ่ม (output/short/)
├── major_crosswalk.py    สาขาไทย → อาชีพ: datasets/cip/ (CIP–SOC ของ NCES + thai_majors.csv ร่างโดย Claude) → models/major_occupations.json
├── general_assessment.py รอบ 4: ลักษณะงานทั่วไป 18 + นิสัย 10 + เทียบชุดคำถาม + คลังคำถาม 76 ข้อ
├── train_models.py       เทรน + ประเมิน  (--feature-set {core,D,short,general} --out <dir>)
├── predict.py            CareerPredictor สำหรับ backend (อ่านไฟล์ประกอบจากโฟลเดอร์ models)
├── calibrate_confidence.py  ความมั่นใจ: ผู้ใช้จำลอง 8,190 คน (ตอบ 1–5, seed 4001) → models/confidence_calibration.json
├── evaluation/           evaluate.py + personas.json
├── requirements-train.txt
└── output/general/models/ *.joblib, model_config.json (feature_order 76 ตัว), reference_vectors.csv,
                          tools_reference.csv (เครื่องมือ → Roadmap), skill_groups.csv, occupation_meta.csv
colab/                    notebook สำหรับ Google Colab (สร้างจาก build_*.py) + zip ข้อมูล · make_bundle.sh
docs/                     เอกสาร .md ทั้งหมด (สารบัญ docs/README.md) · render.yaml, docker-compose.yml ที่ root
```

ใช้ใน backend:
```python
from predict import CareerPredictor
p = CareerPredictor("output/general/models")
p.recommend(user, k=5)          # Top 5 + skill_coverage_percent + คะแนนแต่ละโมเดล + กลุ่มอาชีพ
p.skill_gap(user, code, k=10)   # ทักษะที่ขาด เรียงตาม Skill Priority (ชื่อกลุ่มภาษาไทย) + tools_used
p.similar_careers(code)         # อาชีพในคลัสเตอร์เดียวกัน
p.target(user, code)            # อาชีพที่ผู้ใช้อยากเป็น: อันดับใน 910 + explain + counterfactual (skills / all)
p.explain(user, code, k=5)      # ① แยกรายคำถาม: Σ contribution = cos(ผู้ใช้, อาชีพ) − cos เฉลี่ย 910 อาชีพ (แยกพอดี)
# recommend()["confidence"]      # คะแนนอันดับ 1 → ช่วง calibrate → Top-1/Top-5 ในผู้ใช้จำลอง
```
`user` = dict ของคะแนน 0–100 ตาม `feature_order` ใน model_config.json

รัน: `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000` · `cd frontend && npm run dev`
เทสต์: `cd backend && .venv/bin/python -m pytest -q` · `cd frontend && npm run build`
ฝั่งเทรน (notebook/train_models.py) ใช้เพิ่ม: `matplotlib openpyxl`

## Tech stack ที่ตัดสินใจแล้ว
- Frontend: React + Vite + TypeScript + Tailwind (+ shadcn/ui, TanStack Query, ECharts)
- Backend: FastAPI (Python เพื่อเรียก predict.py ได้ตรง)
- Database: PostgreSQL + pgvector (ไม่ใช้ MongoDB)
- Auth: JWT เก็บแค่ user_id — ประวัติแชท AI Advisor เก็บใน DB (ตาราง conversations/messages) ไม่ใช่ใน token
- Deploy: Docker + docker-compose (frontend, backend, PostgreSQL) — วิชาไม่บังคับ AWS/CI (ตัดสินใจ 12 พ.ย.)

## Database
schema ร่างไว้แล้วใน careerpath-db (ยังไม่ได้ย้ายเข้าโปรเจกต์นี้): 11 ตาราง
users, skills, careers, career_skills, assessments, user_skills, results, user_targets,
conversations, messages, roadmap_items + view skill_gaps, HNSW index
**ต้องแก้:** `careers.skill_vector` ยังเป็น `vector(7)` (ข้อมูลตัวอย่าง) ต้องเปลี่ยนเป็น `vector(76)` ให้ตรงกับ feature_order รอบ 4

## ดีไซน์ UI
- Claude Design canvas: https://claude.ai/artifact/Mprg12F9CWzk7FEJjipbFr
- หน้า: Home, Login/Register, Assessment, Careers, Skill Gap Dashboard (filter + กราฟเชื่อมกัน), Roadmap, AI Advisor (มีประวัติแชท)
- สี: primary #2747D0, text #111827, background #F6F7F9 · ฟอนต์ IBM Plex Sans Thai

## ขั้นต่อไป
- ~~ระยะ 1: รวมโปรเจกต์ + git, FastAPI ห่อ predict.py~~ (เสร็จ 12 พ.ย.)
- ~~ระยะ 2 — ทำให้ ML เด่น~~ (เสร็จ 12 พ.ย.): อธิบายผลรายคำถาม + ความมั่นใจ (หน้า Careers)
  หน้า What-if (แผนที่อาชีพ PCA) และ Model Lab เคยทำแล้ว **ผู้ใช้สั่งลบออก (12 พ.ย.)** — AI Advisor กลับอยู่ในเมนูหลักตามเดิม
  ผลวัดความแม่นดูได้ที่ `GET /api/evaluation`, `docs/ML.md` และ `output/general/*.csv`
- ระยะ 3 — ~~PostgreSQL + pgvector (`vector(76)`) + JWT + โปรไฟล์~~ (เสร็จ 13 พ.ย.), Roadmap "ผ่านเกณฑ์" (มีสถานะแล้ว), ~~LLM advisor~~ (เสร็จ 13 พ.ย.)
- ระยะ 4 — ~~ระบบประเมินหลายชั้น + ช่องเก็บผู้ใช้จริง~~ (เสร็จ 12 พ.ย.) · ผู้ใช้จริงเป็นทางเลือก ถ้ามีพอ
  ค่อยเทรน ②a ใหม่ · ปรับปรุงจุดอ่อนที่ persona เจอ (สายคน/ธุรกิจ, ②b)
- ~~ระยะ 5 — Docker + docker-compose~~ (เสร็จ 27 พ.ย.): `docker compose up -d --build` → http://localhost:8080
  frontend = nginx (build แล้ว + proxy `/api`), backend = `backend/Dockerfile` (context = root, คัดเฉพาะ datasets/ml ที่ใช้ตอนรัน), db
  ค่าลับอยู่ใน `.env` ที่ root (ดู `.env.example`) · ไม่ทำ AWS/GitHub Actions
- Deploy จริง (27 พ.ย., ฟรี): Vercel (frontend, `frontend/vercel.json`, Root Directory = frontend, `VITE_API_URL` = URL ของ Render + `/api`, ฝังตอน build → แก้แล้วต้อง Redeploy)
  + Render free (backend, `render.yaml` → `backend/Dockerfile` ตัวเดียวกัน, พอร์ตจาก `$PORT`, 512MB/0.1 CPU)
  **backend ไม่ auto-deploy**: แก้ backend/โมเดลแล้ว push ต้องกด Manual Deploy → Deploy latest commit ใน Render เอง (frontend บน Vercel deploy เอง)
  + Neon (Postgres) — ขั้นตอน: `docs/DEPLOY.md` · CORS: `CORS_ORIGINS` / `CORS_ORIGIN_REGEX`
  **ไม่ใช้ Hugging Face Spaces** (Docker Space ฟรีต้อง PRO แล้ว — 402 ตอนสร้าง, 27 พ.ย.) · ไม่ใช้ Render Postgres (ฟรีหมดอายุ 30 วัน)
  ข้อมูลผู้ใช้จริง (`/api/labels`) เก็บตาราง `real_labels` เมื่อมีฐานข้อมูล (ดิสก์ไม่ถาวร) + อ่านไฟล์ labels.jsonl ด้วย
  `/api/evaluation` ใช้ `output/general/evaluation/report.json` ที่คำนวณไว้ + คำนวณผู้ใช้จริงสด (รันใหม่ทั้งหมด > 5 นาทีบน 0.1 CPU)
  → เทรนใหม่ต้องรัน evaluate.py ด้วย (เทสต์ `test_precomputed_report_matches_models` ตรวจ)

## ข้อตกลง
- ตอบเป็นภาษาไทย
- อย่า commit `.env` หรือ JWT_SECRET; รหัส DB `careerpath_dev` ใช้แค่ตอน dev
- พูดถึงความแม่นของโมเดลตามจริงเสมอ: ตัวเลขทั้งหมดมาจากผู้ใช้จำลอง
