"""
อัปโหลด backend ขึ้น Hugging Face Spaces (Docker)

จัดไฟล์ที่ backend ใช้ตอนรันให้อยู่โครงสร้างเดียวกับ repo (backend/, datasets/ml/...) แล้วใช้ backend/Dockerfile
ตัวเดียวกับ docker-compose เป็น Dockerfile ของ Space — ไม่มีโค้ดสองชุด

ใช้:
    cd backend && .venv/bin/pip install -r requirements-dev.txt      # มี huggingface_hub
    .venv/bin/hf auth login                                           # token แบบ Write จาก huggingface.co/settings/tokens
    .venv/bin/python ../deploy/huggingface/push_space.py --space <username>/careerpath-api
    .venv/bin/python ../deploy/huggingface/push_space.py --dry-run   # ดูว่าจะอัปโหลดไฟล์อะไร ไม่ส่งจริง

ค่าลับ (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY) ตั้งในหน้า Settings ของ Space — ไม่อยู่ในไฟล์ที่อัปโหลด
"""

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

# ไฟล์/โฟลเดอร์ที่ backend/Dockerfile COPY (ต้องตรงกัน)
INCLUDE = [
    "backend/requirements.txt",
    "backend/app",
    "backend/data",
    "datasets/ml/predict.py",
    "datasets/ml/evaluation/evaluate.py",
    "datasets/ml/evaluation/personas.json",
    "datasets/ml/output/general/models",
    "datasets/ml/output/general/evaluation",
    "datasets/ml/output/general/question_bank_general.csv",
]
SKIP_NAMES = {"__pycache__", ".DS_Store", ".env", ".pytest_cache"}


def stage(dst: Path) -> list[Path]:
    """คัดลอกไฟล์ที่ต้องใช้ไปไว้ที่ dst · คืนรายการไฟล์ (path เทียบกับ dst)"""
    for rel in INCLUDE:
        src = ROOT / rel
        if not src.exists():
            sys.exit(f"ไม่พบ {rel} — เทรนโมเดล/สร้างคลัง Advisor ครบหรือยัง?")
        if src.is_dir():
            shutil.copytree(src, dst / rel, ignore=shutil.ignore_patterns(*SKIP_NAMES, "*.pyc", ".env*"))
        else:
            (dst / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst / rel)
    shutil.copy2(ROOT / "backend" / "Dockerfile", dst / "Dockerfile")
    shutil.copy2(HERE / "SPACE_README.md", dst / "README.md")
    files = sorted(p.relative_to(dst) for p in dst.rglob("*") if p.is_file())
    leaked = [f for f in files if f.name.startswith(".env")]
    if leaked:
        sys.exit(f"หยุด: พบไฟล์ค่าลับ {leaked}")
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--space", help="<username>/<space-name> เช่น 3rowNn/careerpath-api")
    ap.add_argument("--dry-run", action="store_true", help="แสดงไฟล์ที่จะอัปโหลด ไม่ส่งจริง")
    ap.add_argument("--out", type=Path, help="เก็บโฟลเดอร์ที่จัดแล้วไว้ที่นี่ (เช่น ไว้ docker build ทดสอบ)")
    a = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        dst = a.out or Path(tmp)
        if a.out and dst.exists():
            shutil.rmtree(dst)
        dst.mkdir(parents=True, exist_ok=True)
        files = stage(dst)
        size = sum((dst / f).stat().st_size for f in files) / 1e6
        print(f"จัดไฟล์แล้ว {len(files)} ไฟล์ · {size:.1f} MB → {dst}")
        if a.dry_run or not a.space:
            for f in files:
                print("  ", f)
            if not a.space:
                print("\nใส่ --space <username>/<space-name> เพื่ออัปโหลด")
            return

        from huggingface_hub import HfApi

        api = HfApi()
        api.create_repo(a.space, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
        # delete_patterns: ลบไฟล์เก่าที่ไม่มีแล้วใน Space ให้ตรงกับ repo หลัก
        api.upload_folder(
            repo_id=a.space,
            repo_type="space",
            folder_path=str(dst),
            commit_message="อัปเดต backend จาก repo หลัก",
            delete_patterns=["*"],
        )
        owner, name = a.space.split("/", 1)
        sub = f"{owner}-{name}".lower().replace("_", "-").replace(".", "-")
        print(f"\nอัปโหลดแล้ว: https://huggingface.co/spaces/{a.space}")
        print(f"API (หลัง build เสร็จ ~5 นาที): https://{sub}.hf.space/api/health")


if __name__ == "__main__":
    main()
