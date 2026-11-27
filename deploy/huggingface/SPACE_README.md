---
title: CareerPath AI API
emoji: 🧭
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
short_description: ML career recommender API (FastAPI)
---

# CareerPath AI — backend API

FastAPI + โมเดล ML (แนะนำอาชีพจาก 910 อาชีพ O*NET, Skill Gap, Roadmap) + AI Advisor
หน้าเว็บอยู่บน Vercel · ฐานข้อมูล PostgreSQL อยู่บน Neon

- สถานะ: `/api/health` · เอกสาร API: `/docs`
- ไฟล์ใน Space นี้สร้างอัตโนมัติจาก repo หลักด้วย `deploy/huggingface/push_space.py` — อย่าแก้ที่นี่

ตั้งค่าใน Settings → Variables and secrets:

| ชื่อ | ชนิด | ค่า |
|---|---|---|
| `DATABASE_URL` | Secret | connection string จาก Neon |
| `JWT_SECRET` | Secret | ค่าสุ่มยาว ๆ |
| `GEMINI_API_KEY` | Secret | ไม่บังคับ (AI Advisor) |
| `CORS_ORIGINS` | Variable | โดเมนเว็บบน Vercel เช่น `https://careerpath-ai.vercel.app` |

ข้อมูลอาชีพจาก O*NET Resource Center (U.S. Department of Labor) สัญญาอนุญาต CC BY 4.0
