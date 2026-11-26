import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createAssessment } from "../api/account";
import { IS_DEMO, recommend, SAMPLE_ANSWERS, submitLabel } from "../api/client";
import type { Question } from "../api/types";
import { ArrowRight, Check } from "../components/icons";
import { Main } from "../components/Layout";
import {
  draftReady,
  EMPTY_DRAFT,
  RealUserCard,
} from "../components/RealUserCard";
import { CardFlow } from "../components/AssessmentCards";
import {
  Badge,
  btn,
  Card,
  cx,
  ErrorState,
  Progress,
  SectionTitle,
} from "../components/ui";
import questionsJson from "../data/questions.json";
import { SECTION_META } from "../lib/labels";
import { useApp } from "../lib/store";

/* คำถาม 76 ข้อ สเกล 1–5 และสูตรแปลงคะแนน ห้ามเปลี่ยน — โมเดลเทรนกับชุดนี้ (ดู docs/UI_PROMPTS.md P00) */
const QUESTIONS = questionsJson as Question[];
const SECTIONS = [...new Set(QUESTIONS.map((q) => q.section))].map((name) => ({
  name,
  ...(SECTION_META[name] ?? { short: name, scale: ["1", "2", "3", "4", "5"] }),
  questions: QUESTIONS.filter((q) => q.section === name),
}));
const VIEW_KEY = "careerpath.assessmentView";
const REVIEW = SECTIONS.length; // ขั้นสุดท้าย: ทบทวนก่อนส่ง
const STEPS = [...SECTIONS.map((s) => s.short), "ทบทวนและส่ง"];

/** คำถามแบบสั้น (ตัด "แค่ไหน" ท้ายประโยค) สำหรับหน้าทบทวน */
const short = (q: string) => q.replace(/\s*(ได้ดี)?แค่ไหน$/, "");

/** ปุ่มตอบ 1–5 + คำกำกับปลายสเกล · กดเลข 1–5 บนคีย์บอร์ดขณะ focus ที่ข้อได้ */
function QuestionCard({
  q,
  scale,
  value,
  onAnswer,
  onKeyAnswer,
}: {
  q: Question;
  scale: string[];
  value?: number;
  onAnswer: (n: number) => void;
  onKeyAnswer: (n: number) => void;
}) {
  const onKey = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 5 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      onKeyAnswer(n);
    }
  };
  return (
    <fieldset
      data-q={q.feature}
      tabIndex={0}
      onKeyDown={onKey}
      className={cx(
        "m-0 bg-white border border-line rounded-card shadow-card px-5 sm:px-6 py-5 flex flex-wrap justify-between items-center gap-4 transition-colors focus-visible:border-primary",
      )}
    >
      <legend className="sr-only">
        ข้อ {q.no}: {q.question} (กดเลข 1–5 เพื่อตอบ)
      </legend>
      <div className="flex gap-3 flex-[1_1_300px] min-w-0">
        <span
          className={cx(
            "w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[13px] font-semibold",
            value ? "bg-good-soft text-good" : "bg-page text-muted",
          )}
          aria-hidden="true"
        >
          {value ? <Check size={14} /> : q.no}
        </span>
        <span
          className="font-medium text-[16px] leading-relaxed"
          aria-hidden="true"
        >
          {q.question}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
        <div className="grid grid-cols-5 gap-2 sm:flex">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = value === n;
            return (
              <button
                key={n}
                type="button"
                tabIndex={-1}
                aria-pressed={on}
                aria-label={`${n} = ${scale[n - 1]}`}
                title={scale[n - 1]}
                onClick={() => onAnswer(n)}
                className={cx(
                  "h-12 sm:w-12 rounded-control font-semibold text-base border transition-[background-color,border-color,transform] active:scale-95",
                  on
                    ? "bg-primary border-primary text-white shadow-card"
                    : "bg-white border-line-strong text-ink-2 hover:border-primary hover:bg-primary-soft",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div
          className="flex justify-between text-[11px] text-muted gap-2"
          aria-hidden="true"
        >
          <span>{scale[0]}</span>
          <span>{scale[4]}</span>
        </div>
      </div>
    </fieldset>
  );
}

export default function Assessment() {
  const { answers, setAnswer, setAnswers, saveResult, token } = useApp();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const idx = Math.min(Math.max(Number(params.get("s") ?? 0) || 0, 0), REVIEW);
  const isReview = idx === REVIEW;
  const sec = SECTIONS[Math.min(idx, SECTIONS.length - 1)];
  const listRef = useRef<HTMLElement>(null);
  const goTo = (i: number) => {
    setParams(i ? { s: String(i) } : {});
    window.scrollTo({ top: 0 });
  };

  const answered = useMemo(
    () => QUESTIONS.filter((q) => answers[q.feature]).length,
    [answers],
  );
  const doneIn = (s: (typeof SECTIONS)[number]) =>
    s.questions.filter((q) => answers[q.feature]).length;
  const firstMissing = QUESTIONS.find((q) => !answers[q.feature]);
  const missingSection = firstMissing
    ? SECTIONS.findIndex((s) => s.name === firstMissing.section)
    : -1;
  const secDone = !isReview && doneIn(sec) === sec.questions.length;

  // กลับมาทำต่อ: มีคำตอบค้างอยู่ แต่เปิดมาที่หมวดแรกซึ่งครบแล้ว
  const [dismissResume, setDismissResume] = useState(false);
  const showResume =
    !dismissResume &&
    idx === 0 &&
    answered > 0 &&
    firstMissing &&
    missingSection > 0;

  // ทีละข้อ (ค่าเริ่มต้น) หรือรายการทั้งหมวด — จำไว้ในเบราว์เซอร์นี้ · เปลี่ยนแค่การแสดงผล คำถาม/สเกล/คำตอบเหมือนกัน
  // ตามหาความฝัน (ค่าเริ่มต้น) · ทีละข้อแบบปกติ · รายการทั้งหมวด — เปลี่ยนแค่หน้าตา
  // โหมด "ทีละข้อ" แบบธรรมดาเอาออกแล้ว — ค่าเก่า "cards" ที่จำไว้จะกลายเป็น "quest"
  const [view, setViewState] = useState<"quest" | "game" | "list">(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === "list" || v === "game" ? v : "quest";
    } catch {
      return "quest";
    }
  });
  const setView = (v: "quest" | "game" | "list") => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [confirmReset, setConfirmReset] = useState(false);
  const resetAll = () => {
    setAnswers({});
    setDraft(EMPTY_DRAFT);
    setConfirmReset(false);
    goTo(0);
  };

  /** ตอบด้วยคีย์บอร์ด แล้วเลื่อน focus ไปข้อถัดไปในหมวด */
  const keyAnswer = (q: Question, n: number) => {
    setAnswer(q.feature, n);
    const i = sec.questions.findIndex((x) => x.feature === q.feature);
    const next = sec.questions[i + 1];
    if (next) {
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-q="${CSS.escape(next.feature)}"]`,
      );
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      // เข้าสู่ระบบแล้ว: backend คำนวณและบันทึกผลในบัญชี · ยังไม่เข้า: คำนวณอย่างเดียว เก็บในเบราว์เซอร์
      const r = token
        ? (await createAssessment(token, answers)).result
        : await recommend(answers);
      if (!IS_DEMO && draftReady(draft)) {
        // ข้อมูลผู้ใช้จริงเป็นของเสริม — ส่งไม่สำเร็จก็ไม่ขวางผลลัพธ์
        await submitLabel({
          answers,
          code: draft.code!,
          years_in_role: draft.years,
          consent: true,
        }).catch((e) => console.warn("บันทึกข้อมูลผู้ใช้จริงไม่สำเร็จ", e));
      }
      return r;
    },
    onSuccess: (r) => {
      saveResult(r, answers);
      nav("/careers");
    },
  });

  return (
    <Main className="gap-7">
      {/* ---------- หัว + ความคืบหน้า ---------- */}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-primary">
              ขั้นที่ {idx + 1} จาก {STEPS.length}
            </span>
            <h1 className="m-0 text-[28px] sm:text-[32px] font-bold">
              {STEPS[idx]}
            </h1>
          </div>
          <span className="text-[15px] text-muted">
            ตอบแล้ว {answered} / {QUESTIONS.length} ข้อ (
            {Math.round((answered / QUESTIONS.length) * 100)}%)
          </span>
        </div>
        <Progress
          value={(answered / QUESTIONS.length) * 100}
          label="ความคืบหน้าแบบประเมิน"
        />
      </div>

      {showResume && (
        <div className="bg-primary-soft border border-primary-line rounded-card px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px]">
            คุณตอบไว้แล้ว <b>{answered}</b> ข้อ — ทำต่อจากข้อ {firstMissing!.no} (
            {SECTIONS[missingSection].short}) ได้เลย
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setDismissResume(true)}
              className={cx(btn.ghost, "min-h-11 text-sm")}
            >
              ไม่เป็นไร
            </button>
            <button
              type="button"
              onClick={() => goTo(missingSection)}
              className={cx(btn.primary, "min-h-11")}
            >
              ทำต่อจากเดิม <ArrowRight />
            </button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-6 items-start">
        {/* ---------- ขั้นตอน ---------- */}
        <aside className="flex-[1_1_240px] bg-white border border-line rounded-card shadow-card p-3 flex flex-col gap-1 lg:sticky lg:top-24">
          <nav aria-label="ขั้นตอนแบบประเมิน" className="flex flex-col gap-1">
            {STEPS.map((label, i) => {
              const on = i === idx;
              const s = SECTIONS[i];
              const d = s ? doneIn(s) : answered;
              const total = s ? s.questions.length : QUESTIONS.length;
              const full = d === total;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={on ? "step" : undefined}
                  className={cx(
                    "px-3.5 py-3 rounded-control flex justify-between items-center gap-3 border-0 text-left text-[15px]",
                    on
                      ? "bg-primary-soft text-primary font-semibold"
                      : "bg-transparent text-ink-2 hover:bg-page",
                  )}
                >
                  <span>
                    {i + 1}. {label}
                  </span>
                  {s ? (
                    <span
                      className={cx(
                        "text-[13px] shrink-0",
                        full
                          ? "text-good font-semibold"
                          : on
                            ? "text-primary"
                            : "text-muted",
                      )}
                    >
                      {full ? "ครบ" : `${d}/${total}`}
                    </span>
                  ) : (
                    <ArrowRight size={16} />
                  )}
                </button>
              );
            })}
          </nav>
          <div className="mt-2 p-3.5 border-t border-line text-sm text-muted leading-relaxed">
            ไม่มีคำตอบถูกหรือผิด ตอบตามที่เป็นจริง · คำตอบบันทึกอัตโนมัติ ปิดหน้าแล้วกลับมาทำต่อได้
            <br />
            <span className="text-[13px]">
              {view === "list"
                ? "เคล็ดลับ: คลิกที่ข้อ แล้วกดเลข 1–5 บนคีย์บอร์ด"
                : view === "game"
                  ? "เคล็ดลับ: ← → เดิน · Space กระโดด · หรือกดเลข 1–5 ตอบได้เลย"
                  : "เคล็ดลับ: กดเลข 1–5 บนคีย์บอร์ดเพื่อตอบ · ← ย้อนกลับ"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAnswers(SAMPLE_ANSWERS)}
            className="mx-2 mb-2 min-h-11 rounded-control border border-dashed border-line-strong bg-white text-sm text-ink-2 hover:border-primary"
          >
            กรอกด้วยคำตอบผู้ใช้ตัวอย่าง
          </button>
          {answered > 0 &&
            (confirmReset ? (
              <div
                role="alertdialog"
                aria-labelledby="reset-title"
                className="mx-2 mb-2 p-3 rounded-control bg-warn-soft flex flex-col gap-2.5"
              >
                <span
                  id="reset-title"
                  className="text-sm font-semibold text-warn-ink"
                >
                  ล้างคำตอบทั้ง {answered} ข้อ แล้วเริ่มใหม่?
                </span>
                <span className="text-[13px] text-warn-ink leading-relaxed">
                  ผลประเมินครั้งก่อนยังอยู่ จนกว่าจะส่งแบบประเมินครั้งใหม่
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetAll}
                    className="flex-1 min-h-10 rounded-lg bg-warn text-white text-sm font-semibold border-0"
                  >
                    ล้างคำตอบ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 min-h-10 rounded-lg bg-white border border-line-strong text-sm text-ink-2"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="mx-2 mb-2 min-h-11 rounded-control border border-line-strong bg-white text-sm text-ink-2 hover:border-warn hover:text-warn-ink"
              >
                ล้างคำตอบ · เริ่มทำใหม่
              </button>
            ))}
        </aside>

        <section
          ref={listRef}
          className="flex-[999_1_560px] min-w-0 flex flex-col gap-4"
        >
          {!isReview && (
            <div
              role="group"
              aria-label="รูปแบบการแสดงคำถาม"
              className="self-end inline-flex flex-wrap justify-end bg-white border border-line rounded-control p-1 gap-1"
            >
              {(
                [
                  ["quest", "🌠 ตามหาความฝัน"],
                  ["game", "🎮 เกมกระโดด"],
                  ["list", "ดูเป็นรายการ"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cx(
                    "min-h-9 px-3.5 rounded-lg text-sm border-0",
                    view === v
                      ? "bg-primary-soft text-primary font-semibold"
                      : "bg-transparent text-ink-2 hover:bg-page",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {!isReview && view !== "list" ? (
            <CardFlow
              key={`${view}-${idx}`}
              quest
              game={view === "game"}
              sections={SECTIONS}
              idx={idx}
              answers={answers}
              remaining={QUESTIONS.length - answered}
              setAnswer={setAnswer}
              goSection={goTo}
            />
          ) : !isReview ? (
            <>
              {/* ---------- คำถามในหมวด ---------- */}
              <div className="bg-white border border-line rounded-card shadow-card px-5 sm:px-6 py-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
                <span className="font-semibold text-ink">ระดับคะแนน:</span>
                {sec.scale.map((t, i) => (
                  <span key={t}>
                    {i + 1} = {t}
                  </span>
                ))}
              </div>
              {sec.questions.map((q) => (
                <QuestionCard
                  key={q.feature}
                  q={q}
                  scale={sec.scale}
                  value={answers[q.feature]}
                  onAnswer={(n) => setAnswer(q.feature, n)}
                  onKeyAnswer={(n) => keyAnswer(q, n)}
                />
              ))}

              {secDone && (
                <div
                  role="status"
                  className="bg-good-soft text-good-deep rounded-card px-5 py-3.5 flex items-center gap-2.5 text-[15px] font-medium"
                >
                  <Check size={18} /> ครบหมวด “{sec.short}” แล้ว
                  {idx < SECTIONS.length - 1
                    ? ` — เหลืออีก ${SECTIONS.length - 1 - idx} หมวด`
                    : " — ไปทบทวนคำตอบก่อนส่งได้เลย"}
                </div>
              )}

              <div className="flex justify-between items-center gap-3 flex-wrap pt-2">
                {idx === 0 ? (
                  <Link to="/" className={btn.secondary}>
                    ย้อนกลับ
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(idx - 1)}
                    className={btn.secondary}
                  >
                    ย้อนกลับ
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => goTo(idx + 1)}
                  className={btn.primary}
                >
                  ถัดไป: {STEPS[idx + 1]} <ArrowRight />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ---------- ทบทวนก่อนส่ง ---------- */}
              <p className="m-0 text-muted leading-relaxed">
                ดูสรุปคำตอบก่อนส่ง —
                ข้อที่คุณให้คะแนนสูงสุดในแต่ละหมวดคือสิ่งที่โมเดลจะใช้หาอาชีพที่ใกล้คุณ
                แก้ไขได้ทุกหมวด
              </p>
              {SECTIONS.map((s, i) => {
                const d = doneIn(s);
                const top = s.questions
                  .filter((q) => answers[q.feature])
                  .sort(
                    (a, b) =>
                      answers[b.feature] - answers[a.feature] || a.no - b.no,
                  )
                  .slice(0, 3);
                const dist = [1, 2, 3, 4, 5].map(
                  (n) =>
                    s.questions.filter((q) => answers[q.feature] === n).length,
                );
                return (
                  <Card key={s.name} className="flex flex-col gap-3.5 !p-5">
                    <SectionTitle
                      title={`${i + 1}. ${s.short}`}
                      desc={
                        d === s.questions.length
                          ? `ครบ ${d} ข้อ`
                          : `ตอบแล้ว ${d} จาก ${s.questions.length} ข้อ`
                      }
                      right={
                        <button
                          type="button"
                          onClick={() => goTo(i)}
                          className={cx(btn.ghost, "min-h-10 text-sm")}
                        >
                          แก้ไข
                        </button>
                      }
                    />
                    {d < s.questions.length && (
                      <Badge tone="warn" className="self-start">
                        ยังเหลือ {s.questions.length - d} ข้อ
                      </Badge>
                    )}
                    {top.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-semibold text-muted">
                          ให้คะแนนสูงสุด
                        </span>
                        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                          {top.map((q) => (
                            <li
                              key={q.feature}
                              className="flex justify-between gap-3 text-[15px]"
                            >
                              <span className="min-w-0">
                                {short(q.question)}
                              </span>
                              <span className="shrink-0 text-primary font-semibold">
                                {s.scale[answers[q.feature] - 1]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] font-semibold text-muted">
                        การกระจายคำตอบ
                      </span>
                      <div
                        className="flex h-2.5 rounded-full overflow-hidden bg-track"
                        role="img"
                        aria-label={dist
                          .map((c, n) => `${n + 1}: ${c} ข้อ`)
                          .join(", ")}
                      >
                        {dist.map((c, n) =>
                          c ? (
                            <span
                              key={n}
                              style={{
                                width: `${(c / s.questions.length) * 100}%`,
                                opacity: 0.25 + n * 0.19,
                              }}
                              className="bg-primary"
                            />
                          ) : null,
                        )}
                      </div>
                      <span className="flex justify-between text-[11px] text-muted">
                        <span>{s.scale[0]}</span>
                        <span>{s.scale[4]}</span>
                      </span>
                    </div>
                  </Card>
                );
              })}

              {!IS_DEMO && <RealUserCard value={draft} onChange={setDraft} />}

              {submit.isError && (
                <ErrorState
                  message="ส่งคำตอบไม่สำเร็จ"
                  error={submit.error}
                  onRetry={() => submit.mutate()}
                />
              )}

              <div className="flex justify-between items-start gap-3 flex-wrap pt-2">
                <button
                  type="button"
                  onClick={() => goTo(REVIEW - 1)}
                  className={btn.secondary}
                >
                  ย้อนกลับ
                </button>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={!!firstMissing || submit.isPending}
                    onClick={() => submit.mutate()}
                    className={btn.primary}
                  >
                    {submit.isPending ? "โมเดลกำลังวิเคราะห์…" : "ส่งคำตอบและดูผล"}{" "}
                    <ArrowRight />
                  </button>
                  {firstMissing && (
                    <button
                      type="button"
                      className={cx(btn.ghost, "min-h-11 text-sm")}
                      onClick={() => goTo(missingSection)}
                    >
                      ยังเหลือ {QUESTIONS.length - answered} ข้อ — ไปข้อ{" "}
                      {firstMissing.no}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </Main>
  );
}
