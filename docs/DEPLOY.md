# Deploy ขึ้นเซิร์ฟเวอร์จริง (ฟรี ไม่ต้องใช้บัตร)

```
ผู้ใช้ ──► Vercel (หน้าเว็บ React) ──/api──► Render (FastAPI + ML, Docker) ──► Neon (PostgreSQL + pgvector)
          https://<project>.vercel.app        https://careerpath-api.onrender.com     (connection string)
```

| ส่วน | บริการ | ข้อจำกัดของแพ็กเกจฟรีที่ควรรู้ |
|---|---|---|
| หน้าเว็บ | Vercel (Hobby) | push ขึ้น GitHub แล้ว deploy ใหม่อัตโนมัติ |
| API + โมเดล | Render (free web service) | 512 MB RAM / 0.1 CPU · **ไม่มีคนเข้า 15 นาที → หลับ** ปลุก ~1–2 นาที (+เริ่มแอปบน 0.1 CPU ~1.5 นาที) · ดิสก์ไม่ถาวร · 750 ชม./เดือน |
| ฐานข้อมูล | Neon (Free) | 0.5 GB · หยุดเองเมื่อว่าง แล้วตื่นใน ~1 วินาที |

> ไม่ใช้ Hugging Face Spaces: Docker Space บน CPU ฟรีต้องสมัคร PRO แล้ว (ตรวจ 27 พ.ย. 2026)
> ไม่ใช้ Render Postgres: แบบฟรีหมดอายุใน 30 วันแล้วถูกลบ

วัดบนเครื่องจำลอง 512 MB / 0.1 CPU: แนะนำอาชีพ · Skill Gap · อธิบายผล < 0.5 วินาที · อาชีพที่อยากเป็น (counterfactual) ~5 วินาที ·
สมัครสมาชิก ~4 วินาที · ใช้ RAM ~220 MB

ทำตามลำดับ **1 → 2 → 3 → 4** · ⚠️ อย่าส่ง connection string / token / key ทางแชท — วางในหน้า Settings ของแต่ละบริการเท่านั้น

---

## 1. Neon — ฐานข้อมูล
1. สมัคร https://neon.tech (ล็อกอินด้วย GitHub ได้) → **Create project**
   - Region: **AWS US East 1 (N. Virginia)** (ใกล้ Render virginia)
2. Dashboard → **Connect** → คัดลอก connection string (เปิด Connection pooling) หน้าตาประมาณ
   `postgresql://neondb_owner:xxxx@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require`
3. **ไม่ต้องสร้างตารางเอง** — backend สร้างให้ตอนเริ่ม (รวม `CREATE EXTENSION vector`)

## 2. Render — backend
1. สมัคร https://render.com ด้วย GitHub (อนุญาตให้เห็น repo `careerpath-ai`)
2. **New → Blueprint** → เลือก repo `careerpath-ai` (Render อ่าน `render.yaml` ที่ root เอง)
3. ใส่ค่าที่ถาม
   | ชื่อ | ค่า |
   |---|---|
   | `DATABASE_URL` | connection string จากขั้น 1 (วางตามที่ Neon ให้ได้เลย) |
   | `GEMINI_API_KEY` | ไม่บังคับ — เว้นว่าง = AI Advisor ใช้คำตอบสรุปจาก ML |
   | `CORS_ORIGINS` | ใส่ทีหลังในขั้น 4 (เว้นว่างไว้ก่อน) |
   | `CORS_ORIGIN_REGEX` | เว้นว่าง |

   `JWT_SECRET` Render สุ่มให้เอง
4. **Apply** → รอ build ~5–10 นาที (ดูที่ Logs) → เปิด `https://careerpath-api.onrender.com/api/health`
   ต้องได้ `{"status":"ok","features":76,"careers":910,...}`
   (ถ้าชื่อ `careerpath-api` ถูกใช้แล้ว Render จะต่อท้ายชื่อ — ใช้ URL ที่หน้า service แสดง)

## 3. Vercel — หน้าเว็บ
1. สมัคร https://vercel.com ด้วย GitHub → **Add New… → Project** → Import `careerpath-ai`
2. ตั้งค่าก่อนกด Deploy
   - **Root Directory:** `frontend` (สำคัญ — repo มีหลายโฟลเดอร์)
   - Framework: Vite (ตรวจเจอเองจาก `frontend/vercel.json`)
   - **Environment Variables:** `VITE_API_URL` = `https://careerpath-api.onrender.com/api` (URL จากขั้น 2 + `/api`)
3. **Deploy** → ได้ลิงก์ เช่น `https://careerpath-ai.vercel.app`
   (ค่า `VITE_API_URL` ฝังตอน build — แก้ทีหลังต้องกด **Redeploy**)

## 4. เชื่อมเว็บกับ API (CORS)
Render → service `careerpath-api` → **Environment**
- `CORS_ORIGINS` = โดเมนจากขั้น 3 เช่น `https://careerpath-ai.vercel.app` (ไม่มี `/` ท้าย · หลายโดเมนคั่นด้วย `,`)
- (ไม่บังคับ) `CORS_ORIGIN_REGEX` = `^https://careerpath-ai-[a-z0-9-]+\.vercel\.app$` ให้ลิงก์ preview ของ Vercel ใช้ได้

กด **Save, rebuild, and deploy** → เปิดเว็บ ทำแบบประเมิน สมัครสมาชิก ลองแชท AI

---

## อัปเดตหลังแก้โค้ด
`git push` ขึ้น `main` → Vercel และ Render build ใหม่เองทั้งคู่
(หลังเทรนโมเดลใหม่ ต้องรัน `datasets/ml/evaluation/evaluate.py` ก่อน push — `/api/evaluation` ใช้ `report.json` ที่คำนวณไว้
เทสต์ `test_precomputed_report_matches_models` จะเตือนถ้าลืม)

## แก้ปัญหา
| อาการ | สาเหตุ / แก้ |
|---|---|
| เว็บขึ้น "โหมดตัวอย่าง" | ไม่ได้ตั้ง `VITE_API_URL` ใน Vercel หรือตั้งแล้วไม่ได้ Redeploy |
| Console ขึ้น error CORS | `CORS_ORIGINS` ไม่ตรงโดเมนเว็บ (ตรวจ https, ไม่มี `/` ท้าย) |
| เข้าเว็บครั้งแรกโหลดนาน 2–3 นาที | backend หลับ (ไม่มีคนเข้า 15 นาที) · **ก่อนนำเสนอเปิด `/api/health` ทิ้งไว้ก่อน 3 นาที** |
| สมัครสมาชิกไม่ได้ (503) | ไม่ได้ตั้ง `DATABASE_URL` หรือ connection string ผิด (ดู Logs ของ Render) |
| AI Advisor ตอบช้า/ไม่ตอบ | Gemini โควตาฟรีช้า 20–160 วินาที หรือหมดโควตา — ระบบสลับโมเดลสำรองให้เอง |

> ทุกบริการฟรีตามเงื่อนไขที่ตรวจเมื่อ พ.ย. 2026 — ผู้ให้บริการเปลี่ยนเงื่อนไขได้ (เช่น Hugging Face ที่เพิ่งเปลี่ยน)
> รันทั้งระบบในเครื่องยังใช้ `docker compose up -d --build` ได้เหมือนเดิม (ดู README)
