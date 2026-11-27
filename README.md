# CareerPath AI — AI Career Predictor + Skill Gap Analyzer

```
datasets/   ข้อมูล O*NET + Data Gate + โมเดล ML (datasets/ml — ดู datasets/ml/README.md)
            สรุปโมเดล + train/test สำหรับทำสไลด์: datasets/ml/README.md ส่วน 0
            โมเดลทีละตัว (ผล, train/test, เทียบกับอะไร, ใช้ที่ไหน): datasets/ml/MODELS.md
backend/    FastAPI ห่อ datasets/ml/predict.py  → http://localhost:8000/api (dev)
frontend/   React + Vite + TypeScript           → http://localhost:5173 (dev) · Docker: http://localhost:8080
```

## รันทั้งระบบด้วย Docker (แนะนำ — ไม่ต้องติดตั้ง Python / Node)
ต้องมี [Docker Desktop](https://www.docker.com/products/docker-desktop/)
```bash
cp .env.example .env          # ใส่ JWT_SECRET (สุ่มด้วยคำสั่งในไฟล์) · GEMINI_API_KEY ไม่บังคับ
docker compose up -d --build  # ครั้งแรก build ประมาณ 2–5 นาที
```
เปิด **http://localhost:8080** · หยุด: `docker compose down` (ข้อมูลบัญชีอยู่ใน volume `pgdata` ไม่หาย)

| service | ทำอะไร | พอร์ต |
|---|---|---|
| `frontend` | nginx เสิร์ฟเว็บ (build แล้ว) + ส่ง `/api` ต่อให้ backend | 8080 → เครื่องนี้ |
| `backend` | FastAPI + โมเดล ML (`datasets/ml/output/general/models`) + AI Advisor | ภายใน docker เท่านั้น |
| `db` | PostgreSQL 16 + pgvector | 127.0.0.1:5432 |

- ดูสถานะ / log: `docker compose ps` · `docker compose logs -f backend`
- แก้โค้ดแล้วรันใหม่: `docker compose up -d --build`
- ไม่ใส่ `GEMINI_API_KEY` = AI Advisor ตอบ 503 แล้วเว็บใช้คำตอบสรุปจาก ML แทน (โควตาฟรีตอบช้า 20–160 วินาที)
- `POSTGRES_PASSWORD` ถูกตั้งครั้งเดียวตอนสร้าง volume — จะเปลี่ยนทีหลังต้อง `docker compose down -v` (ลบข้อมูลบัญชีทั้งหมด)
- macOS: ถ้า build ขึ้น `docker-credential-desktop not found` ให้เปิด Docker Desktop ก่อน หรือเพิ่ม
  `/Applications/Docker.app/Contents/Resources/bin` ใน PATH

## รันแบบพัฒนา (แก้โค้ดแล้วรีโหลดทันที)
```bash
docker compose up -d db       # ฐานข้อมูลอย่างเดียว (คัดลอก backend/.env.example เป็น backend/.env ก่อน)

# backend (Python 3.13)
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/python -m pytest -q                 # เทสต์ API

# frontend (อีก terminal)
cd frontend
npm install
echo "VITE_API_URL=/api" > .env.local         # ไม่ตั้ง = โหมดตัวอย่าง ไม่ต้องมี backend
npm run dev
```

## API (`/api`)
| Method | Path | เรียก |
|---|---|---|
| GET | `/health` | สถานะ + จำนวน feature/อาชีพ |
| GET | `/features` | ลำดับ feature ของโมเดล (รอบที่ 4: 76 ตัว) |
| POST | `/recommend` `{user, k}` | `CareerPredictor.recommend()` |
| POST | `/skill-gap` `{user, code, k}` | `CareerPredictor.skill_gap()` |
| POST | `/explain` `{user, code, k}` | `CareerPredictor.explain()` — แยกคะแนน ① รายคำถาม |
| POST | `/target` `{user, code, k}` | `CareerPredictor.target()` — อาชีพที่อยากเป็น: อันดับใน 910 + counterfactual |
| GET | `/majors` | รายชื่อสาขาไทย 97 สาขา |
| POST | `/major` `{user, major, k}` | `CareerPredictor.major_view()` — อาชีพในสาย (CIP–SOC) เรียงด้วย Ensemble |
| GET | `/careers` | รายชื่อ 910 อาชีพ |
| GET | `/careers/{code}/similar` | `CareerPredictor.similar_careers()` |
| GET | `/evaluation` | persona + ความเสถียร + ผู้ใช้จริง (ถ้ามี) |
| POST | `/labels` | บันทึกผู้ใช้จริง (ไม่บังคับ) |

`/recommend` คืน `confidence` ด้วย (ต้องรัน `datasets/ml/calibrate_confidence.py` หลังเทรนใหม่)
หลังเทรนใหม่ให้สร้างข้อมูลโหมดตัวอย่างใหม่: `cd backend && .venv/bin/python scripts/make_sample_result.py`

`user` = `{feature: 0–100}` ตาม `feature_order` · เอกสาร Swagger: http://localhost:8000/docs

> scikit-learn ต้องเป็น **1.9.1** (เวอร์ชันที่ใช้เทรน) — ตรึงไว้ใน `backend/requirements.txt`
