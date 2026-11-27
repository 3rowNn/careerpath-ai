# Deploy ขึ้นเซิร์ฟเวอร์จริง (ฟรี ไม่ต้องใช้บัตร)

```
ผู้ใช้ ──► Vercel (หน้าเว็บ React)  ──/api──►  Hugging Face Spaces (FastAPI + ML, Docker)  ──►  Neon (PostgreSQL + pgvector)
          https://<project>.vercel.app          https://<user>-careerpath-api.hf.space         (connection string)
```

| ส่วน | บริการ | ฟรี | ข้อจำกัดที่ควรรู้ |
|---|---|---|---|
| หน้าเว็บ | Vercel (Hobby) | ✅ | push ขึ้น GitHub แล้ว deploy ใหม่อัตโนมัติ |
| API + โมเดล | Hugging Face Spaces (CPU basic) | ✅ | **ไม่มีคนเข้า 48 ชม. → หลับ** คนแรกที่เข้ารอปลุก ~1–2 นาที · ดิสก์ไม่ถาวร (ข้อมูลทั้งหมดอยู่ใน Neon) |
| ฐานข้อมูล | Neon (Free) | ✅ | 0.5 GB · หยุดเองเมื่อว่าง แล้วตื่นใน ~1 วินาที |

ทำตามลำดับ **1 → 2 → 3 → 4** (แต่ละขั้นใช้ค่าจากขั้นก่อน) · ⚠️ อย่าส่ง connection string / token / key ทางแชท — วางในหน้า Settings ของแต่ละบริการเท่านั้น

---

## 1. Neon — ฐานข้อมูล
1. สมัคร https://neon.tech (ล็อกอินด้วย GitHub ได้) → **Create project**
   - Postgres version: 16 หรือใหม่กว่า · Region: **AWS US East (N. Virginia)** (ใกล้เซิร์ฟเวอร์ Hugging Face)
2. หน้า Dashboard → **Connect** → คัดลอก connection string (เปิด "Connection pooling" ไว้) หน้าตาประมาณ
   `postgresql://neondb_owner:xxxx@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require`
3. เก็บไว้ใช้ขั้น 2 — **ไม่ต้องสร้างตารางเอง** backend สร้างให้ตอนเริ่ม (รวม `CREATE EXTENSION vector`)

## 2. Hugging Face Spaces — backend
1. สมัคร https://huggingface.co/join
2. สร้าง token: https://huggingface.co/settings/tokens → **Create new token** → ชนิด **Write**
3. ในเครื่องนี้:
   ```bash
   cd backend
   .venv/bin/pip install -r requirements-dev.txt
   .venv/bin/hf auth login                     # วาง token (ไม่แสดงบนจอ)
   .venv/bin/python ../deploy/huggingface/push_space.py --space <username>/careerpath-api
   ```
   สคริปต์สร้าง Space (Docker, public) และอัปโหลดเฉพาะไฟล์ที่ backend ใช้ (~23 MB) — ไม่มี `.env`
4. เปิด `https://huggingface.co/spaces/<username>/careerpath-api` → **Settings → Variables and secrets**

   | ชื่อ | ปุ่ม | ค่า |
   |---|---|---|
   | `DATABASE_URL` | New secret | connection string จากขั้น 1 (วางตามที่ Neon ให้ได้เลย) |
   | `JWT_SECRET` | New secret | สุ่มด้วย `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
   | `GEMINI_API_KEY` | New secret | ไม่บังคับ — ไม่ใส่ = AI Advisor ใช้คำตอบสรุปจาก ML |
   | `CORS_ORIGINS` | New variable | ใส่ทีหลังในขั้น 4 |

5. รอ build (~5 นาที แท็บ **Logs**) แล้วเปิด `https://<username>-careerpath-api.hf.space/api/health`
   ต้องได้ `{"status":"ok","features":76,"careers":910,...}`

## 3. Vercel — หน้าเว็บ
1. สมัคร https://vercel.com ด้วย GitHub → **Add New… → Project** → Import `careerpath-ai`
2. ตั้งค่าก่อนกด Deploy
   - **Root Directory:** `frontend` (สำคัญ — repo มีหลายโฟลเดอร์)
   - Framework: Vite (ตรวจเจอเองจาก `frontend/vercel.json`)
   - **Environment Variables:** `VITE_API_URL` = `https://<username>-careerpath-api.hf.space/api`
3. **Deploy** → ได้ลิงก์ เช่น `https://careerpath-ai.vercel.app`
   (ค่า `VITE_API_URL` ฝังตอน build — แก้ทีหลังต้องกด **Redeploy**)

## 4. เชื่อมเว็บกับ API (CORS)
กลับไปที่ Space → Settings → Variables
- `CORS_ORIGINS` = โดเมนจากขั้น 3 เช่น `https://careerpath-ai.vercel.app` (ไม่มี `/` ท้าย · หลายโดเมนคั่นด้วย `,`)
- (ไม่บังคับ) `CORS_ORIGIN_REGEX` = `^https://careerpath-ai-[a-z0-9-]+\.vercel\.app$` ให้ลิงก์ preview ของ Vercel ใช้ได้ด้วย

Space จะรีสตาร์ตเอง → เปิดเว็บ ทำแบบประเมิน สมัครสมาชิก ลองแชท AI

---

## อัปเดตหลังแก้โค้ด
| แก้ | ทำ |
|---|---|
| frontend | `git push` → Vercel deploy เอง |
| backend / โมเดล | `cd backend && .venv/bin/python ../deploy/huggingface/push_space.py --space <username>/careerpath-api` |

## แก้ปัญหา
| อาการ | สาเหตุ / แก้ |
|---|---|
| เว็บขึ้น "โหมดตัวอย่าง" | ไม่ได้ตั้ง `VITE_API_URL` ใน Vercel หรือตั้งแล้วไม่ได้ Redeploy |
| เรียก API แล้ว error ใน Console ว่า CORS | `CORS_ORIGINS` ไม่ตรงโดเมนเว็บ (ตรวจ https, ไม่มี `/` ท้าย) |
| หน้าแรกค้าง ~1–2 นาที | Space หลับ (ไม่มีคนเข้า 48 ชม.) — กำลังตื่น · ก่อนนำเสนอเปิด `/api/health` ไว้ก่อน |
| สมัครสมาชิกไม่ได้ (503) | ไม่ได้ตั้ง `DATABASE_URL` ใน Space หรือ connection string ผิด (ดูแท็บ Logs) |
| AI Advisor ตอบช้า/ไม่ตอบ | Gemini โควตาฟรีช้า 20–160 วินาที หรือหมดโควตา — ระบบสลับโมเดลสำรองให้เอง |

> ทั้ง 3 บริการฟรีตามเงื่อนไขปัจจุบัน (พ.ย. 2026) — ผู้ให้บริการเปลี่ยนเงื่อนไขได้
> รันทั้งระบบในเครื่องยังใช้ `docker compose up -d --build` ได้เหมือนเดิม (ดู README)
