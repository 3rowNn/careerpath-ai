import sample from "../data/sample_result.json";
import thaiTitles from "../data/thai_titles.json";
import type {
  Answers,
  CareerDetail,
  CareerListItem,
  ChatMessage,
  ExplainResult,
  MajorItem,
  MajorResult,
  RecommendResult,
  SimilarCareer,
  SkillGapResult,
  TargetResult,
  UserVector,
} from "./types";

/**
 * API layer
 * - ไม่ได้ตั้ง VITE_API_URL → โหมดตัวอย่าง: คืนผลโมเดลจริงที่รันไว้กับ "ผู้ใช้ตัวอย่าง" (src/data/sample_result.json)
 *   ผลจึงไม่เปลี่ยนตามคำตอบที่กรอก
 * - ตั้ง VITE_API_URL=/api → เรียก FastAPI ที่ห่อ predict.py (สัญญา endpoint อยู่ด้านล่าง)
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? "";
export const IS_DEMO = API_URL === "";

type Sample = {
  answers: Answers;
  recommend: RecommendResult;
  skill_gaps: Record<string, SkillGapResult>;
  similar: Record<string, SimilarCareer[]>;
  explain: Record<string, ExplainResult>;
};
/**
 * ชื่ออาชีพภาษาไทย (datasets/onet_thai/onet_thai_titles.csv — แปลโดย Claude)
 * แปลงที่ชั้นนี้ชั้นเดียว: ทุก object ที่มี code + title จะได้ title = ชื่อไทย และ title_en = ชื่อ O*NET
 */
const TH = thaiTitles as Record<string, string>;
export const thaiTitle = (code: string, en: string) => TH[code] ?? en;
export function localize<T>(v: T): T {
  if (Array.isArray(v)) return v.map(localize) as T;
  if (v && typeof v === "object") {
    const o = Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, localize(x)]),
    ) as Record<string, unknown>;
    if (
      typeof o.code === "string" &&
      typeof o.title === "string" &&
      TH[o.code] &&
      o.title_en === undefined
    ) {
      o.title_en = o.title;
      o.title = TH[o.code];
    }
    return o as T;
  }
  return v;
}

const SAMPLE = localize(sample as unknown as Sample);

export const SAMPLE_ANSWERS: Answers = SAMPLE.answers;
export const SAMPLE_RECOMMEND: RecommendResult = SAMPLE.recommend;

/** แปลงคำตอบ 1–5 เป็นคะแนน 0–100 ตาม question_bank_short.csv: (คำตอบ − 1) ÷ 4 × 100 */
export function toUserVector(answers: Answers): UserVector {
  const v: UserVector = {};
  for (const [f, a] of Object.entries(answers)) v[f] = ((a - 1) / 4) * 100;
  return v;
}

const delay = <T>(value: T, ms = 350) =>
  new Promise<T>((r) => setTimeout(() => r(value), ms));

async function post<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return localize((await res.json()) as T);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return localize((await res.json()) as T);
}

/** POST /recommend  { user: {feature: 0–100}, k } → CareerPredictor.recommend() */
export function recommend(answers: Answers, k = 5): Promise<RecommendResult> {
  if (IS_DEMO) return delay(SAMPLE.recommend, 700);
  return post("/recommend", { user: toUserVector(answers), k });
}

/** POST /skill-gap  { user, code, k } → CareerPredictor.skill_gap() */
export function skillGap(
  answers: Answers,
  code: string,
  k = 10,
): Promise<SkillGapResult> {
  if (IS_DEMO) {
    const g = SAMPLE.skill_gaps[code];
    return g
      ? delay(g)
      : Promise.reject(new Error(`ไม่มีข้อมูลตัวอย่างของอาชีพ ${code}`));
  }
  return post("/skill-gap", { user: toUserVector(answers), code, k });
}

/** POST /explain  { user, code, k } → CareerPredictor.explain() — ทำไมอาชีพนี้ขึ้นมา (รายคำถาม) */
export function explainCareer(
  answers: Answers,
  code: string,
  k = 5,
): Promise<ExplainResult> {
  if (IS_DEMO) {
    const e = SAMPLE.explain[code];
    return e
      ? delay(e)
      : Promise.reject(new Error(`ไม่มีข้อมูลตัวอย่างของอาชีพ ${code}`));
  }
  return post("/explain", { user: toUserVector(answers), code, k });
}

/** GET /careers/{code} — ข้อมูลอาชีพจากไฟล์ของโมเดล (โหมดตัวอย่างไม่มีข้อมูลนี้) */
export function careerDetail(code: string): Promise<CareerDetail> {
  if (IS_DEMO)
    return Promise.reject(
      new Error("รายละเอียดอาชีพต้องเชื่อมต่อ backend (ตั้ง VITE_API_URL)"),
    );
  return get(`/careers/${encodeURIComponent(code)}`);
}

/** GET /careers/{code}/similar → CareerPredictor.similar_careers() */
export function similarCareers(code: string): Promise<SimilarCareer[]> {
  if (IS_DEMO) return delay(SAMPLE.similar[code] ?? []);
  return get(`/careers/${encodeURIComponent(code)}/similar`);
}

export interface AdvisorReply {
  text: string;
  sources: string[]; // เครื่องมือ (ผลจาก ML / คลังอาชีพ) ที่ AI ดึงมาใช้ตอบ
  live: boolean; // true = ตอบโดย LLM จริง · false = คำตอบสรุปจากผล ML โดยตรง (ไม่มี backend / ยังไม่ตั้ง key)
}

/**
 * POST /advisor/chat  { message, history, user, target_code } → { reply, tools_used, model }
 * LLM (Gemini) เรียกเครื่องมือที่ห่อ predict.py แบบอ่านอย่างเดียว แล้วเรียบเรียงคำตอบ — ไม่คำนวณผลใหม่
 * backend ไม่ได้ตั้ง GEMINI_API_KEY (503 + detail "GEMINI_API_KEY") หรือโหมดตัวอย่าง → ตอบจากผล ML โดยตรงแบบสั้น ๆ
 */
export async function advisorReply(
  history: ChatMessage[],
  message: string,
  ctx: {
    answers: Answers | null;
    targetCode: string | null;
    result: RecommendResult | null;
    gap: SkillGapResult | null;
  },
): Promise<AdvisorReply> {
  const fallback = (): AdvisorReply => ({
    text: demoReply(message, ctx),
    sources: [],
    live: false,
  });
  if (IS_DEMO) return delay(fallback(), 600);
  const res = await fetch(`${API_URL}/advisor/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history: history.map(({ role, text }) => ({ role, text })),
      user: ctx.answers ? toUserVector(ctx.answers) : null,
      target_code: ctx.targetCode,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    reply?: string;
    tools_used?: string[];
    detail?: string;
  };
  if (res.status === 503 && body.detail?.includes("GEMINI_API_KEY"))
    return fallback();
  if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
  return { text: body.reply ?? "", sources: body.tools_used ?? [], live: true };
}

function demoReply(
  message: string,
  {
    result,
    gap,
  }: { result: RecommendResult | null; gap: SkillGapResult | null },
): string {
  const note = "\n\n(ยังไม่ได้เชื่อม LLM — คำตอบนี้สรุปจากผลโมเดล ML โดยตรง)";
  if (!result)
    return (
      "ยังไม่มีผลประเมิน ลองทำแบบประเมินก่อน แล้ว AI จะใช้ผลนั้นเป็นบริบทในการตอบ" + note
    );
  const top = result.careers[0];
  const pri = gap?.top_priorities.slice(0, 3) ?? [];
  const strong =
    gap?.all
      .filter((r) => r.gap === 0)
      .sort((a, b) => b.required - a.required)
      .slice(0, 3) ?? [];
  const m = message.toLowerCase();
  if (m.includes("จุดแข็ง") && strong.length)
    return (
      `จุดแข็งของคุณเทียบกับ ${gap!.title} คือ ${strong.map((s) => s.name).join(", ")} — ทักษะเหล่านี้คุณอยู่ในระดับเท่ากับหรือสูงกว่าที่อาชีพต้องการแล้ว` +
      note
    );
  if ((m.includes("ทำไม") || m.includes("เพราะ")) && gap)
    return (
      `${top.title} ได้อันดับ 1 เพราะโปรไฟล์ของคุณคล้ายกับอาชีพนี้มาก (Cosine Matching ${(top.matching_similarity * 100).toFixed(0)}%) ` +
      `และโมเดลจำแนก MLP ให้ความน่าจะเป็นสูงในกลุ่ม Top 5 ทักษะครอบคลุม ${top.skill_coverage_percent}% ของที่อาชีพต้องการ` +
      note
    );
  if (pri.length)
    return (
      `สำหรับ ${gap!.title} ทักษะที่ควรพัฒนาก่อน (เรียงตาม Skill Priority) คือ\n` +
      pri
        .map(
          (p, i) =>
            `${i + 1}. ${p.name} — ตอนนี้ ${p.user.toFixed(0)} ต้องการ ${p.required.toFixed(0)}`,
        )
        .join("\n") +
      (gap!.tools_used.length
        ? `\n\nเครื่องมือที่อาชีพนี้ใช้บ่อย: ${gap!.tools_used.slice(0, 6).join(", ")}`
        : "") +
      note
    );
  return (
    `อาชีพที่โมเดลแนะนำอันดับ 1 คือ ${top.title} (ทักษะครอบคลุม ${top.skill_coverage_percent}%)` +
    note
  );
}

/** GET /careers → รายชื่อ 910 อาชีพ (ให้ผู้ใช้จริงเลือกอาชีพที่ทำอยู่) */
export function listCareers(): Promise<CareerListItem[]> {
  return get("/careers");
}

export interface RealUserLabel {
  answers: Answers;
  code: string;
  years_in_role: "<1" | "1-3" | "3-5" | "5+" | null;
  consent: true;
}

/** POST /labels → บันทึกเป็นข้อมูลผู้ใช้จริง (ไม่บังคับ ไม่เก็บชื่อ/อีเมล) ใช้ประเมินโมเดลชั้นที่ 4 */
export function submitLabel(
  label: RealUserLabel,
): Promise<{ saved: boolean; total: number }> {
  return post("/labels", label);
}

/** POST /target → อาชีพที่ผู้ใช้อยากเป็น: อันดับใน 910 + เหตุผล + counterfactual (ต้องมี backend) */
export function targetCareer(
  answers: Answers,
  code: string,
): Promise<TargetResult> {
  if (IS_DEMO)
    return Promise.reject(
      new Error("โหมดตัวอย่างไม่ได้เชื่อม backend จึงวิเคราะห์อาชีพที่เลือกเองไม่ได้"),
    );
  return post("/target", { user: toUserVector(answers), code });
}

/** GET /majors → รายชื่อสาขาไทย (ต้องมี backend) */
export function listMajors(): Promise<MajorItem[]> {
  return get("/majors");
}

/** POST /major → อาชีพที่สาขานี้เกี่ยวข้อง (CIP–SOC) เรียงตามความเข้ากับผู้ใช้ด้วย Ensemble */
export function majorView(
  answers: Answers,
  major: string,
  k = 10,
): Promise<MajorResult> {
  return post("/major", { user: toUserVector(answers), major, k });
}
