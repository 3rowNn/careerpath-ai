import os

# เทสต์ใช้ SQLite ในหน่วยความจำเสมอ (ไม่แตะฐานข้อมูล dev ใน backend/.env)
# ตั้งก่อน import app — load_dotenv ไม่ทับค่าที่ตั้งไว้แล้ว
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["GEMINI_API_KEY"] = ""  # เทสต์ไม่เรียก LLM จริง (ไม่เสียโควตา/ไม่ต้องมีเน็ต)
