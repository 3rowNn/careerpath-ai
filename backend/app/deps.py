"""โหลดโมเดลครั้งเดียวต่อ process — ใช้ร่วมกันใน main.py และ account.py"""

import os
import sys
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # backend/.env (ไม่ commit) — ไม่มีไฟล์ก็ข้าม
ML_DIR = Path(os.getenv("ML_DIR", ROOT / "datasets" / "ml"))
MODEL_DIR = Path(os.getenv("MODEL_DIR", ML_DIR / "output" / "general" / "models"))  # รอบที่ 4: 76 ข้อ ทุกสายอาชีพ
sys.path.insert(0, str(ML_DIR))

from predict import CareerPredictor  # noqa: E402


@lru_cache(maxsize=1)
def get_predictor() -> CareerPredictor:
    """โหลดโมเดลครั้งเดียวต่อ process (~16 MB)"""
    return CareerPredictor(MODEL_DIR)
