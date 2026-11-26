import { useEffect, useRef, useState } from "react";
import type { Answers, Question } from "../api/types";
import {
  SKILL_CATEGORY_LABEL,
  RIASEC_TH,
  WS_TH,
  categoryOf,
  type SkillCategory,
} from "../lib/labels";
import { ProfileRadar } from "./charts";
import { ArrowRight, Check } from "./icons";
import { JumpStage } from "./JumpGame";
import { levelOf, PopChoices, QuestHud, realmOf } from "./QuestParts";
import { btn, cx, Progress } from "./ui";

/*
 * แบบประเมินโหมด "ทีละข้อ" — เปลี่ยนแค่การแสดงผล
 * คำถาม ลำดับข้อ สเกล 1–5 และคำตอบที่ส่งให้โมเดลเหมือนโหมดรายการทุกอย่าง (ไม่แตะ questions.json / สูตรแปลงคะแนน)
 * สรุปท้ายหมวดคำนวณจากคำตอบของผู้ใช้เองเท่านั้น ไม่ได้เรียกโมเดล
 */
export interface Section {
  name: string;
  short: string;
  scale: string[];
  questions: Question[];
}

const PER_CHUNK = 10;
/** ขนาดช่วงย่อยในหมวด: แบ่งเท่า ๆ กัน ไม่เกิน 10 ข้อ (30 ข้อ → 3 ช่วง × 10) */
export const chunkSize = (n: number) => Math.ceil(n / Math.ceil(n / PER_CHUNK));
const chunksIn = (n: number) => Math.ceil(n / chunkSize(n));

/** คำตอบ 1–5 → 0–100 สำหรับวาดกราฟสรุปเท่านั้น */
const toPct = (a: number) => ((a - 1) / 4) * 100;
const keyOf = (feature: string) => feature.split("::")[1] ?? feature;
const shortQ = (q: string) => q.replace(/\s*(ได้ดี)?แค่ไหน$/, "");

type Phase = "q" | "break" | "summary";

export function CardFlow({
  sections,
  idx,
  answers,
  remaining,
  setAnswer,
  goSection,
  quest = false,
  game = false,
}: {
  sections: Section[];
  idx: number;
  answers: Answers;
  remaining: number;
  setAnswer: (feature: string, n: number) => void;
  goSection: (i: number) => void;
  /** โหมดตามหาความฝัน: หน้าตาเส้นทางสู่งานในฝัน + ตอบด้วยแถบเลื่อน (คำถาม/สเกล/คำตอบเหมือนเดิม) */
  quest?: boolean;
  /** โหมดเกมกระโดด (ใช้ร่วมกับ quest): ตอบด้วยการกระโดดชนกล่อง 1–5 */
  game?: boolean;
}) {
  const sec = sections[idx];
  const qs = sec.questions;
  const size = chunkSize(qs.length);
  const firstMissing = qs.findIndex((q) => !answers[q.feature]);
  const [qi, setQi] = useState(
    firstMissing === -1 ? qs.length - 1 : firstMissing,
  );
  const [phase, setPhase] = useState<Phase>(
    firstMissing === -1 ? "summary" : "q",
  );
  const timer = useRef<number | undefined>(undefined);
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // เปลี่ยนข้อ/หน้า → focus หัวข้อ (screen reader อ่านข้อใหม่) โดยไม่เลื่อนจอ
  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
  }, [qi, phase]);

  const q = qs[qi];
  const total = sections.reduce((s, x) => s + x.questions.length, 0);
  const realm = realmOf(qs[0].feature);
  const hud = quest && (
    <QuestHud
      answered={total - remaining}
      total={total}
      current={idx}
      realms={sections.map((x) => ({
        realm: realmOf(x.questions[0].feature),
        done: x.questions.every((y) => answers[y.feature]),
      }))}
    />
  );
  const totalChunks = sections.reduce(
    (s, x) => s + chunksIn(x.questions.length),
    0,
  );
  const chunkOffset = sections
    .slice(0, idx)
    .reduce((s, x) => s + chunksIn(x.questions.length), 0);
  const chunkNow = chunkOffset + Math.floor(qi / size); // ช่วงของข้อปัจจุบัน (0-based)
  const chunkStart = Math.floor(qi / size) * size;
  const chunkQs = qs.slice(chunkStart, chunkStart + size);

  /** ไปต่อหลังตอบข้อ qi — justAnswered = feature ที่เพิ่งตอบ (answers ใน closure ยังไม่อัปเดต) */
  const advance = (justAnswered?: string) => {
    const missing = qs.findIndex(
      (x) => x.feature !== justAnswered && !answers[x.feature],
    );
    if (qi === qs.length - 1) {
      if (missing >= 0) setQi(missing);
      else setPhase("summary");
    } else if ((qi + 1) % size === 0) {
      setQi(qi + 1);
      setPhase("break");
    } else setQi(qi + 1);
  };

  const answer = (n: number, delay = 260) => {
    setAnswer(q.feature, n);
    window.clearTimeout(timer.current);
    // หน่วงสั้น ๆ ให้เห็นว่าเลือกอะไร (โหมดความฝัน: ให้ป๊อบอัพเล่นจบ) แล้วค่อยไปข้อถัดไป
    timer.current = window.setTimeout(() => advance(q.feature), delay);
  };

  const back = () => {
    window.clearTimeout(timer.current);
    if (phase === "break") {
      setPhase("q");
      setQi(qi - 1);
    } else if (phase === "summary") setPhase("q");
    else if (qi > 0) setQi(qi - 1);
    else if (idx > 0) goSection(idx - 1);
  };

  const next = () => {
    if (phase === "break") setPhase("q");
    else if (phase === "summary") goSection(idx + 1);
    else if (answers[q.feature]) advance();
  };

  // คีย์บอร์ด: 1–5 ตอบ · ← ย้อน · → / Enter ไปต่อ
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const t = e.target as HTMLElement;
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      t.closest("input, textarea, select, [contenteditable]")
    )
      return;
    const n = Number(e.key);
    const digit = n >= 1 && n <= 5;
    // โหมดเกม: ลูกศร/Space/WASD ใช้บังคับตัวละคร (JumpStage) ไม่ใช่ย้อน/ถัดไป
    if (game && phase === "q" && !digit && /^(Arrow(Left|Right|Up|Down)| |[wasdWASD])$/.test(e.key)) return;
    if (phase === "q" && digit) {
      e.preventDefault();
      answer(n, quest ? 620 : 260);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    } else if (
      e.key === "ArrowRight" ||
      (e.key === "Enter" &&
        phase !== "q" &&
        t.tagName !== "BUTTON" &&
        t.tagName !== "A")
    ) {
      e.preventDefault();
      next();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const nextLabel =
    idx + 1 < sections.length ? sections[idx + 1].short : "ทบทวนและส่ง";

  if (phase === "break" && quest) {
    const done = chunkNow;
    return (
      <div className="flex flex-col gap-3">
        {hud}
        <div
          key="break"
          className="animate-fade-up rounded-card shadow-card p-6 sm:p-9 flex flex-col gap-6 items-center text-center text-white"
          style={{ background: "linear-gradient(160deg,#0f172a 0%,#1e3a8a 60%,#f97316 140%)" }}
        >
          <span className="text-[64px] leading-none animate-pop motion-reduce:animate-none" aria-hidden="true">
            ☕
          </span>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-amber-300">จุดพักระหว่างทาง</span>
            <h2 ref={headRef} tabIndex={-1} className="m-0 text-[26px] font-bold outline-none">
              ก้าวที่ {levelOf(total - remaining)} แล้ว — งานในฝันใกล้เข้ามาอีกนิด
            </h2>
            <p className="m-0 text-white/80 text-[15px]">
              ผ่านไป {done} จาก {totalChunks} ช่วง · เหลืออีก {remaining} ข้อ — ไม่มีจำกัดเวลา
              พักจิบกาแฟได้ตามสบาย คำตอบบันทึกไว้แล้ว
            </p>
          </div>
          <div className="w-full max-w-[360px] [&_.bg-line]:bg-white/20">
            <ChunkDots total={totalChunks} done={done} />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={back} className={btn.ghostDark}>
              ย้อนกลับ
            </button>
            <button type="button" onClick={next} className={btn.light}>
              เดินทางต่อ ({realm.name}) <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "break") {
    const done = chunkNow; // ช่วงที่ทำเสร็จแล้ว (qi อยู่ที่ข้อแรกของช่วงถัดไป)
    return (
      <div
        key="break"
        className="animate-fade-up bg-white border border-line rounded-card shadow-card p-6 sm:p-9 flex flex-col gap-6 items-center text-center"
      >
        <span
          className="w-14 h-14 rounded-full bg-good-soft text-good flex items-center justify-center"
          aria-hidden="true"
        >
          <Check size={26} />
        </span>
        <div className="flex flex-col gap-2">
          <h2
            ref={headRef}
            tabIndex={-1}
            className="m-0 text-[24px] font-bold outline-none"
          >
            ผ่านไป {done} จาก {totalChunks} ช่วงแล้ว
          </h2>
          <p className="m-0 text-muted text-[15px]">
            เหลืออีก {remaining} ข้อ — ไม่มีจำกัดเวลา พักได้ตามสบาย
            คำตอบบันทึกไว้แล้ว ปิดหน้าแล้วกลับมาทำต่อได้
          </p>
        </div>
        <ChunkDots total={totalChunks} done={done} />
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={back} className={btn.secondary}>
            ย้อนกลับ
          </button>
          <button type="button" onClick={next} className={btn.primary}>
            ทำช่วงถัดไป ({sec.short}) <ArrowRight />
          </button>
        </div>
      </div>
    );
  }

  if (phase === "summary") {
    const card = (
      <div
        key="summary"
        className="animate-fade-up bg-white border border-line rounded-card shadow-card p-6 sm:p-8 flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-good flex items-center gap-1.5">
            {quest ? (
              <>⭐ ผ่าน “{realm.name}” แล้ว — เก็บดาวแห่งความฝันได้ 1 ดวง</>
            ) : (
              <>
                <Check size={16} /> ครบหมวด “{sec.short}” แล้ว
              </>
            )}
          </span>
          <h2
            ref={headRef}
            tabIndex={-1}
            className="m-0 text-[24px] font-bold outline-none"
          >
            {SUMMARY_TITLE[qs[0].feature.split("::")[0]] ?? "สรุปคำตอบของคุณ"}
          </h2>
          <p className="m-0 text-[13px] text-muted leading-relaxed">
            สรุปจากคำตอบของคุณเองในหมวดนี้ ยังไม่ใช่ผลจากโมเดล — โมเดลจะใช้คำตอบทั้ง{" "}
            {sections.reduce((s, x) => s + x.questions.length, 0)} ข้อพร้อมกันตอนส่ง
          </p>
        </div>
        <SectionSummary sec={sec} answers={answers} />
        <div className="flex justify-between items-center gap-3 flex-wrap pt-1">
          <button type="button" onClick={back} className={btn.secondary}>
            แก้คำตอบหมวดนี้
          </button>
          <button type="button" onClick={next} className={btn.primary}>
            {idx + 1 < sections.length
              ? `ไปหมวดถัดไป: ${nextLabel}`
              : "ทบทวนและส่ง"}{" "}
            <ArrowRight />
          </button>
        </div>
        {remaining > 0 && (
          <span className="text-[13px] text-muted text-right">
            เหลืออีก {remaining} ข้อ
          </span>
        )}
      </div>
    );
    return quest ? (
      <div className="flex flex-col gap-3">
        {hud}
        {card}
      </div>
    ) : (
      card
    );
  }

  if (quest) {
    const value = answers[q.feature];
    return (
      <div className="flex flex-col gap-3">
        {hud}
        <div
          key={q.feature}
          className="animate-fade-up rounded-card shadow-card p-6 sm:p-8 flex flex-col gap-6 text-white relative overflow-hidden"
          style={{ background: realm.bg }}
        >
          <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-6 text-[120px] opacity-10 rotate-12">
            {realm.emoji}
          </span>
          <div className="flex flex-col gap-2 relative">
            <span className="text-sm font-semibold flex flex-wrap justify-between gap-2" style={{ color: realm.accent }}>
              <span>
                {realm.emoji} {realm.name} · ช่วง {chunkNow + 1}/{totalChunks}
              </span>
              <span className="text-white/70 font-normal">ข้อ {q.no} จาก {total}</span>
            </span>
            <span className="text-[13px] text-white/70">{realm.flavor}</span>
            <h2
              ref={headRef}
              tabIndex={-1}
              id={`q-${q.no}`}
              className="m-0 mt-1 text-[21px] sm:text-[24px] font-semibold leading-snug outline-none"
            >
              {q.question}
            </h2>
          </div>

          {game ? (
            <JumpStage
              key={q.feature}
              value={value}
              realm={realm}
              scale={sec.scale}
              labelledBy={`q-${q.no}`}
              onChoose={(n) => answer(n, 750)}
            />
          ) : (
            <PopChoices
              key={q.feature}
              value={value}
              realm={realm}
              scale={sec.scale}
              labelledBy={`q-${q.no}`}
              onChoose={(n) => answer(n, 620)}
            />
          )}

          <div className="flex gap-1 relative" aria-hidden="true">
            {chunkQs.map((x) => (
              <span
                key={x.feature}
                className={cx(
                  "h-1.5 flex-1 rounded-full",
                  x.feature === q.feature ? "bg-white" : answers[x.feature] ? "bg-white/60" : "bg-white/20",
                )}
              />
            ))}
          </div>

          <div className="flex justify-between items-center gap-3 flex-wrap relative">
            <button
              type="button"
              onClick={back}
              disabled={idx === 0 && qi === 0}
              className={cx(btn.ghostDark, "disabled:opacity-40")}
            >
              ย้อนกลับ
            </button>
            <span className="hidden sm:inline text-[13px] text-white/70">
              {game ? "กระโดดชนกล่อง แตะกล่อง หรือกดเลข 1–5" : "แตะเลือก หรือกดเลข 1–5 · ← ย้อน · → ถัดไป"}
            </span>
            <button type="button" onClick={next} disabled={!value} className={cx(btn.light, "disabled:opacity-40")}>
              ถัดไป <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const value = answers[q.feature];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3 text-sm text-muted">
        <span>
          ช่วง {chunkNow + 1} จาก {totalChunks}
        </span>
        <span>เหลืออีก {remaining} ข้อ</span>
      </div>
      {/* ความคืบหน้าในช่วงนี้ — ทีละข้อ */}
      <div className="flex gap-1" aria-hidden="true">
        {chunkQs.map((x) => (
          <span
            key={x.feature}
            className={cx(
              "h-1.5 flex-1 rounded-full transition-colors",
              x.feature === q.feature
                ? "bg-primary"
                : answers[x.feature]
                  ? "bg-primary-mid"
                  : "bg-line",
            )}
          />
        ))}
      </div>

      <div
        key={q.feature}
        className="animate-fade-up bg-white border border-line rounded-card shadow-card p-6 sm:p-8 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-primary">
            ข้อ {q.no} จาก {sections.reduce((s, x) => s + x.questions.length, 0)}
          </span>
          <h2
            ref={headRef}
            tabIndex={-1}
            id={`q-${q.no}`}
            className="m-0 text-[21px] sm:text-[24px] font-semibold leading-snug outline-none"
          >
            {q.question}
          </h2>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={`q-${q.no}`}
          className="flex flex-col gap-2.5"
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const on = value === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => answer(n)}
                className={cx(
                  "min-h-14 rounded-control border px-4 flex items-center gap-3.5 text-left text-[16px] transition-[background-color,border-color,transform] active:scale-[0.99]",
                  on
                    ? "bg-primary border-primary text-white shadow-card"
                    : "bg-white border-line-strong text-ink-2 hover:border-primary hover:bg-primary-soft",
                )}
              >
                <span
                  className={cx(
                    "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-semibold text-[15px]",
                    on ? "bg-white/20 text-white" : "bg-page text-ink-2",
                  )}
                  aria-hidden="true"
                >
                  {n}
                </span>
                <span className="font-medium">{sec.scale[n - 1]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={back}
            disabled={idx === 0 && qi === 0}
            className={cx(btn.secondary, "disabled:opacity-40")}
          >
            ย้อนกลับ
          </button>
          <span className="hidden sm:inline text-[13px] text-muted">
            กดเลข 1–5 เพื่อตอบ · ← ย้อน · → ถัดไป
          </span>
          <button
            type="button"
            onClick={next}
            disabled={!value}
            className={cx(btn.ghost, "disabled:opacity-40")}
          >
            ถัดไป <ArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChunkDots({ total, done }: { total: number; done: number }) {
  return (
    <div
      className="flex gap-1.5 w-full max-w-[360px]"
      role="img"
      aria-label={`ทำเสร็จ ${done} จาก ${total} ช่วง`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            "h-2 flex-1 rounded-full",
            i < done ? "bg-good" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}

const SUMMARY_TITLE: Record<string, string> = {
  grp: "จุดแข็งของคุณตอนนี้",
  ri: "สไตล์ความสนใจของคุณ",
  gtask: "งานแบบที่คุณชอบ",
  task: "งานแบบที่คุณชอบ",
  ws: "นิสัยการทำงานของคุณ",
};

/** 3 ข้อที่ให้คะแนนสูงสุด (เท่ากันเรียงตามเลขข้อ) */
function TopList({
  sec,
  answers,
  label,
}: {
  sec: Section;
  answers: Answers;
  label: string;
}) {
  const top = sec.questions
    .filter((q) => answers[q.feature])
    .sort((a, b) => answers[b.feature] - answers[a.feature] || a.no - b.no)
    .slice(0, 3);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {top.map((q, i) => (
          <li
            key={q.feature}
            className="flex items-center gap-3 bg-page rounded-control px-3.5 py-3"
          >
            <span className="w-7 h-7 shrink-0 rounded-full bg-primary text-white text-[13px] font-semibold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="flex-1 min-w-0 text-[15px] leading-snug">
              {shortQ(q.question)}
            </span>
            <span className="shrink-0 text-sm text-primary font-semibold">
              {sec.scale[answers[q.feature] - 1]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionSummary({ sec, answers }: { sec: Section; answers: Answers }) {
  const prefix = sec.questions[0].feature.split("::")[0];
  const answered = sec.questions.filter((q) => answers[q.feature]);

  if (prefix === "ri" || prefix === "ws") {
    const names = prefix === "ri" ? RIASEC_TH : WS_TH;
    const items = answered.map((q) => ({
      name: names[keyOf(q.feature)] ?? keyOf(q.feature),
      value: toPct(answers[q.feature]),
    }));
    const max = Math.max(...items.map((i) => i.value));
    const tops = items.filter((i) => i.value === max).map((i) => i.name);
    return (
      <div className="flex flex-col gap-2">
        <ProfileRadar items={items} height={prefix === "ri" ? 320 : 360} />
        <p className="m-0 text-[15px] text-center leading-relaxed">
          {tops.length === items.length ? (
            "คุณให้คะแนนเท่ากันทุกด้าน"
          ) : (
            <>
              {prefix === "ri" ? "คุณสนใจงานด้าน" : "จุดเด่นของคุณ:"}{" "}
              <b className="text-primary">{tops.slice(0, 3).join(" · ")}</b>
              {prefix === "ri" ? " มากที่สุด" : ""}
            </>
          )}
        </p>
      </div>
    );
  }

  if (prefix === "grp") {
    // ค่าเฉลี่ยตามหมวดทักษะเดียวกับ Skill Gap/Dashboard (labels.ts) — สรุปให้ดูเท่านั้น โมเดลใช้คำตอบทีละข้อ
    const cats = (Object.keys(SKILL_CATEGORY_LABEL) as SkillCategory[]).map(
      (c) => {
        const xs = answered.filter((q) => categoryOf(q.feature) === c);
        return {
          c,
          n: xs.length,
          avg: xs.length
            ? xs.reduce((s, q) => s + toPct(answers[q.feature]), 0) / xs.length
            : 0,
        };
      },
    );
    return (
      <div className="flex flex-col gap-5">
        <TopList sec={sec} answers={answers} label="ทักษะที่คุณให้คะแนนตัวเองสูงสุด" />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-muted">
              ภาพรวม {cats.length} หมวดทักษะ
            </span>
            <span className="text-[12px] text-muted leading-snug">
              แต่ละหมวดมีหลายข้อ จึงสรุปเป็นคำตอบเฉลี่ยของข้อในหมวด — ใช้ดูภาพรวมเท่านั้น
              โมเดลใช้คำตอบทีละข้อ ไม่ได้ใช้ค่าเฉลี่ยนี้
            </span>
          </div>
          {cats.map(({ c, n, avg }) => (
            <div key={c} className="flex flex-col gap-1.5">
              <span className="flex justify-between gap-3 text-sm">
                <span>
                  {SKILL_CATEGORY_LABEL[c]}{" "}
                  <span className="text-muted text-[12px]">· {n} ข้อ</span>
                </span>
                <span className="text-muted shrink-0">
                  {n ? `เฉลี่ย ${(avg / 25 + 1).toFixed(1)} / 5` : "ยังไม่ได้ตอบ"}
                </span>
              </span>
              <Progress value={avg} label={SKILL_CATEGORY_LABEL[c]} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <TopList sec={sec} answers={answers} label="งานที่คุณชอบมากที่สุด" />;
}
