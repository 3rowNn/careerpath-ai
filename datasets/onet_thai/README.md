# ชื่ออาชีพภาษาไทย (910 อาชีพของ O*NET)

`onet_thai_titles.csv` — code, title_en, title_th, aliases

- **แปลโดย Claude (12 พ.ย.)** ไม่ใช่ชื่อทางการ — O*NET ไม่มีชื่อไทย และมาตรฐานอาชีพไทย (TSCO) หยาบกว่า
  (หลายอาชีพของ O*NET ได้ชื่อ TSCO เดียวกัน) · ควรให้ผู้รู้ตรวจ โดยเฉพาะอาชีพที่ไม่มีในไทยโดยตรง
- `aliases` = ชื่อที่ใช้เรียกอีกแบบ (จาก occupations_shortlist.csv ของชุดเก็บข้อมูลจริง) ใช้ให้ค้นหาเจอ
- ใช้ที่: frontend `src/data/thai_titles.json` + `title_aliases.json` (สร้างจากไฟล์นี้), Google Form (`real_users_kit/build_kit.py`)
