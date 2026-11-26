"""รูปแบบ request/response — ตรงกับ frontend/src/api/types.ts และค่าที่ predict.py คืน"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

Score = Annotated[float, Field(ge=0, le=100)]


class UserIn(BaseModel):
    # feature → คะแนน 0–100 ((คำตอบ 1–5 − 1) ÷ 4 × 100); feature ที่ไม่ส่งมา predict.py ใช้ค่ากลาง 50
    user: dict[str, Score] = Field(min_length=1)


class RecommendIn(UserIn):
    k: int = Field(5, ge=1, le=20)


class SkillGapIn(UserIn):
    code: str
    k: int = Field(10, ge=1, le=30)


class CareerOut(BaseModel):
    rank: int
    code: str
    title: str
    skill_coverage_percent: float
    ensemble_score: float
    matching_similarity: float
    classifier_probability: float
    cluster: int


class MajorGroupOut(BaseModel):
    major: str
    probability: float


class ConfidenceOut(BaseModel):
    """ความมั่นใจ: คะแนน Ensemble อันดับ 1 เทียบตาราง calibrate (ผู้ใช้จำลอง 8,190 คน — ไม่ใช่คนจริง)"""

    level: Literal["low", "medium", "high"]
    bin: int
    n_bins: int
    top1_score: float
    sim_top1_accuracy: float
    sim_top5_accuracy: float
    models_agree: bool  # ① กับ ②a เลือกอันดับ 1 ตรงกัน
    sim_top1_if_agreement: float
    n_simulated: int


class RecommendOut(BaseModel):
    careers: list[CareerOut]
    major_groups: list[MajorGroupOut]
    missing_features: list[str]
    confidence: ConfidenceOut | None = None


class ExplainIn(UserIn):
    code: str
    k: int = Field(5, ge=1, le=20)


class ContributionOut(BaseModel):
    feature: str
    name: str
    domain: str
    user: float
    required: float
    contribution: float  # ส่วนที่ข้อนี้ทำให้ cosine สูง/ต่ำกว่าค่าเฉลี่ยทุกอาชีพ
    share: float  # contribution ÷ Σ|contribution|


class ExplainOut(BaseModel):
    code: str
    title: str
    similarity: float
    mean_similarity: float
    rank_matching: int
    positive: list[ContributionOut]
    negative: list[ContributionOut]
    by_domain: dict[str, float]


class SkillRowOut(BaseModel):
    feature: str
    name: str
    domain: str
    user: float
    required: float
    gap: float
    priority: float


class SkillGapOut(BaseModel):
    code: str
    title: str
    skills_met: int
    skills_total: int
    top_priorities: list[SkillRowOut]
    tools_used: list[str]
    all: list[SkillRowOut]


class SimilarCareerOut(BaseModel):
    code: str
    title: str
    similarity: float


class CareerListItem(BaseModel):
    code: str
    title: str
    major: str | None = None  # 2 ตัวแรกของรหัส SOC
    cluster: int | None = None  # ③ K-Means
    riasec: list[str] = []  # ความสนใจ 2 ด้านที่อาชีพนี้สูงสุด เช่น ["Social", "Investigative"]


class CareerRequirement(BaseModel):
    feature: str
    domain: str  # grp ri gtask task ws
    name: str  # ชื่อกลุ่มทักษะภาษาไทย (grp::) หรือชื่อ feature (อื่น ๆ — frontend แปลงเป็นคำถาม)
    required: float  # ระดับที่อาชีพนี้ต้องการ/ตรงกับ 0–100 (reference vector)
    distinctiveness: float  # สูงกว่าค่าเฉลี่ย 910 อาชีพกี่ SD
    onet_importance: float | None = None  # 0–100 เฉพาะกลุ่มทักษะ


class CareerDetailOut(BaseModel):
    """ข้อมูลอาชีพจากไฟล์ที่โมเดลใช้อยู่แล้ว — ไม่มีข้อมูลเงินเดือน วุฒิการศึกษา หรือความต้องการตลาด"""

    code: str
    title: str
    description: str | None = None  # O*NET ภาษาอังกฤษ
    major: str
    major_name: str | None = None
    cluster: int  # ③ K-Means
    requirements: list[CareerRequirement]
    tools: list[str]


Answer = Annotated[int, Field(ge=1, le=5)]


class LabelIn(BaseModel):
    """ข้อมูลผู้ใช้จริง (ไม่บังคับ): คำตอบดิบ 1–5 + อาชีพที่ทำอยู่จริง — ไม่เก็บชื่อ/อีเมล"""

    answers: dict[str, Answer] = Field(min_length=1)
    code: str
    years_in_role: Literal["<1", "1-3", "3-5", "5+"] | None = None
    consent: bool


class LabelOut(BaseModel):
    saved: bool
    total: int


class HealthOut(BaseModel):
    status: str
    features: int
    careers: int
    feature_set: str | None


# ---------- อาชีพที่ผู้ใช้อยากเป็น + counterfactual ----------
class TargetIn(UserIn):
    code: str
    k: int = Field(5, ge=1, le=20)


class CfStepOut(BaseModel):
    feature: str
    name: str
    to: float
    rank_after: int
    from_: float = Field(alias="from")


class CfChangeOut(BaseModel):
    feature: str
    name: str
    to: float
    required: float
    from_: float = Field(alias="from")


class CfBlockOut(BaseModel):
    feature: str
    name: str
    domain: str
    user: float
    required: float


class CounterfactualOut(BaseModel):
    """เปลี่ยนคำตอบน้อยที่สุดเท่าไร อาชีพเป้าหมายจึงเข้า Top k (ค้นแบบ greedy ด้วย Ensemble จริง)"""

    model_config = {"populate_by_name": True}
    code: str
    k: int
    mode: Literal["skills", "all"]
    rank_before: int
    rank_after: int
    reached: bool
    already: bool
    levels: int
    max_steps: int
    steps: list[CfStepOut]
    changes: list[CfChangeOut]
    blocking: list[CfBlockOut]


class TargetOut(BaseModel):
    career: CareerOut  # rank = อันดับใน 910 อาชีพตาม Ensemble
    total: int
    explain: ExplainOut
    counterfactual: CounterfactualOut
    counterfactual_all: CounterfactualOut


# ---------- สาขาที่จบ (ตาราง CIP–SOC + จัดอันดับด้วย Ensemble) ----------
class MajorItem(BaseModel):
    id: str
    faculty: str
    major_th: str


class MajorIn(UserIn):
    major: str
    k: int = Field(10, ge=1, le=50)


class MajorOut(BaseModel):
    id: str
    faculty: str
    major_th: str
    cip_titles: list[str]
    n_linked: int  # อาชีพใน 910 ที่ตาราง CIP–SOC เชื่อมกับสาขานี้
    total: int
    careers: list[CareerOut]  # rank = อันดับใน 910 ของผู้ใช้
    in_top5: list[str]
    best_rank: int | None
