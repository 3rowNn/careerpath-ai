import { useState } from "react";
import { cx } from "./ui";

/*
 * โหมด "ตามหาความฝัน" — เปลี่ยนแค่หน้าตา
 * ข้อความคำถามไม่เปลี่ยน · คำตอบยังเป็น 1–5 ตามสเกลเดิม (ป้ายสเกลทางการแสดงคู่กับอีโมจิเสมอ)
 */
export interface Realm {
  name: string;
  emoji: string;
  flavor: string;
  bg: string; // พื้นหลังการ์ด (เข้ม → ตัวอักษรขาว)
  accent: string;
  levels: string[]; // อีโมจิ 5 ระดับ
}

const SKILL: Realm = {
  name: "สำรวจสิ่งที่ฉันทำได้",
  emoji: "🧰",
  flavor: "เปิดกระเป๋าดูว่าคุณมีทักษะอะไรติดตัวมาบ้างแล้ว",
  bg: "linear-gradient(150deg,#172554 0%,#1e40af 60%,#3b82f6 100%)",
  accent: "#93c5fd",
  levels: ["🔰", "📝", "🛠️", "🎖️", "🏆"], // มือใหม่ → เชี่ยวชาญ
};
const GUILD: Realm = {
  name: "ค้นหาสิ่งที่ใจชอบ",
  emoji: "🔍",
  flavor: "เข็มทิศในใจคุณชี้ไปทางไหน",
  bg: "linear-gradient(150deg,#042f2e 0%,#115e59 60%,#0f766e 100%)",
  accent: "#5eead4",
  levels: ["🛑", "📉", "⚖️", "📈", "🚀"], // ไม่ชอบเลย → ชอบมาก
};
const QUEST: Realm = {
  name: "ลองสวมบทบาทงานจริง",
  emoji: "💼",
  flavor: "ถ้าวันหนึ่งได้ทำงานแบบนี้ คุณจะรู้สึกยังไง",
  bg: "linear-gradient(150deg,#4c0519 0%,#be123c 55%,#f97316 110%)",
  accent: "#fdba74",
  levels: ["⛔", "🥱", "☕", "💪", "🔥"], // ไม่อยากทำ → อยากทำมาก
};
const SOUL: Realm = {
  name: "ทำความรู้จักตัวเอง",
  emoji: "🪪",
  flavor: "ตัวตนแบบไหนที่คุณพกไปทำงานด้วยทุกวัน",
  bg: "linear-gradient(150deg,#3b0764 0%,#6b21a8 60%,#9333ea 100%)",
  accent: "#f0abfc",
  levels: ["❌", "🤏", "👌", "✅", "💯"], // ไม่ตรงกับฉัน → ตรงมาก
};

/** ดินแดนตามชนิดคำถามข้อแรกของหมวด */
export const realmOf = (feature: string): Realm =>
  ({ grp: SKILL, ri: GUILD, gtask: QUEST, task: QUEST, ws: SOUL })[
    feature.split("::")[0]
  ] ?? SKILL;

/** ก้าวบนเส้นทาง: ทุก 10 ข้อ = 1 ก้าว */
export const levelOf = (answered: number) => Math.floor(answered / 10) + 1;

/**
 * ตัวเลือก 1–5 แบบป๊อบอัพ
 * - ฟองตัวเลือกเด้งขึ้นทีละอัน · ยังไม่มีค่าเริ่มต้น (กันกดผ่านโดยไม่อ่าน)
 * - เลือกแล้ว: ป๊อบอัพอีโมจิใหญ่กลางการ์ด + ประกาย แล้วค่อยไปข้อถัดไป (หน่วงที่ CardFlow)
 */
export function PopChoices({
  value,
  realm,
  scale,
  labelledBy,
  onChoose,
}: {
  value: number | undefined;
  realm: Realm;
  scale: string[];
  labelledBy: string;
  onChoose: (n: number) => void;
}) {
  const [burst, setBurst] = useState<number | null>(null);
  const choose = (n: number) => {
    setBurst(n);
    onChoose(n);
  };

  return (
    <>
      <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-5 gap-2 sm:gap-3 relative">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} — ${scale[n - 1]}`}
              onClick={() => choose(n)}
              className={cx(
                "group flex flex-col items-center gap-1.5 rounded-tile border py-3 sm:py-4 px-1 text-white animate-pop motion-reduce:animate-none",
                "transition-[transform,background-color,border-color,box-shadow] duration-150 hover:-translate-y-1 active:scale-95",
                on ? "bg-white/25 border-white shadow-[0_0_24px_rgba(255,255,255,0.35)]" : "bg-white/10 border-white/20 hover:bg-white/20",
              )}
              style={{ animationDelay: `${80 + n * 70}ms` }}
            >
              <span className="text-[30px] sm:text-[38px] leading-none transition-transform group-hover:scale-110" aria-hidden="true">
                {realm.levels[n - 1]}
              </span>
              <span className="text-[11px] sm:text-[13px] leading-tight text-center text-white/90 min-h-[2.4em]" aria-hidden="true">
                {scale[n - 1]}
              </span>
              <span className="text-[11px] font-bold opacity-60" aria-hidden="true">
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {burst && (
        <div
          key={burst}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[2px] animate-fade-up motion-reduce:hidden"
        >
          <div className="relative flex flex-col items-center gap-2 animate-pop">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-[34px] w-2 h-2 rounded-full animate-spark"
                style={
                  {
                    background: i % 2 ? realm.accent : "#fff",
                    "--sx": `${Math.cos((i / 10) * Math.PI * 2) * 90}px`,
                    "--sy": `${Math.sin((i / 10) * Math.PI * 2) * 90}px`,
                  } as React.CSSProperties
                }
              />
            ))}
            <span className="text-[76px] leading-none drop-shadow-[0_0_24px_rgba(255,255,255,0.6)]">{realm.levels[burst - 1]}</span>
            <span className="text-white text-[20px] font-bold bg-white/15 border border-white/30 rounded-full px-4 py-1.5">
              {scale[burst - 1]}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/** แถบเส้นทาง: ก้าวที่เท่าไร + ความคืบหน้า + จุดหมายที่ผ่านแล้ว */
export function QuestHud({
  answered,
  total,
  realms,
  current,
}: {
  answered: number;
  total: number;
  realms: { realm: Realm; done: boolean }[];
  current: number;
}) {
  const lv = levelOf(answered);
  const xp = answered % 10;
  return (
    <div className="bg-white border border-line rounded-card shadow-card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-3 flex-[1_1_220px] min-w-0">
        <span className="w-11 h-11 shrink-0 rounded-full bg-[linear-gradient(135deg,#1e40af,#f97316)] text-white flex items-center justify-center text-[22px]" aria-hidden="true">
          🌠
        </span>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-sm font-semibold flex justify-between gap-2">
            <span>ผู้ตามหาความฝัน · ก้าวที่ {lv}</span>
            <span className="text-muted font-normal">
              {answered >= total ? "ครบทุกจุดหมายแล้ว" : `อีก ${10 - xp} ข้อถึงก้าวถัดไป`}
            </span>
          </span>
          <div
            className="h-2 rounded-full bg-line overflow-hidden"
            role="progressbar"
            aria-label="ความคืบหน้าสู่ก้าวถัดไป"
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={xp}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#1e40af,#f97316)] transition-[width] duration-300"
              style={{ width: `${answered >= total ? 100 : xp * 10}%` }}
            />
          </div>
        </div>
      </div>
      <ol className="m-0 p-0 list-none flex gap-1.5" aria-label="จุดหมายบนเส้นทาง">
        {realms.map(({ realm, done }, i) => (
          <li
            key={i}
            title={realm.name}
            aria-label={`${realm.name}${done ? " — ผ่านแล้ว" : i === current ? " — อยู่ที่นี่" : ""}`}
            className={cx(
              "w-10 h-10 rounded-tile flex items-center justify-center text-[20px] border",
              i === current ? "border-primary bg-primary-soft" : "border-line bg-page",
              !done && i !== current && "grayscale opacity-50",
            )}
          >
            {done ? "⭐" : realm.emoji}
          </li>
        ))}
      </ol>
    </div>
  );
}
