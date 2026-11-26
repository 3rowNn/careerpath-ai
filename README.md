# CareerPath AI — AI Career Predictor + Skill Gap Analyzer

```
datasets/   ข้อมูล O*NET + Data Gate + โมเดล ML (datasets/ml — ดู datasets/ml/README.md)
            สรุปโมเดล + train/test สำหรับทำสไลด์: datasets/ml/README.md ส่วน 0
            โมเดลทีละตัว (ผล, train/test, เทียบกับอะไร, ใช้ที่ไหน): datasets/ml/MODELS.md
backend/    FastAPI ห่อ datasets/ml/predict.py  → http://localhost:8000/api
frontend/   React + Vite + TypeScript           → http://localhost:5173
```

## รันครั้งแรก
```bash
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
