# CareerPath AI — backend (FastAPI + โมเดล ML)
# build จาก root ของ repo:  docker compose build backend
#   (context = root เพราะต้องใช้ datasets/ml/predict.py และไฟล์โมเดลด้วย)
# Hugging Face Spaces ใช้ไฟล์นี้ตัวเดียวกัน (deploy/huggingface/push_space.py จัดไฟล์ให้โครงสร้างเหมือน repo)
# โครงสร้างใน image เหมือน repo (/app/backend, /app/datasets/ml) — deps.py หา ROOT จากตำแหน่งไฟล์ จึงไม่ต้องแก้โค้ด
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend

# ติดตั้ง dependency ก่อน (layer นี้ cache ได้ ถ้า requirements ไม่เปลี่ยน)
# scikit-learn ตรึงที่ 1.9.1 = เวอร์ชันที่ใช้เทรน
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# ML: เฉพาะไฟล์ที่ backend ใช้ตอนรัน (predict.py, evaluate.py + personas, โมเดลรอบ 4, คลังคำถาม)
COPY datasets/ml/predict.py /app/datasets/ml/predict.py
COPY datasets/ml/evaluation/evaluate.py datasets/ml/evaluation/personas.json /app/datasets/ml/evaluation/
COPY datasets/ml/output/general/models /app/datasets/ml/output/general/models
COPY datasets/ml/output/general/evaluation /app/datasets/ml/output/general/evaluation
COPY datasets/ml/output/general/question_bank_general.csv /app/datasets/ml/output/general/

# แอป + คลัง AI Advisor (backend/.env ไม่ถูกคัดลอก — กันไว้ใน .dockerignore, ค่าลับส่งผ่าน environment)
COPY backend/app ./app
COPY backend/data ./data

# ไม่รันด้วย root · โฟลเดอร์ข้อมูลผู้ใช้จริง (POST /api/labels) ต่อกับ volume ใน docker-compose
# chmod: ไฟล์บางตัวในเครื่องที่ build เป็น 600 (อ่านได้แค่เจ้าของ) → ให้ทุกไฟล์ของแอปอ่านได้ ไม่ขึ้นกับสิทธิ์ในเครื่อง
# uid 1000 = user ที่ Hugging Face Spaces ใช้รัน container
RUN useradd --create-home --uid 1000 app \
    && chmod -R a+rX /app \
    && mkdir -p /app/datasets/real_users \
    && chown -R app:app /app/datasets/real_users
USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

# production: ไม่มี --reload · worker เดียว (โมเดลโหลดไว้ในหน่วยความจำครั้งเดียว)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
