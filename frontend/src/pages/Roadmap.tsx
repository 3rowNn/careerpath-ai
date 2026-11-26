import { useMutation } from "@tanstack/react-query";
import { NeedAssessment } from '../components/NeedAssessment';
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createAssessment } from "../api/account";
import { IS_DEMO, recommend, skillGap } from "../api/client";
import type { SkillGapResult, SkillRow } from "../api/types";
import { ArrowRight, Sparkles } from "../components/icons";
import { Main } from "../components/Layout";
import {
  Badge,
  btn,
  cx,
  ErrorState,
  GapBar,
  Ring,
  SkeletonRows,
} from "../components/ui";
import resourcesJson from "../data/learning_resources.json";
import questionsJson from "../data/questions.json";
import { SECTION_META } from "../lib/labels";
import { useResultAnswers, useSkillGap } from "../lib/queries";
import { NEAR, tiersOf } from "../lib/skills";
import { useApp, type RoadmapStatus } from "../lib/store";
import { useResult } from "../lib/useResult";

interface Resource {
  title: string;
  url: string;
  kind: "course" | "search";
  lang: string;
  verified: boolean;
}
const RES = resourcesJson as unknown as {
  groups: Record<string, Resource[]>;
  practice: Record<string, string>;
};
const SKILL_SCALE = SECTION_META["1. ทักษะและความรู้"].scale;
const FULL_Q: Record<string, string> = Object.fromEntries(
  (questionsJson as { feature: string; question: string }[]).map((q) => [
    q.feature,
    q.question,
  ]),
);

interface Item {
  id: string;
  kind: "skill" | "tool" | "milestone";
  name: string;
  desc: string;
  row?: SkillRow;
}
interface Stage {
  title: string;
  goal: string;
  head: string;
  empty: string;
  items: Item[];
}

/**
 * Roadmap จากผล skill_gap() ของอาชีพเป้าหมาย (ไม่เพิ่มทักษะที่ไม่อยู่ใน Gap)
 * ระยะ 1 เริ่มต้น: ทักษะสำคัญสูง/กลางที่ขาดไม่เกิน 1 ระดับ (ใกล้ถึง ได้ผลเร็ว)
 * ระยะ 2 พัฒนาหลัก: ทักษะสำคัญสูง/กลางที่ขาดมากกว่า 1 ระดับ
 * ระยะ 3 ต่อยอด: ทักษะสำคัญต่ำ + เครื่องมือที่อาชีพใช้ + ประเมินซ้ำ
 */
/** ทักษะที่เคยอยู่ใน Roadmap (มีสถานะแล้ว) และตอนนี้ถึงเกณฑ์ — แสดงเป็นผ่านเกณฑ์ ไม่ให้หายไปเฉย ๆ */
function closedSkills(g: SkillGapResult, tracked: Set<string>): Item[] {
  return g.all
    .filter((r) => r.gap <= 0 && tracked.has(r.feature))
    .map((r) => ({
      id: r.feature,
      kind: "skill",
      name: r.name,
      desc: `ถึงเกณฑ์แล้ว: ${r.user.toFixed(0)} ≥ ${r.required.toFixed(0)} คะแนน`,
      row: r,
    }));
}

function buildStages(g: SkillGapResult): Stage[] {
  const tiers = tiersOf(g.all);
  const gaps = g.all
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.priority - a.priority);
  const skill = (r: SkillRow): Item => ({
    id: r.feature,
    kind: "skill",
    name: r.name,
    desc: `ยกระดับจาก ${r.user.toFixed(0)} → ${r.required.toFixed(0)} (ขาด ${r.gap.toFixed(0)} คะแนน)`,
    row: r,
  });
  const important = gaps.filter((r) => tiers[r.feature] !== "low");
  const tool = (t: string): Item => ({
    id: `tool::${t}`,
    kind: "tool",
    name: `ฝึกใช้ ${t}`,
    desc: `${g.title} ใช้ ${t} ในงานจริง (O*NET Software Skills)`,
  });
  return [
    {
      title: "เริ่มต้น",
      goal: `ทักษะสำคัญที่ใกล้ถึงเกณฑ์ (ขาดไม่เกิน ${NEAR} คะแนน) — เห็นผลเร็ว`,
      head: "bg-good-soft text-good-deep",
      empty: "ไม่มีทักษะสำคัญที่ขาดไม่เกิน 1 ระดับ",
      items: important.filter((r) => r.gap <= NEAR).map(skill),
    },
    {
      title: "พัฒนาหลัก",
      goal: "ทักษะสำคัญที่ยังห่างจากเกณฑ์ — ใช้เวลามากกว่า",
      head: "bg-primary-soft text-primary-deep",
      empty: `ดีมาก — ไม่มีทักษะสำคัญที่ห่างจากเกณฑ์เกิน ${NEAR} คะแนน`,
      items: important.filter((r) => r.gap > NEAR).map(skill),
    },
    {
      title: "ต่อยอด",
      goal: "ทักษะรอง เครื่องมือที่อาชีพใช้ และวัดผลซ้ำ",
      head: "bg-warn-soft text-warn-deep",
      empty: "",
      items: [
        ...gaps.filter((r) => tiers[r.feature] === "low").map(skill),
        ...g.tools_used.slice(0, 3).map(tool),
        {
          id: "reassess",
          kind: "milestone",
          name: "ทำแบบประเมินซ้ำทั้งชุด",
          desc: "อัปเดตอันดับอาชีพและทักษะครอบคลุม แล้วดูพัฒนาการใน Dashboard",
        },
      ],
    },
  ];
}

const STATUS: Record<
  RoadmapStatus,
  {
    label: string;
    next: RoadmapStatus;
    dot: string;
    tone: "good" | "primary" | "neutral";
  }
> = {
  todo: {
    label: "ยังไม่เริ่ม",
    next: "doing",
    dot: "bg-white border-2 border-line-strong",
    tone: "neutral",
  },
  doing: {
    label: "กำลังเรียน",
    next: "done",
    dot: "bg-primary text-white",
    tone: "primary",
  },
  done: {
    label: "เรียนแล้ว",
    next: "todo",
    dot: "bg-good text-white",
    tone: "good",
  },
  passed: {
    label: "ผ่านเกณฑ์ (ประเมินซ้ำ)",
    next: "todo",
    dot: "bg-good text-white ring-2 ring-good-soft",
    tone: "good",
  },
};

/** แหล่งเรียนรู้ของกลุ่มทักษะ — จากไฟล์ที่คนดูแล ไม่สร้าง URL เอง */
function Resources({ feature, tool }: { feature?: string; tool?: string }) {
  if (tool) {
    const url = `https://www.coursera.org/search?query=${encodeURIComponent(tool)}`;
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium"
      >
        ค้นหาคอร์ส {tool} บน Coursera ↗
      </a>
    );
  }
  if (!feature) return null;
  const practice = RES.practice[feature];
  if (practice)
    return (
      <p className="m-0 text-[13px] text-muted leading-relaxed">{practice}</p>
    );
  const list = RES.groups[feature] ?? [];
  if (!list.length)
    return <p className="m-0 text-[13px] text-muted">ยังไม่มีแหล่งแนะนำ</p>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
      {list.map((r) => (
        <li key={r.url} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium"
          >
            {r.title} ↗
          </a>
          {r.kind === "search" && (
            <span className="text-[11px] text-muted">หน้าค้นหา</span>
          )}
          {r.lang === "th" && (
            <span className="text-[11px] text-muted">ภาษาไทย</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * ประเมินทักษะนี้ใหม่ 1 ข้อ = ผลประเมินชุดใหม่ (คำตอบเดิม + ข้อนี้) → Top 5, Skill Gap, Dashboard อัปเดตตามทั้งหมด
 * เข้าสู่ระบบแล้วบันทึกในบัญชีเป็นผลประเมินครั้งใหม่ (ประวัติพัฒนาการ)
 */
function Reassess({
  row,
  code,
  autoOpen,
  onPassed,
}: {
  row: SkillRow;
  code: string;
  autoOpen: boolean;
  onPassed: () => void;
}) {
  const base = useResultAnswers();
  const { token, answers, setAnswer, saveResult } = useApp();
  const [open, setOpen] = useState(false);
  const check = useMutation({
    mutationFn: async (n: number) => {
      const next = { ...base, [row.feature]: n };
      const [r, g] = await Promise.all([
        token
          ? createAssessment(token, next).then((a) => a.result)
          : recommend(next),
        skillGap(next, code),
      ]);
      saveResult(r, next);
      if (Object.keys(answers).length) setAnswer(row.feature, n); // แบบประเมินที่กรอกค้างไว้ใช้ค่าล่าสุดด้วย
      return g.all.find((x) => x.feature === row.feature)!;
    },
    onSuccess: (r) => {
      if (r.gap <= 0) onPassed();
    },
  });
  if (IS_DEMO) return null;
  if (!open && !autoOpen)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(btn.ghost, "min-h-10 px-2 text-sm self-start")}
      >
        ประเมินทักษะนี้ใหม่
      </button>
    );
  const r = check.data;
  return (
    <div className="bg-page border border-line rounded-control p-3 flex flex-col gap-2.5">
      <span className="text-sm font-medium leading-relaxed">
        ตอนนี้คุณ{FULL_Q[row.feature] ?? row.name}
      </span>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={check.isPending}
            onClick={() => check.mutate(n)}
            title={SKILL_SCALE[n - 1]}
            aria-label={`${n} = ${SKILL_SCALE[n - 1]}`}
            className={cx(
              "h-10 rounded-lg border font-semibold text-sm disabled:opacity-50",
              check.variables === n
                ? "bg-primary border-primary text-white"
                : "bg-white border-line-strong text-ink-2 hover:border-primary",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="flex justify-between text-[11px] text-muted">
        <span>{SKILL_SCALE[0]}</span>
        <span>{SKILL_SCALE[4]}</span>
      </span>
      <div aria-live="polite" className="text-sm">
        {check.isPending && <span className="text-muted">กำลังคำนวณใหม่…</span>}
        {check.isError && (
          <span className="text-warn-ink">
            ประเมินไม่สำเร็จ: {(check.error as Error).message}
          </span>
        )}
        {r &&
          (r.gap <= 0 ? (
            <span className="text-good font-semibold">
              ผ่านเกณฑ์แล้ว ({r.user.toFixed(0)} ≥ {r.required.toFixed(0)})
            </span>
          ) : (
            <span className="text-warn-ink">
              ยังขาด {r.gap.toFixed(0)} คะแนน ({r.user.toFixed(0)} →{" "}
              {r.required.toFixed(0)})
            </span>
          ))}
      </div>
      <span className="text-[11px] text-muted leading-relaxed">
        ตอบตามความสามารถตอนนี้จริง ๆ — การติ๊กว่าเรียนแล้วไม่ได้แปลว่าทักษะผ่านเกณฑ์ ·
        คำตอบใหม่จะอัปเดต Skill Gap, Top 5 และ Dashboard
      </span>
    </div>
  );
}

/** หน้าตาแต่ละระยะบนเส้นทาง (ตกแต่งเท่านั้น) */
const STAGE_LOOK = [
  { emoji: "🚶", ring: "bg-good text-white", bar: "bg-good" },
  { emoji: "🧗", ring: "bg-primary text-white", bar: "bg-primary" },
  { emoji: "🚀", ring: "bg-warn text-white", bar: "bg-warn" },
];
const STATUS_ICON: Record<RoadmapStatus, string> = { todo: "○", doing: "◐", done: "✓", passed: "★" };

export default function Roadmap() {
  const { isSample } = useResult()
  return isSample ? (
    <NeedAssessment icon="🗺️" title="ยังไม่มี Roadmap ของคุณ" desc="Roadmap สร้างจากทักษะที่คุณยังขาดสำหรับอาชีพเป้าหมาย จึงต้องทำแบบประเมินก่อน" />
  ) : (
    <RoadmapBody />
  )
}

function RoadmapBody() {
  const { isSample, target, isGoal } = useResult();
  const app = useApp();
  const { roadmap, setRoadmapStatus } = app;
  const q = useSkillGap(target.code);

  const key = (id: string) => `${target.code}|${id}`;
  const prefix = `${target.code}|`;
  const tracked = new Set(
    Object.keys(roadmap)
      .filter((k) => k.startsWith(prefix) && roadmap[k] !== "todo")
      .map((k) => k.slice(prefix.length)),
  );
  const stages = q.data ? buildStages(q.data) : [];
  const closed = q.data ? closedSkills(q.data, tracked) : [];
  const all = [...closed, ...stages.flatMap((s) => s.items)];
  /** สถานะทักษะมาจากคะแนนจริง: Gap ปิดแล้ว = ผ่านเกณฑ์ · เคยผ่านแต่คะแนนชุดใหม่ต่ำลง = กลับเป็น "เรียนแล้ว" */
  const statusOf = (it: Item): RoadmapStatus => {
    const st = roadmap[key(it.id)] ?? "todo";
    if (it.kind !== "skill" || !it.row) return st;
    if (it.row.gap <= 0) return "passed";
    return st === "passed" ? "done" : st;
  };
  const isDone = (it: Item) => ["done", "passed"].includes(statusOf(it));
  const done = all.filter(isDone).length;
  const doing = all.filter((i) => statusOf(i) === "doing").length;
  const passed = all.filter((i) => statusOf(i) === "passed").length;
  const skills = all.filter((i) => i.kind === "skill").length;
  const complete = !!q.data && all.length > 0 && done === all.length;
  const pctDone = all.length ? (done / all.length) * 100 : 0;
  // ครบแล้ว → บันทึกลงหน้าโปรไฟล์ (เรียกซ้ำได้ — store ข้ามถ้าตัวเลขไม่เปลี่ยน)
  const { recordLearning } = app;
  useEffect(() => {
    if (complete && !isSample)
      recordLearning({ code: target.code, title: target.title, completedAt: Date.now(), total: all.length, skills, passed });
  }, [complete, isSample, target.code, target.title, all.length, skills, passed, recordLearning]);
  // ระยะแรกที่ยังไม่ครบ = "คุณอยู่ตรงนี้"
  const here = stages.findIndex((s) => s.items.some((it) => !isDone(it)));

  const renderItem = (it: Item) => {
    const st = statusOf(it);
    const meta = STATUS[st];
    // ผ่านเกณฑ์จากคะแนนจริง — เปลี่ยนด้วยการคลิกไม่ได้ ต้องประเมินใหม่
    const locked = it.kind === "skill" && !!it.row && it.row.gap <= 0;
    const kindLabel = it.kind === "skill" ? "ทักษะ" : it.kind === "tool" ? "เครื่องมือ" : "จุดวัดผล";
    return (
      <li
        key={it.id}
        className={cx(
          "rounded-tile border p-4 flex flex-col gap-3 bg-white transition-[border-color,box-shadow] duration-150",
          st === "passed" ? "border-good/50 bg-good-soft/40" : st === "done" ? "border-good/30" : st === "doing" ? "border-primary shadow-lift" : "border-line hover:shadow-lift",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cx("w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[15px] font-bold", meta.dot)}
            aria-hidden="true"
          >
            {st === "todo" ? (it.kind === "tool" ? "🛠️" : it.kind === "milestone" ? "🏁" : "") : STATUS_ICON[st]}
          </span>
          <span className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{kindLabel}</span>
            <span className="font-semibold leading-snug">{it.name}</span>
            <span className="text-[13px] text-muted leading-relaxed">{it.desc}</span>
          </span>
        </div>

        {it.kind === "skill" && it.row && (
          <GapBar user={it.row.user} required={it.row.required} />
        )}

        {/* สถานะ: เลือกตรง ๆ แทนการกดวน */}
        {locked ? (
          <Badge tone="good" className="self-start">★ {meta.label}</Badge>
        ) : (
          <div role="group" aria-label={`สถานะของ ${it.name}`} className="grid grid-cols-3 gap-1 bg-page rounded-control p-1">
            {(["todo", "doing", "done"] as const).map((v) => {
              const on = (st === "passed" ? "done" : st) === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRoadmapStatus(key(it.id), v)}
                  className={cx(
                    "min-h-9 rounded-lg border-0 text-[13px] transition-colors",
                    on
                      ? v === "done"
                        ? "bg-good text-white font-semibold"
                        : v === "doing"
                          ? "bg-primary text-white font-semibold"
                          : "bg-white text-ink font-semibold shadow-card"
                      : "bg-transparent text-ink-2 hover:bg-white",
                  )}
                >
                  {STATUS[v].label}
                </button>
              );
            })}
          </div>
        )}

        {(it.kind === "tool" || (it.kind === "skill" && st !== "passed")) && (
          <details className="group/res">
            <summary className="cursor-pointer text-sm font-semibold text-primary list-none flex items-center gap-1.5">
              <span className="transition-transform group-open/res:rotate-90">▸</span> 📚 แหล่งเรียนรู้
            </summary>
            <div className="pt-2">
              {it.kind === "tool" ? <Resources tool={it.name.replace("ฝึกใช้ ", "")} /> : <Resources feature={it.id} />}
            </div>
          </details>
        )}
        {it.kind === "skill" && it.row && st !== "passed" && (
          // ติ๊ก "เรียนแล้ว" → เปิดให้ประเมินซ้ำทันที เพื่อให้ Skill Gap ขยับตามจริง
          <Reassess
            row={it.row}
            code={target.code}
            autoOpen={st === "done"}
            onPassed={() => setRoadmapStatus(key(it.id), "passed")}
          />
        )}
        {it.kind === "milestone" && (
          <Link to="/assessment" className={cx(btn.secondary, "self-start min-h-10 text-sm")}>
            ไปทำแบบประเมิน →
          </Link>
        )}
      </li>
    );
  };

  return (
    <Main className="gap-7">

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-[22px] px-5 py-7 sm:px-9 sm:py-9 text-white bg-[linear-gradient(135deg,#052e16_0%,#14532d_45%,#2747D0_130%)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-10 text-[180px] opacity-10 rotate-[-8deg]">
          🗺️
        </div>
        <div className="relative flex flex-wrap gap-7 items-center">
          <div className="flex flex-col gap-3 flex-[1_1_380px] min-w-0">
            <span className="text-sm font-semibold text-white/75">🗺️ Learning Roadmap</span>
            <h1 className="m-0 text-[28px] sm:text-[36px] leading-tight font-bold">เส้นทางสู่ {target.title}</h1>
            <p className="m-0 text-white/85 leading-relaxed">
              สร้างจากทักษะที่ยังขาดของอาชีพนี้ เรียงตาม Skill Priority — เลือกสถานะของแต่ละรายการ แล้วประเมินทักษะซ้ำเพื่อให้ผ่านเกณฑ์จริง
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-[13px] px-3 py-1.5 rounded-full bg-white/15 border border-white/20">✓ เสร็จ {done}/{all.length}</span>
              <span className="text-[13px] px-3 py-1.5 rounded-full bg-white/15 border border-white/20">◐ กำลังเรียน {doing}</span>
              <span className="text-[13px] px-3 py-1.5 rounded-full bg-white/15 border border-white/20">★ ผ่านเกณฑ์ {passed}/{skills} ทักษะ</span>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <Ring value={pctDone} label="ความคืบหน้า" />
            <span className="text-[12px] text-white/75">ความคืบหน้า</span>
          </div>
        </div>
      </section>

      {complete && (
        <Congrats
          key={target.code}
          title={target.title}
          total={all.length}
          passed={passed}
          skills={skills}
        />
      )}

      {/* ---------- อาชีพเป้าหมาย (เปลี่ยนได้ที่หน้าอาชีพที่แนะนำ) ---------- */}
      <section aria-label="อาชีพเป้าหมาย" className="flex flex-wrap items-center gap-2">
        <Badge className="min-h-10 px-3.5 text-sm">{isGoal ? "★ อาชีพที่อยากเป็น" : "🎯 อาชีพเป้าหมาย"}: {target.title}</Badge>
        <Link to="/careers" className={cx(btn.ghost, "min-h-10 text-sm")}>
          เปลี่ยนอาชีพที่หน้าอาชีพที่แนะนำ
        </Link>
      </section>

      {!q.data ? (
        q.isError ? (
          <ErrorState message="สร้าง Roadmap ไม่สำเร็จ" error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <SkeletonRows rows={6} label="กำลังสร้าง Roadmap…" />
        )
      ) : (
        <>
          {closed.length > 0 && (
            <section aria-labelledby="closed-title" className="bg-white border border-good/40 rounded-card shadow-card overflow-hidden">
              <div className="p-5 flex flex-col gap-1 bg-good-soft text-good-deep">
                <h2 id="closed-title" className="m-0 text-[20px]">
                  ★ ผ่านเกณฑ์แล้ว {closed.length} ทักษะ
                </h2>
                <span className="text-sm leading-relaxed">
                  ทักษะที่อยู่ใน Roadmap และคะแนนล่าสุดถึงระดับที่ {target.title} ต้องการแล้ว — ไม่ถูกนับเป็น Gap ในหน้า Skill Gap อีก
                </span>
              </div>
              <ol className="list-none m-0 p-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
                {closed.map(renderItem)}
              </ol>
            </section>
          )}

          {/* ---------- เส้นทาง 3 ระยะ ---------- */}
          <ol className="m-0 p-0 list-none flex flex-col">
            {stages.map((s, i) => {
              const look = STAGE_LOOK[i] ?? STAGE_LOOK[0];
              const sDone = s.items.filter(isDone).length;
              const finished = s.items.length > 0 && sDone === s.items.length;
              return (
                <li key={s.title} className="relative flex gap-4 sm:gap-6 pb-8">
                  {/* เส้นเชื่อม */}
                  <span aria-hidden="true" className="absolute left-[23px] sm:left-[27px] top-14 bottom-0 w-1 rounded-full bg-line" />
                  <span
                    className={cx(
                      "relative z-[1] w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full flex items-center justify-center text-[22px] sm:text-[26px] shadow-card",
                      finished ? "bg-good text-white" : look.ring,
                      i === here && "ring-4 ring-primary/25",
                    )}
                    aria-hidden="true"
                  >
                    {finished ? "✓" : look.emoji}
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold text-muted flex items-center gap-2">
                          ระยะที่ {i + 1}
                          {i === here && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary text-white">📍 คุณอยู่ตรงนี้</span>}
                        </span>
                        <h2 className="m-0 text-[22px]">{s.title}</h2>
                        <span className="text-sm text-muted leading-relaxed">{s.goal}</span>
                      </div>
                      {s.items.length > 0 && (
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <span className="h-2 flex-1 bg-line rounded-full overflow-hidden">
                            <span className={cx("block h-full rounded-full transition-[width] duration-500", look.bar)} style={{ width: `${(sDone / s.items.length) * 100}%` }} />
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums">
                            {sDone}/{s.items.length}
                          </span>
                        </div>
                      )}
                    </div>
                    {s.items.length === 0 ? (
                      <p className="m-0 text-sm text-muted bg-white border border-dashed border-line rounded-tile p-4 leading-relaxed">{s.empty}</p>
                    ) : (
                      <ol className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] gap-3">
                        {s.items.map(renderItem)}
                      </ol>
                    )}
                  </div>
                </li>
              );
            })}
            {/* ปลายทาง */}
            <li className="flex gap-4 sm:gap-6 items-center">
              <span
                className={cx(
                  "w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full flex items-center justify-center text-[22px] sm:text-[26px] shadow-card",
                  complete ? "bg-good text-white" : "bg-white border-2 border-dashed border-line-strong",
                )}
                aria-hidden="true"
              >
                🏁
              </span>
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold text-muted">ปลายทาง</span>
                <span className="text-[20px] font-bold">{target.title}</span>
              </div>
            </li>
          </ol>
        </>
      )}

      <p className="m-0 text-[13px] text-muted leading-relaxed">
        แหล่งเรียนรู้คัดโดย Claude และยังไม่ได้ให้ผู้รู้ตรวจเนื้อหา (ลิงก์เปิดได้ทั้งหมด) — “หน้าค้นหา”
        คือรายการคอร์สในหัวข้อนั้น ไม่ใช่คอร์สที่เลือกให้แล้ว ·
        ทักษะด้านร่างกายและการรับรู้ไม่มีคอร์สออนไลน์ที่เหมาะ จึงแนะนำเป็นการฝึกปฏิบัติ ·
        ความคืบหน้าเก็บในเบราว์เซอร์นี้{app.token ? " และในบัญชีของคุณ" : ""}
      </p>

      <section className="bg-ink text-white rounded-card p-7 flex flex-wrap gap-5 justify-between items-center">
        <div className="flex flex-col gap-1.5 flex-[1_1_420px]">
          <h2 className="m-0 text-xl">อยากได้แผนที่ละเอียดกว่านี้?</h2>
          <p className="m-0 text-on-dark">
            ถาม AI Advisor ให้ช่วยจัดลำดับตามเวลาว่างของคุณ — AI อธิบายจากผล Skill Gap ข้างบน ไม่ได้คำนวณใหม่
          </p>
        </div>
        <Link to={`/advisor?c=new&career=${encodeURIComponent(target.code)}`} className={btn.light}>
          คุยกับ AI Advisor <ArrowRight />
        </Link>
      </section>
    </Main>
  );
}

// ---------- ฉลองเมื่อ Roadmap ครบทุกรายการ ----------
const CONFETTI_COLORS = ["#2747D0", "#9DB0F0", "#15803D", "#F59E0B", "#EC4899", "#FFFFFF"];
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  dx: ((i * 53) % 120) - 60,
  rot: ((i * 97) % 720) - 360,
  delay: ((i * 29) % 60) / 100,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  round: i % 3 === 0,
}));

/** ข้อความแยก 2 กรณีตามจริง: ปิด Gap ครบจากคะแนนประเมินซ้ำ vs. เรียนครบแต่ยังไม่ได้ยืนยันด้วยการประเมิน */
function Congrats({
  title,
  total,
  passed,
  skills,
}: {
  title: string;
  total: number;
  passed: number;
  skills: number;
}) {
  const verified = passed === skills;
  return (
    <section
      aria-live="polite"
      className="relative overflow-hidden rounded-card p-7 text-white bg-[linear-gradient(135deg,#2747D0_0%,#3B5BE0_55%,#15803D_130%)] shadow-card"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full motion-reduce:hidden">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="absolute -top-3 animate-confetti"
            style={
              {
                left: `${c.left}%`,
                width: c.round ? 8 : 6,
                height: c.round ? 8 : 12,
                borderRadius: c.round ? 999 : 2,
                background: c.color,
                animationDelay: `${c.delay}s`,
                "--dx": `${c.dx}px`,
                "--rot": `${c.rot}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="relative flex flex-wrap gap-5 items-center">
        <span className="w-16 h-16 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-[34px] animate-pop motion-reduce:animate-none">
          🎉
        </span>
        <div className="flex flex-col gap-1.5 flex-[1_1_380px] min-w-0">
          <span className="text-[13px] font-semibold text-white/80 flex items-center gap-1.5">
            <Sparkles size={16} /> Roadmap ครบ {total} / {total} รายการ
          </span>
          <h2 className="m-0 text-[26px] leading-tight">
            ยินดีด้วย! คุณเรียนครบเส้นทางสู่ {title} แล้ว
          </h2>
          <p className="m-0 text-white/85 leading-relaxed">
            {verified
              ? `ผลประเมินล่าสุดยืนยันว่าทักษะใน Roadmap ผ่านเกณฑ์ที่อาชีพนี้ต้องการครบทั้ง ${skills} ทักษะแล้ว`
              : `ผ่านเกณฑ์จากการประเมินซ้ำแล้ว ${passed} จาก ${skills} ทักษะ — ทำแบบประเมินอีกครั้งเพื่อให้โมเดลยืนยันว่าทักษะที่เหลือถึงเกณฑ์จริง`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {!verified && (
            <Link to="/assessment" className={btn.light}>
              ทำแบบประเมินใหม่ <ArrowRight />
            </Link>
          )}
          <Link to="/skill-gap" className={verified ? btn.light : btn.ghostDark}>
            ดู Skill Gap
          </Link>
          <Link to="/explore" className={btn.ghostDark}>
            สำรวจอาชีพถัดไป
          </Link>
        </div>
      </div>
    </section>
  );
}
