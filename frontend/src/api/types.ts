// รูปแบบข้อมูลตรงกับที่ datasets/ml/predict.py คืนค่า (CareerPredictor)

/** คำตอบแบบประเมิน: feature → 1..5 */
export type Answers = Record<string, number>;

/** เวกเตอร์ผู้ใช้ที่ส่งให้โมเดล: feature → 0..100 */
export type UserVector = Record<string, number>;

export interface Question {
  no: number;
  section: string;
  feature: string;
  question: string;
  scale: string;
}

export interface CareerResult {
  rank: number;
  code: string;
  title: string; // ชื่อไทย (แปลงใน api/client.ts) — ชื่อ O*NET อยู่ที่ title_en
  title_en?: string;
  skill_coverage_percent: number;
  ensemble_score: number;
  matching_similarity: number; // ① Cosine Matching
  classifier_probability: number; // ②a MLP
  cluster: number; // ③ K-Means
}

export interface MajorGroup {
  major: string; // SOC major group เช่น "15"
  probability: number; // ②b kNN
}

/** ความมั่นใจ: คะแนน Ensemble อันดับ 1 เทียบตาราง calibrate จากผู้ใช้จำลอง (ไม่ใช่คนจริง) */
export interface Confidence {
  level: "low" | "medium" | "high";
  bin: number;
  n_bins: number;
  top1_score: number;
  sim_top1_accuracy: number;
  sim_top5_accuracy: number;
  models_agree: boolean; // ① กับ ②a เลือกอันดับ 1 ตรงกัน
  sim_top1_if_agreement: number;
  n_simulated: number;
}

export interface RecommendResult {
  careers: CareerResult[];
  major_groups: MajorGroup[];
  missing_features: string[];
  confidence?: Confidence | null; // ผลเก่าใน browser อาจไม่มี
}

export interface Contribution {
  feature: string;
  name: string;
  domain: string;
  user: number;
  required: number;
  contribution: number;
  share: number;
}

/** ① แยกคะแนน Cosine เป็นรายคำถาม: Σ contribution = similarity − mean_similarity */
export interface ExplainResult {
  code: string;
  title: string;
  title_en?: string;
  similarity: number;
  mean_similarity: number;
  rank_matching: number;
  positive: Contribution[];
  negative: Contribution[];
  by_domain: Record<string, number>;
}

export interface SkillRow {
  feature: string;
  name: string;
  domain: string;
  user: number;
  required: number;
  gap: number;
  priority: number;
}

export interface SkillGapResult {
  code: string;
  title: string;
  title_en?: string;
  skills_met: number;
  skills_total: number;
  top_priorities: SkillRow[];
  tools_used: string[];
  all: SkillRow[];
}

export interface SimilarCareer {
  code: string;
  title: string;
  title_en?: string;
  similarity: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  sources?: string[]; // ข้อความของ AI: เครื่องมือที่ใช้ตอบ (แสดงเป็นป้ายอ้างอิง — ไม่เก็บในฐานข้อมูล)
}

export interface Conversation {
  id: string;
  title: string;
  careerCode: string | null;
  careerTitle: string | null;
  createdAt: number;
  messages: ChatMessage[];
}

// ---------- อาชีพที่ผู้ใช้อยากเป็น + counterfactual ----------
export interface CfChange {
  feature: string;
  name: string;
  from: number;
  to: number;
  required: number;
}

export interface Counterfactual {
  code: string;
  k: number;
  mode: "skills" | "all";
  rank_before: number;
  rank_after: number;
  reached: boolean;
  already: boolean;
  levels: number; // จำนวนครั้งที่ขยับคำตอบ 1 ระดับ
  max_steps: number;
  steps: {
    feature: string;
    name: string;
    from: number;
    to: number;
    rank_after: number;
  }[];
  changes: CfChange[];
  blocking: {
    feature: string;
    name: string;
    domain: string;
    user: number;
    required: number;
  }[];
}

export interface TargetResult {
  career: CareerResult; // rank = อันดับใน 910 อาชีพ
  total: number;
  explain: ExplainResult;
  counterfactual: Counterfactual; // เพิ่มทักษะอย่างเดียว
  counterfactual_all: Counterfactual; // ถ้าความชอบและนิสัยตรงด้วย
}

// ---------- สาขาที่จบ ----------
export interface MajorItem {
  id: string;
  faculty: string;
  major_th: string;
}

export interface MajorResult extends MajorItem {
  cip_titles: string[];
  n_linked: number;
  total: number;
  careers: CareerResult[]; // rank = อันดับใน 910 ของผู้ใช้
  in_top5: string[];
  best_rank: number | null;
}

// ---------- รายละเอียดอาชีพ (GET /careers/{code}) ----------
export interface CareerRequirement {
  feature: string;
  domain: string; // grp ri gtask task ws
  name: string;
  required: number; // 0–100
  distinctiveness: number; // สูงกว่าค่าเฉลี่ย 910 อาชีพกี่ SD
  onet_importance: number | null;
}

/** ไม่มีข้อมูลเงินเดือน วุฒิการศึกษา หรือความต้องการตลาด ใน dataset */
export interface CareerDetail {
  code: string;
  title: string;
  title_en?: string;
  description: string | null; // O*NET ภาษาอังกฤษ
  major: string;
  major_name: string | null;
  cluster: number;
  requirements: CareerRequirement[];
  tools: string[];
}

/** GET /careers — รายชื่อ 910 อาชีพ + ข้อมูลสำหรับกรอง */
export interface CareerListItem {
  code: string;
  title: string;
  title_en?: string;
  major?: string;
  cluster?: number;
  riasec?: string[]; // 2 ด้านที่สูงสุด เช่น ["Social", "Investigative"]
}
