# CareerPath AI — Frontend

> path ในเอกสารนี้เทียบกับโฟลเดอร์ `frontend/`

React + Vite + TypeScript + Tailwind v4 · TanStack Query · ECharts · React Router
ทำตามดีไซน์ใน Claude Design canvas (8 หน้า)

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## หน้า
| Route | หน้า | ข้อมูลจาก |
|---|---|---|
| `/` | Home | ผลตัวอย่าง |
| `/login` | Login / Register | (mock — ยังไม่มี JWT) |
| `/assessment` | แบบประเมิน 71 ข้อ 4 หมวด | `src/data/questions.json` (จาก question_bank_short.csv) |
| `/careers` | Top 5 + คะแนน ①/②a/Ensemble + ②b กลุ่มอาชีพ + ③ อาชีพใกล้เคียง + Matrix | `recommend`, `skill_gap`, `similar_careers` |
| `/skill-gap` | KPI + ตัวกรอง + Radar + Gap รายทักษะ + Skill Priority + เครื่องมือ | `skill_gap` |
| `/dashboard` | ตัวกรองเชื่อมทุกการ์ด, ทักษะที่เลือก, พัฒนาการ, อันดับ, แชทล่าสุด | ทั้งหมด + ประวัติใน localStorage |
| `/roadmap` | 3 ระยะจาก Skill Priority + tools_used (คลิกเปลี่ยนสถานะ) | `skill_gap` |
| `/advisor` | แชท + ประวัติ (ค้นหา/ลบ) | mock ตอบจากผล ML |

## โหมดข้อมูล
- **ไม่ตั้ง `VITE_API_URL` (ค่าเริ่มต้น) = โหมดตัวอย่าง** — ใช้ `src/data/sample_result.json`
  ซึ่งเป็นผลจาก `predict.py` จริงกับผู้ใช้ตัวอย่าง 1 คน → ผลจึง**ไม่เปลี่ยนตามคำตอบ**
- **`VITE_API_URL=/api`** — เรียก FastAPI (vite proxy → `http://localhost:8000`) สัญญา endpoint อยู่ใน `src/api/client.ts`:
  - `POST /recommend` `{ user: {feature: 0–100}, k }` → `CareerPredictor.recommend()`
  - `POST /skill-gap` `{ user, code, k }` → `CareerPredictor.skill_gap()`
  - `GET  /careers/{code}/similar` → `CareerPredictor.similar_careers()`
  - `POST /advisor/chat` `{ history, message }` → `{ reply }`

คำตอบ 1–5 แปลงเป็น 0–100 ที่ฝั่ง frontend: `(คำตอบ − 1) ÷ 4 × 100`

## ยังเป็นของชั่วคราว (ย้ายไป backend)
- Login, ผลประเมิน, ประวัติ, Roadmap status, แชท → เก็บใน localStorage (`src/lib/store.tsx`)
- AI Advisor ยังไม่เชื่อม LLM
