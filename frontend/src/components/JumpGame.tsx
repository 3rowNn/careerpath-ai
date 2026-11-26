import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Realm } from "./QuestParts";
import { cx } from "./ui";

/*
 * โหมดเกม "กระโดดหางาน" — เปลี่ยนแค่วิธีตอบ
 * ตัวละครเดินในเมือง กระโดดชนกล่องคำตอบ 1–5 ที่ตรงกับตัวเอง (ชน = ตอบ) · คำถาม/สเกล/คำตอบเหมือนโหมดอื่นทุกอย่าง
 * กันความลำเอียงจากระยะทาง: ตัวละครเกิดที่ตำแหน่งสุ่มทุกข้อ (ไม่ใกล้ตัวเลือกใดเป็นประจำ) · กล่องสูงเท่ากันทุกกล่อง
 * แตะกล่องหรือกดเลข 1–5 ตอบตรง ๆ ได้เสมอ
 */
const H = 300; // ความสูงฉาก
const GROUND = 52; // ความสูงทางเท้า
const PW = 40; // ขนาดตัวละคร
const PH = 46;
const BS = 54; // ขนาดกล่อง
const BLOCK_Y = 118; // ขอบล่างกล่อง เหนือพื้น
const GRAVITY = 2300;
const JUMP = 840;
const SPEED = 290;

type Keys = { l: boolean; r: boolean; j: boolean };

export function JumpStage({
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
  const stage = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hit, setHit] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
  const keys = useRef<Keys>({ l: false, r: false, j: false });
  const st = useRef({ x: -1, y: 0, vy: 0, face: 1, ground: true, done: false });
  const choose = useRef<(n: number) => void>(() => {});
  choose.current = (n) => {
    if (st.current.done) return;
    st.current.done = true;
    setHit(n);
    onChoose(n);
  };

  useLayoutEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // คีย์บอร์ด: ← → / A D เดิน · Space ↑ W กระโดด
  useEffect(() => {
    const map: Record<string, keyof Keys> = {
      ArrowLeft: "l", a: "l", A: "l",
      ArrowRight: "r", d: "r", D: "r",
      ArrowUp: "j", w: "j", W: "j", " ": "j",
    };
    const on = (down: boolean) => (e: KeyboardEvent) => {
      const k = map[e.key];
      const t = e.target as HTMLElement;
      if (!k || e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      keys.current[k] = down;
      if (down) setMoved(true);
    };
    const kd = on(true);
    const ku = on(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // วงจรเกม
  useEffect(() => {
    if (!w) return;
    const s = st.current;
    if (s.x < 0) s.x = PW / 2 + Math.random() * (w - PW); // เกิดที่สุ่ม
    const cx = (i: number) => (w * (i + 0.5)) / 5;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const k = keys.current;
      const dir = (k.r ? 1 : 0) - (k.l ? 1 : 0);
      if (dir) s.face = dir;
      if (k.j && s.ground) {
        s.vy = JUMP;
        s.ground = false;
      }
      const prevTop = s.y + PH;
      s.vy -= GRAVITY * dt;
      s.y += s.vy * dt;
      if (s.y <= 0) {
        s.y = 0;
        s.vy = 0;
        s.ground = true;
      }
      s.x = Math.min(w - PW / 2, Math.max(PW / 2, s.x + dir * SPEED * dt));
      // ชนกล่องจากด้านล่าง = ตอบ แล้วเด้งกลับลงมา
      if (s.vy > 0 && prevTop < BLOCK_Y && s.y + PH >= BLOCK_Y) {
        for (let i = 0; i < 5; i++) {
          if (Math.abs(s.x - cx(i)) < (PW + BS) / 2 - 8) {
            s.y = BLOCK_Y - PH;
            s.vy = -120;
            choose.current(i + 1);
            break;
          }
        }
      }
      if (hero.current)
        hero.current.style.transform = `translate(${s.x - PW / 2}px, ${-s.y}px) scaleX(${s.face})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [w]);

  const pad = (k: keyof Keys) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      keys.current[k] = true;
      setMoved(true);
    },
    onPointerUp: () => (keys.current[k] = false),
    onPointerCancel: () => (keys.current[k] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="flex flex-col gap-3 select-none">
      <div
        ref={stage}
        className="relative w-full overflow-hidden rounded-tile border border-white/20 touch-none"
        style={{ height: H, background: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 70%)" }}
      >
        {/* ฉากเมือง */}
        <div aria-hidden="true" className="absolute inset-x-0 pointer-events-none" style={{ bottom: GROUND }}>
          {[14, 28, 9, 22, 34, 12, 26, 18].map((h, i) => (
            <span
              key={i}
              className="absolute bottom-0 rounded-t-md bg-black/25"
              style={{ left: `${i * 12.5}%`, width: "11%", height: h * 2.2 }}
            >
              <span className="absolute inset-x-[18%] top-3 bottom-2 opacity-40 bg-[repeating-linear-gradient(0deg,transparent_0_8px,rgba(255,255,255,0.35)_8px_11px)]" />
            </span>
          ))}
        </div>
        <span aria-hidden="true" className="absolute left-[8%] top-5 text-[28px] opacity-60 animate-float motion-reduce:animate-none">☁️</span>
        <span aria-hidden="true" className="absolute right-[12%] top-9 text-[22px] opacity-50 animate-float motion-reduce:animate-none [animation-delay:1.5s]">☁️</span>

        {/* กล่องคำตอบ 1–5 */}
        <div role="radiogroup" aria-labelledby={labelledBy}>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = (hit ?? value) === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${n} — ${scale[n - 1]}`}
                onClick={() => choose.current(n)}
                className={cx(
                  "absolute -translate-x-1/2 flex flex-col items-center gap-1 border-0 bg-transparent p-0 text-white",
                  hit === n && "animate-pop motion-reduce:animate-none",
                )}
                style={{ left: `${(n - 0.5) * 20}%`, bottom: GROUND + BLOCK_Y }}
              >
                <span
                  className={cx(
                    "flex items-center justify-center rounded-xl text-[26px] border-2 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5",
                    on ? "bg-white/90 border-white shadow-[0_0_22px_rgba(255,255,255,0.7)]" : "bg-white/15 border-white/50",
                  )}
                  style={{ width: BS, height: BS }}
                >
                  {realm.levels[n - 1]}
                </span>
                <span className="absolute top-full mt-1 w-[19vw] max-w-[110px] text-[11px] sm:text-[12px] leading-tight text-center text-white/90">
                  <b className="block">{n}</b>
                  {scale[n - 1]}
                </span>
              </button>
            );
          })}
        </div>
        {hit && (
          <span
            key={hit}
            aria-hidden="true"
            className="absolute -translate-x-1/2 text-[18px] font-bold text-white animate-fade-up pointer-events-none"
            style={{ left: `${(hit - 0.5) * 20}%`, bottom: GROUND + BLOCK_Y + BS + 10 }}
          >
            ⭐ +1
          </span>
        )}

        {/* ทางเท้า */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 border-t-4 border-white/40 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.35)_0_38px,rgba(0,0,0,0.25)_38px_40px)]"
          style={{ height: GROUND }}
        />

        {/* ตัวละคร */}
        <div
          ref={hero}
          aria-hidden="true"
          className="absolute left-0 flex items-end justify-center text-[38px] leading-none will-change-transform"
          style={{ bottom: GROUND, width: PW, height: PH }}
        >
          🧑‍💼
        </div>

        {!moved && !hit && (
          <span className="absolute left-1/2 -translate-x-1/2 bottom-2 text-[12px] text-white bg-black/40 rounded-full px-3 py-1 whitespace-nowrap pointer-events-none">
            ← → เดิน · Space กระโดด · ชนกล่องที่ตรงกับคุณ
          </span>
        )}
      </div>

      {/* ปุ่มบนมือถือ */}
      <div className="flex justify-between gap-3 sm:hidden" aria-hidden="true">
        <div className="flex gap-2">
          <button type="button" tabIndex={-1} {...pad("l")} className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[22px]">
            ◀
          </button>
          <button type="button" tabIndex={-1} {...pad("r")} className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[22px]">
            ▶
          </button>
        </div>
        <button type="button" tabIndex={-1} {...pad("j")} className="w-16 h-14 rounded-full bg-white text-ink font-bold text-[15px]">
          กระโดด
        </button>
      </div>
    </div>
  );
}
