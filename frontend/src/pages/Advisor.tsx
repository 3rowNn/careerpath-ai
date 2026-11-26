import { useMutation } from "@tanstack/react-query";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { advisorReply, IS_DEMO, thaiTitle } from "../api/client";
import type { Conversation } from "../api/types";
import {
  ArrowRight,
  Lock,
  Plus,
  Search,
  Sparkles,
  Trash,
} from "../components/icons";
import { Main } from "../components/Layout";
import { cx } from "../components/ui";
import { useSkillGap } from "../lib/queries";
import { useApp } from "../lib/store";
import { useResult } from "../lib/useResult";

const DAY = 86_400_000;

/** เครื่องมือที่ AI เรียก → แหล่งที่มาของคำตอบ (ผลจากโมเดล ML หรือคลังข้อมูลอาชีพ) */
const SOURCE_LABEL: Record<string, string> = {
  get_my_top_careers: "Top 5 จาก Ensemble (① + ②a)",
  explain_career: "เหตุผลรายคำถาม (① Cosine)",
  get_skill_gap: "Skill Gap + Skill Priority",
  check_target_career: "อันดับอาชีพเป้าหมาย + counterfactual",
  get_career_info: "ข้อมูลอาชีพ O*NET + ③ อาชีพใกล้เคียง",
  search_careers: "ค้นอาชีพ (embedding)",
};

/** ตัวหนา **x** ในบรรทัด */
function inline(line: string): ReactNode[] {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

/** markdown อย่างง่ายจากคำตอบของ AI (หัวข้อ, รายการ, เส้นคั่น, ตัวหนา) — สร้างเป็น React element ไม่ใช้ HTML ดิบ */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={blocks.length}
        className={cx(
          "m-0 pl-5 flex flex-col gap-1",
          list.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[*-]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    if (/^-{3,}$|^\*{3,}$/.test(line))
      blocks.push(
        <hr
          key={blocks.length}
          className="w-full border-0 border-t border-line my-1"
        />,
      );
    else if (/^#{1,4}\s/.test(line))
      blocks.push(
        <p key={blocks.length} className="m-0 font-bold mt-1">
          {inline(line.replace(/^#+\s*/, ""))}
        </p>,
      );
    else
      blocks.push(
        <p key={blocks.length} className="m-0">
          {inline(line)}
        </p>,
      );
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export default function Advisor() {
  const app = useApp();
  const { result, isSample, target } = useResult();
  const { result: stored, resultAnswers } = app;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const cid = params.get("c");
  const conv =
    app.conversations.find((c) => c.id === cid) ??
    (cid ? null : app.conversations[0]) ??
    null;
  const messages = conv?.messages ?? [];
  // อาชีพที่คุยอยู่: แชทเดิม = อาชีพของแชทนั้น · มาจากปุ่ม "ถาม AI" ของอาชีพ (?career=) = อาชีพนั้น
  // · ไม่งั้น = เป้าหมายใน Skill Gap — ไม่เปลี่ยนเป้าหมายของ Skill Gap/Roadmap
  const careerParam = params.get("career");
  const focus = conv?.careerCode
    ? {
        code: conv.careerCode,
        title: conv.careerTitle ?? thaiTitle(conv.careerCode, conv.careerCode),
      }
    : careerParam
      ? {
          code: careerParam,
          title:
            result.careers.find((c) => c.code === careerParam)?.title ??
            thaiTitle(careerParam, careerParam),
        }
      : { code: target.code, title: target.title };
  const gapQ = useSkillGap(focus.code);
  const topGaps =
    gapQ.data?.top_priorities.slice(0, 3).map((p) => p.name) ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async (msg: string) => {
      const base: Conversation = conv ?? {
        id: crypto.randomUUID(),
        title: msg.length > 40 ? msg.slice(0, 40) + "…" : msg,
        careerCode: focus.code,
        careerTitle: focus.title,
        createdAt: Date.now(),
        messages: [],
      };
      const withUser = {
        ...base,
        messages: [...base.messages, { role: "user" as const, text: msg }],
      };
      app.upsertConversation(withUser);
      setParams({ c: withUser.id }, { replace: true });
      const reply = await advisorReply(base.messages, msg, {
        answers:
          stored && Object.keys(resultAnswers).length ? resultAnswers : null,
        targetCode: isSample ? null : focus.code,
        result: isSample ? null : result,
        gap: isSample ? null : (gapQ.data ?? null),
      });
      app.upsertConversation({
        ...withUser,
        messages: [
          ...withUser.messages,
          { role: "assistant", text: reply.text, sources: reply.sources },
        ],
      });
    },
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const m = text.trim();
    if (!m || send.isPending) return;
    setText("");
    send.mutate(m);
  };

  const filtered = app.conversations.filter(
    (c) =>
      !query ||
      c.title.includes(query) ||
      c.messages.some((m) => m.text.includes(query)),
  );
  const now = Date.now();
  const groups = [
    { label: "วันนี้", items: filtered.filter((c) => now - c.createdAt < DAY) },
    {
      label: "ก่อนหน้านี้",
      items: filtered.filter((c) => now - c.createdAt >= DAY),
    },
  ].filter((g) => g.items.length);

  // ยังไม่มีผลประเมิน: ไม่อ้างถึงผลของผู้ใช้ตัวอย่าง
  const prompts = isSample
    ? [
        "อยากทำงานที่ได้ช่วยเหลือคน มีอาชีพอะไรบ้าง?",
        "ยังไม่รู้ว่าตัวเองเก่งอะไร ควรเริ่มจากตรงไหน?",
        "อาชีพพยาบาลทำงานอะไรบ้าง?",
        "แบบประเมินในเว็บนี้วัดอะไรบ้าง?",
      ]
    : [
        `ทำไมระบบแนะนำ ${result.careers[0].title} ให้ฉัน?`,
        `ถ้าอยากเป็น ${focus.title} ควรเริ่มเรียนอะไรก่อน?`,
        "ช่วยสรุปจุดแข็งของฉัน",
        "ถ้ามีเวลาวันละ 2 ชั่วโมง ควรแบ่งเวลาเรียนอย่างไร?",
      ];

  return (
    <Main className="!pt-8 !pb-12 flex-row flex-wrap items-stretch">
      <aside
        aria-label="ประวัติการสนทนา"
        className="flex-[1_1_280px] bg-white border border-line rounded-card shadow-card p-4 flex flex-col gap-3.5"
      >
        <button
          type="button"
          onClick={() => setParams({ c: "new" })}
          className="flex items-center justify-center gap-2 min-h-12 font-semibold text-[15px] text-white bg-primary hover:bg-primary-hover border-0 rounded-control"
        >
          <Plus /> แชทใหม่
        </button>
        <div className="relative">
          <label htmlFor="hsearch" className="sr-only">
            ค้นหาประวัติ
          </label>
          <input
            id="hsearch"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาในประวัติการคุย"
            className="w-full box-border text-sm pl-[38px] pr-3 py-2.5 min-h-11 border border-line-strong rounded-control outline-none focus:border-primary"
          />
          <Search className="absolute left-[13px] top-[14px] text-muted" />
        </div>
        {groups.length === 0 && (
          <p className="m-0 text-sm text-muted px-2">
            {query ? "ไม่พบบทสนทนา" : "ยังไม่มีประวัติการคุย"}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted px-2 py-1">
              {g.label}
            </span>
            {g.items.map((c) => {
              const on = c.id === conv?.id;
              return (
                <div
                  key={c.id}
                  className={cx(
                    "group flex items-center rounded-control",
                    on
                      ? "bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]"
                      : "hover:bg-page",
                  )}
                >
                  <button
                    type="button"
                    aria-current={on}
                    onClick={() => setParams({ c: c.id })}
                    className="flex-1 min-w-0 flex flex-col gap-0.5 text-left text-ink px-3 py-2.5 min-h-12 bg-transparent border-0"
                  >
                    <span className="font-semibold text-sm truncate">
                      {c.title}
                    </span>
                    <span className="text-xs text-muted truncate">
                      {c.careerTitle ?? "—"} · {c.messages.length} ข้อความ
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`ลบบทสนทนา ${c.title}`}
                    onClick={() => {
                      app.deleteConversation(c.id);
                      if (on) setParams({});
                    }}
                    className="w-10 h-10 mr-1 shrink-0 rounded-lg bg-transparent border-0 text-muted hover:text-warn flex items-center justify-center opacity-60 group-hover:opacity-100"
                  >
                    <Trash />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        <div className="mt-auto border-t border-line pt-3 flex gap-2.5 items-start text-[13px] text-muted leading-normal">
          <Lock className="shrink-0 mt-0.5" />
          <span>
            {app.token
              ? "ประวัติการคุยบันทึกในบัญชีของคุณ"
              : "ประวัติการคุยเก็บในเบราว์เซอร์นี้ — เข้าสู่ระบบเพื่อบันทึกในบัญชี"}
          </span>
        </div>
      </aside>

      <section
        aria-label="แชทกับ AI Career Advisor"
        className="flex-[999_1_560px] min-w-0 bg-white border border-line rounded-card shadow-card flex flex-col min-h-[640px]"
      >
        <div className="px-6 py-4 border-b border-line flex flex-wrap items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
            <Sparkles size={22} />
          </span>
          <div className="flex-[1_1_240px] flex flex-col min-w-0">
            <span className="font-bold truncate">
              {conv?.title ?? "แชทใหม่"}
            </span>
            <span className="text-[13px] text-muted">
              {isSample
                ? "ยังไม่มีผลประเมิน — ทำแบบประเมินเพื่อให้ AI ใช้เป็นบริบท"
                : "AI ใช้ผลประเมินล่าสุดของคุณเป็นบริบท"}
            </span>
          </div>
          {!isSample && (
            <div className="flex flex-wrap gap-1.5">
              <span className="bg-primary-soft text-primary-deep text-[13px] px-2.5 py-1 rounded-full">
                {focus.code === target.code ? "เป้าหมาย" : "กำลังคุยเรื่อง"}: {focus.title}
              </span>
              {topGaps.length > 0 && (
                <span className="bg-warn-soft text-warn-ink text-[13px] px-2.5 py-1 rounded-full">
                  Gap: {topGaps.join(" · ")}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="p-6 flex flex-col gap-[18px] flex-1 overflow-y-auto max-h-[62vh]">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-10">
              <h2 className="m-0 text-[22px]">เริ่มบทสนทนาใหม่</h2>
              <p className="m-0 text-muted max-w-[440px]">
                AI อธิบายผลจากโมเดล ML — อาชีพที่แนะนำ Skill Gap และ Roadmap ของคุณ
                ถามได้เลย หรือเลือกคำถามด้านล่าง
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5 w-full max-w-[560px]">
                {prompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send.mutate(p)}
                    disabled={send.isPending}
                    className="text-left text-sm text-ink bg-page border border-line rounded-control p-3 min-h-12 hover:border-primary"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cx(
                m.role === "user" && "whitespace-pre-line",
                m.role === "user"
                  ? "self-end max-w-[75%] bg-primary text-white px-4 py-3 rounded-[16px_16px_4px_16px] leading-relaxed"
                  : "self-start max-w-[85%] bg-page border border-line px-[18px] py-3.5 rounded-[16px_16px_16px_4px] leading-[1.7]",
              )}
            >
              {m.role === "user" ? (
                m.text
              ) : (
                <>
                  <RichText text={m.text} />
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-line flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] text-muted">
                        อ้างอิงผลจาก:
                      </span>
                      {m.sources.map((s) => (
                        <span
                          key={s}
                          className="text-[12px] bg-white border border-line rounded-full px-2 py-0.5 text-ink-2"
                        >
                          {SOURCE_LABEL[s] ?? s}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {send.isPending && <ThinkingBubble />}
          {send.isError && (
            <p className="m-0 text-sm text-warn-ink">
              ส่งข้อความไม่สำเร็จ: {(send.error as Error).message}
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={submit}
          className="px-6 pt-4 pb-5 border-t border-line flex flex-col gap-2"
        >
          <div className="flex gap-2.5">
            <label htmlFor="ask" className="sr-only">
              พิมพ์คำถาม
            </label>
            <input
              id="ask"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ถามเกี่ยวกับอาชีพ ทักษะ หรือแผนการเรียน..."
              className="flex-1 min-w-0 text-[15px] px-4 py-3 min-h-12 box-border border border-line-strong rounded-xl text-ink outline-none focus:border-primary"
            />
            <button
              type="submit"
              aria-label="ส่งคำถาม"
              disabled={!text.trim() || send.isPending}
              className="w-12 h-12 shrink-0 border-0 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center text-white"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <span className="text-xs text-muted leading-relaxed">
            AI อาจให้ข้อมูลผิดพลาดได้ ควรใช้ประกอบการตัดสินใจร่วมกับแหล่งข้อมูลอื่น
            {!IS_DEMO &&
              " · คำถามและผลประเมินของคุณ (ไม่มีชื่อหรืออีเมล) จะถูกส่งไปยัง Google Gemini เพื่อสร้างคำตอบ"}
          </span>
        </form>
      </section>
    </Main>
  );
}

// ระหว่างรอคำตอบ (โควตาฟรีมัก 20–35 วินาที): จุดเด้ง + ขั้นตอนเปลี่ยนตามเวลา + แถบวิ่ง
// ขั้นตอนเป็นลำดับงานจริงโดยประมาณ (ไม่ได้รายงานสถานะจาก server)
const THINKING_STEPS: [number, string][] = [
  [0, "กำลังอ่านคำถาม"],
  [3, "กำลังดึงผลจากโมเดล ML"],
  [10, "กำลังเรียบเรียงคำตอบ"],
  [22, "ใกล้เสร็จแล้ว — ช่วงนี้ระบบฟรีมีคนใช้เยอะ"],
];

function ThinkingBubble() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const step = THINKING_STEPS.filter(([at]) => sec >= at).pop()![1];
  return (
    <div
      className="self-start w-[min(340px,100%)] bg-page border border-line px-[18px] py-3.5 rounded-[16px_16px_16px_4px]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 rounded-full bg-primary animate-dot motion-reduce:animate-none"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <span key={step} className="text-sm text-ink-2 animate-fade-up motion-reduce:animate-none">
          {step}…
        </span>
        <span className="ml-auto text-xs text-muted tabular-nums">{sec} วิ</span>
      </div>
      <div className="mt-3 h-1 rounded-full bg-line overflow-hidden" aria-hidden>
        <div className="h-full w-2/5 rounded-full bg-primary/60 animate-sweep motion-reduce:animate-none" />
      </div>
    </div>
  );
}
