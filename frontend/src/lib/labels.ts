import questionsJson from "../data/questions.json";

/** ชื่อกลุ่มอาชีพ SOC 2018 major group (②b kNN จำแนก 22 กลุ่ม) */
export const SOC_MAJOR: Record<string, string> = {
  "11": "บริหารจัดการ",
  "13": "ธุรกิจและการเงิน",
  "15": "คอมพิวเตอร์และคณิตศาสตร์",
  "17": "สถาปัตยกรรมและวิศวกรรม",
  "19": "วิทยาศาสตร์ชีวภาพ กายภาพ และสังคม",
  "21": "บริการชุมชนและสังคม",
  "23": "กฎหมาย",
  "25": "การศึกษาและห้องสมุด",
  "27": "ศิลปะ ออกแบบ บันเทิง สื่อ",
  "29": "บุคลากรการแพทย์",
  "31": "สนับสนุนการแพทย์",
  "33": "บริการด้านความปลอดภัย",
  "35": "อาหารและเครื่องดื่ม",
  "37": "ดูแลอาคารและพื้นที่",
  "39": "บริการส่วนบุคคล",
  "41": "งานขาย",
  "43": "งานสำนักงานและธุรการ",
  "45": "เกษตร ประมง ป่าไม้",
  "47": "ก่อสร้างและขุดเจาะ",
  "49": "ติดตั้ง ซ่อมบำรุง",
  "51": "การผลิต",
  "53": "ขนส่งและขนย้าย",
};

export const majorOf = (code: string) => code.slice(0, 2);
export const majorName = (code: string) =>
  SOC_MAJOR[majorOf(code)] ?? `กลุ่ม ${majorOf(code)}`;

/** แบ่ง 30 กลุ่มทักษะ (grp::) เป็น 6 หมวด ใช้เป็นตัวกรองใน Dashboard / Skill Gap และสรุปในแบบประเมิน
 *  (จัดเองเพื่อให้หาง่าย — ไม่ได้มาจากโมเดลหรือ O*NET และโมเดลไม่ได้ใช้) */
export type SkillCategory = "think" | "scitech" | "people" | "business" | "culture" | "body";
export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  think: "การคิดและตัวเลข",
  scitech: "วิทยาศาสตร์และเทคโนโลยี",
  people: "คนและการสื่อสาร",
  business: "ธุรกิจ กฎหมาย และบริการ",
  culture: "ภาษา ศิลปะ และสังคม",
  body: "ร่างกายและประสาทสัมผัส",
};
const CAT: Record<string, SkillCategory> = {
  // การคิดและตัวเลข (4)
  numbers: "think",
  reasoning: "think",
  pattern_finding: "think",
  focus_speed: "think",
  // วิทยาศาสตร์และเทคโนโลยี (6)
  computers: "scitech",
  engineering: "scitech",
  physical_science: "scitech",
  bio_medical: "scitech",
  food: "scitech",
  visualization: "scitech",
  // คนและการสื่อสาร (3)
  communication: "people",
  teaching: "people",
  people_society: "people",
  // ธุรกิจ กฎหมาย และบริการ (5)
  management: "business",
  business: "business",
  admin_service: "business",
  law: "business",
  safety_transport: "business",
  // ภาษา ศิลปะ และสังคม (4)
  media_language: "culture",
  foreign_language: "culture",
  arts: "culture",
  geo_history: "culture",
  // ร่างกายและประสาทสัมผัส (8)
  near_vision: "body",
  field_vision: "body",
  far_multitask: "body",
  hearing: "body",
  hand_dexterity: "body",
  machine_control: "body",
  physical: "body",
  flexibility: "body",
};
export const categoryOf = (feature: string): SkillCategory =>
  CAT[feature.split("::")[1]] ?? "think";

/** จำนวนข้อของแบบประเมิน (รอบที่ 4: 76 ข้อ) — ใช้ในข้อความแทนการพิมพ์ตัวเลขตายตัว */
export const QUESTION_COUNT = questionsJson.length;

/** หมวดของแบบประเมิน (ตามคอลัมน์ section ใน question_bank_general.csv) */
export const SECTION_META: Record<string, { short: string; scale: string[] }> =
  {
    "1. ทักษะและความรู้": {
      short: "ทักษะและความรู้",
      scale: ["ไม่มีเลย", "พื้นฐาน", "ใช้งานได้", "คล่อง", "เชี่ยวชาญ"],
    },
    "2. ความสนใจ (RIASEC)": {
      short: "ความสนใจ (RIASEC)",
      scale: ["ไม่ชอบเลย", "ไม่ค่อยชอบ", "เฉย ๆ", "ชอบ", "ชอบมาก"],
    },
    "3. ลักษณะงานที่ชอบ": {
      short: "ลักษณะงานที่ชอบ",
      scale: ["ไม่ชอบเลย", "ไม่ค่อยชอบ", "เฉย ๆ", "ชอบ", "ชอบมาก"],
    },
    "4. นิสัยในการทำงาน": {
      short: "นิสัยในการทำงาน",
      scale: ["ไม่ตรงกับฉันเลย", "ไม่ค่อยตรง", "ตรงบ้าง", "ค่อนข้างตรง", "ตรงกับฉันมาก"],
    },
  };

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

/** คำถามของแต่ละ feature (ตัด "แค่ไหน" ท้ายประโยคให้สั้นลง) */
const QUESTION_OF: Record<string, string> = Object.fromEntries(
  questionsJson.map((q) => [
    q.feature,
    q.question.replace(/\s*(ได้ดี)?แค่ไหน$/, ""),
  ]),
);
export const questionOf = (feature: string, fallback = feature) =>
  QUESTION_OF[feature] ?? fallback;

/** หมวดคำถามตาม prefix ของ feature (ตรงกับหัวข้อในแบบประเมิน) */
export const DOMAIN_LABEL: Record<string, string> = {
  grp: "ทักษะและความรู้",
  ri: "ความสนใจ (RIASEC)",
  gtask: "ลักษณะงานที่ชอบ",
  task: "ลักษณะงานที่ชอบ", // คำถามงานเทคโนโลยี 12 ข้ออยู่ในหมวด 3 ด้วย
  ws: "นิสัยในการทำงาน",
};

/** คะแนน 0–100 → คำตอบ 1–5 */
export const toAnswer = (v: number) => Math.round(v / 25) + 1;

/** ความสนใจ 6 ด้าน (RIASEC) — คำอธิบายสั้นภาษาไทย */
export const RIASEC_TH: Record<string, string> = {
  Realistic: "ลงมือทำ ใช้มือและเครื่องมือ",
  Investigative: "ค้นคว้า วิเคราะห์",
  Artistic: "สร้างสรรค์ ศิลปะ",
  Social: "ช่วยเหลือ ดูแลผู้คน",
  Enterprising: "โน้มน้าว บริหาร ค้าขาย",
  Conventional: "ระเบียบ ขั้นตอนชัดเจน",
};

/** นิสัยในการทำงาน 10 ข้อ (ws::) — ชื่อสั้นสำหรับแกนกราฟในแบบประเมินเท่านั้น (ไม่ใช่ข้อความคำถาม) */
export const WS_TH: Record<string, string> = {
  "Social Orientation": "ชอบทำงานกับคน",
  Empathy: "เข้าใจผู้อื่น",
  "Leadership Orientation": "ภาวะผู้นำ",
  Innovation: "คิดสิ่งใหม่",
  "Intellectual Curiosity": "ใฝ่รู้",
  Cautiousness: "รอบคอบ",
  "Tolerance for Ambiguity": "รับความไม่ชัดเจน",
  "Stress Tolerance": "ทนแรงกดดัน",
  Adaptability: "ปรับตัวเร็ว",
  Cooperation: "ทำงานเป็นทีม",
};

/** ชื่อคลัสเตอร์ ③ K-Means (8 กลุ่ม) — ตั้งจากอาชีพส่วนใหญ่ในแต่ละคลัสเตอร์ของโมเดลรอบ 4 (output/general)
 *  ไม่ได้มาจากโมเดล: ถ้าเทรน K-Means ใหม่ เลขคลัสเตอร์อาจสลับ ต้องตรวจชื่อใหม่ทั้งหมด */
export const CLUSTER_NAME: Record<number, string> = {
  0: "ธุรกิจ การเงิน และงานสำนักงาน",
  1: "วิศวกรรม วิทยาศาสตร์ และเทคโนโลยี",
  2: "การขนส่ง การบิน และงานเทคนิคภาคสนาม",
  3: "การแพทย์และสุขภาพ",
  4: "การศึกษาและบริการสังคม",
  5: "งานบริการ อาหาร และการต้อนรับ",
  6: "งานช่าง การผลิต และการก่อสร้าง",
  7: "ศิลปะ สื่อ และการออกแบบ",
};
export const clusterName = (k: number | null | undefined) => (k == null ? "" : CLUSTER_NAME[k] ?? `กลุ่มที่ ${k + 1}`);
