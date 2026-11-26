import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IS_DEMO } from '../api/client'
import { QUESTION_COUNT } from '../lib/labels'
import { ArrowRight, Sparkle } from './icons'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ปุ่ม/ลิงก์ — สไตล์ตามดีไซน์ (min-height 48px, radius 10px) */
const BTN =
  'inline-flex items-center justify-center gap-2 min-h-12 rounded-control font-semibold no-underline transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
export const btn = {
  primary: `${BTN} px-[22px] bg-primary !text-white border-0 shadow-card hover:bg-primary-hover hover:shadow-lift`,
  secondary: `${BTN} px-[22px] bg-white !text-ink border border-line-strong hover:bg-page hover:border-primary-mid`,
  ghost: `${BTN} px-4 bg-transparent !text-primary border-0 hover:bg-primary-soft`,
  light: `${BTN} px-5 bg-white !text-ink hover:bg-line`,
  ghostDark: `${BTN} px-5 !text-white border border-muted hover:bg-dark-2`,
}

/** การ์ดหลัก · interactive = มีเงายกเมื่อ hover (ใช้กับการ์ดที่คลิกได้) */
export function Card({ children, className, interactive }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <section
      className={cx(
        'bg-white border border-line rounded-card p-6 shadow-card',
        interactive && 'transition-[box-shadow,transform,border-color] duration-200 hover:shadow-lift hover:-translate-y-0.5 hover:border-primary-line',
        className,
      )}
    >
      {children}
    </section>
  )
}

type Tone = 'primary' | 'good' | 'warn' | 'neutral'
const BADGE: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-deep',
  good: 'bg-good-soft text-good-deep',
  warn: 'bg-warn-soft text-warn-deep',
  neutral: 'bg-track text-ink-2',
}

/** ป้ายสั้น ๆ เช่น สถานะ/หมวด */
export function Badge({ tone = 'primary', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 text-[13px] font-medium px-2.5 py-1 rounded-full', BADGE[tone], className)}>{children}</span>
}

/** หัวข้อในการ์ด: ชื่อ + คำอธิบาย + ของด้านขวา */
export function SectionTitle({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between items-start gap-x-3 gap-y-1">
      <div className="flex flex-col gap-0.5 min-w-0">
        <h2 className="m-0 text-[19px] font-bold leading-snug">{title}</h2>
        {desc && <p className="m-0 text-[13px] text-muted leading-relaxed">{desc}</p>}
      </div>
      {right}
    </div>
  )
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'min-h-10 px-3.5 rounded-full text-sm border transition-colors',
        on ? 'bg-primary border-primary text-white font-semibold' : 'bg-white border-line-strong text-ink-2 font-medium hover:border-primary',
      )}
    >
      {children}
    </button>
  )
}

export function StatTile({ label, value, sub, tone = 'primary' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'primary' | 'good' | 'warn' | 'ink' }) {
  const color = { primary: 'text-primary', good: 'text-good', warn: 'text-warn', ink: 'text-ink' }[tone]
  return (
    <div className="bg-white border border-line rounded-tile p-5 flex flex-col gap-1 min-w-0 shadow-card">
      <span className="text-sm text-muted">{label}</span>
      <span className={cx('text-[32px] leading-tight font-bold break-words', color)}>{value}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </div>
  )
}

/**
 * แถบเทียบคะแนน 0–100: ส่วนที่มีแล้ว (น้ำเงิน · ถึงเกณฑ์ = เขียว) + ส่วนที่ขาด (ส้มลายทาง) + เส้น "ต้องการ"
 * ตัวเลขอยู่บนแถบเลย ไม่ต้องอ่านข้อความประกอบ — ป้ายที่แคบเกินจะย้ายไปไว้บรรทัดบนแทน
 */
export function GapBar({ user, required, tone = 'light' }: { user: number; required: number; tone?: 'light' | 'dark' }) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v))
  const u = clamp(user)
  const q = clamp(required)
  const gap = Math.max(0, q - u)
  const ok = gap <= 0
  const dark = tone === 'dark'
  const r = (v: number) => Math.round(v)
  const userInside = u >= 12 // ตัวเลขในแท่งน้ำเงินพอดี
  const gapInside = gap >= 16 && !(u < 12 && gap < 26) // "ขาด n" ในช่องส้มพอดี และไม่ชนเลขของคุณ
  // ป้าย "ต้องการ" ชิดซ้าย/ขวาเมื่อเส้นอยู่ใกล้ขอบ
  const reqPos = q > 80 ? { right: `${100 - q}%` } : q < 20 ? { left: `${q}%` } : { left: `${q}%`, transform: 'translateX(-50%)' }
  return (
    <span
      role="img"
      aria-label={`ของคุณ ${r(u)} · ต้องการ ${r(q)} · ${ok ? 'ถึงเกณฑ์แล้ว' : `ขาด ${r(gap)}`} (เต็ม 100)`}
      className="block w-full min-w-0 grow"
    >
      <span className="relative block h-4 mb-0.5 text-[11px] leading-4" aria-hidden="true">
        <span className={cx('absolute whitespace-nowrap font-semibold', dark ? 'text-[#fdba74]' : 'text-warn-ink')} style={reqPos}>
          ต้องการ {r(q)}
          {!ok && !gapInside && ` · ขาด ${r(gap)}`}
        </span>
      </span>
      <span className={cx('relative block h-5 rounded-md overflow-hidden', dark ? 'bg-white/15' : 'bg-track')} aria-hidden="true">
        <span
          className={cx('absolute inset-y-0 left-0 flex items-center justify-end', ok ? 'bg-good' : 'bg-primary')}
          style={{ width: `${Math.max(u, 1)}%` }}
        >
          {userInside && <span className="pr-1.5 text-[11px] font-bold text-white tabular-nums">{r(u)}</span>}
        </span>
        {!userInside && (
          <span
            className={cx('absolute inset-y-0 flex items-center text-[11px] font-bold tabular-nums', dark ? 'text-white' : 'text-ink')}
            style={{ left: `calc(${u}% + 4px)` }}
          >
            {r(u)}
          </span>
        )}
        {!ok && (
          <span
            className={cx('absolute inset-y-0 flex items-center justify-center', dark ? 'bg-[#fdba74]/30' : 'bg-warn-soft')}
            style={{
              left: `${u}%`,
              width: `${gap}%`,
              backgroundImage: `repeating-linear-gradient(-45deg, transparent 0 5px, ${dark ? 'rgba(253,186,116,0.35)' : 'rgba(180,83,9,0.14)'} 5px 8px)`,
            }}
          >
            {gapInside && <span className={cx('text-[11px] font-bold whitespace-nowrap', dark ? 'text-[#fdba74]' : 'text-warn-ink')}>ขาด {r(gap)}</span>}
          </span>
        )}
        <span className={cx('absolute inset-y-0 w-[2px]', dark ? 'bg-[#fdba74]' : 'bg-warn')} style={{ left: `calc(${q}% - 1px)` }} />
      </span>
    </span>
  )
}

/** คำอธิบายสีของ GapBar — ใช้ร่วมทุกหน้า */
export function GapLegend({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex flex-wrap gap-x-3.5 gap-y-1 items-center text-[13px] text-ink-2', className)}>
      <span className="inline-flex gap-1.5 items-center">
        <span className="w-3.5 h-2.5 rounded-sm bg-primary" /> ของคุณ
      </span>
      <span className="inline-flex gap-1.5 items-center">
        <span className="w-3.5 h-2.5 rounded-sm bg-warn-soft border border-warn/30" /> ที่ยังขาด
      </span>
      <span className="inline-flex gap-1.5 items-center">
        <span className="w-[2px] h-3.5 bg-warn" /> ระดับที่อาชีพต้องการ
      </span>
      <span className="inline-flex gap-1.5 items-center">
        <span className="w-3.5 h-2.5 rounded-sm bg-good" /> ถึงเกณฑ์แล้ว
      </span>
    </span>
  )
}

/* % ทักษะครอบคลุม — ต้องมีป้ายเสมอ ไม่งั้นคนเข้าใจว่าเป็น "% ความเหมาะ" (อันดับมาจาก Ensemble ไม่ใช่ค่านี้) */
export function CoverageValue({ value }: { value: number }) {
  return (
    <span className="shrink-0 whitespace-nowrap text-right" title="ทักษะที่คุณมีถึงระดับที่อาชีพนี้ต้องการ (30 กลุ่มทักษะ)">
      <span className="text-[12px] text-muted font-normal">ทักษะครอบคลุม </span>
      <span className="font-bold text-primary">{value}%</span>
    </span>
  )
}

/* อธิบายว่าอันดับกับ % เป็นคนละค่า — วางไว้เหนือรายการ Top 5 */
export function RankNote() {
  return (
    <p className="m-0 text-[13px] text-muted leading-relaxed">
      เรียงตาม<strong className="text-ink-2 font-semibold">ความเหมาะโดยรวม</strong> (ทักษะ ความสนใจ ลักษณะงานที่ชอบ และนิสัย รวม{' '}
      {QUESTION_COUNT} ข้อ) — ส่วน % คือทักษะที่คุณมีถึงระดับที่อาชีพต้องการ จึงไม่จำเป็นต้องเรียงตามกัน
    </p>
  )
}

export function Progress({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'good'; label?: string }) {
  return (
    <div
      className="h-2 bg-line rounded-full overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <div className={cx('h-full rounded-full transition-[width]', tone === 'good' ? 'bg-good' : 'bg-primary')} style={{ width: `${value}%` }} />
    </div>
  )
}

export function DemoNote({ className }: { className?: string }) {
  if (!IS_DEMO) return null
  return (
    <span className={cx('text-[13px] text-muted bg-white border border-line px-3 py-1.5 rounded-full', className)}>
      โหมดตัวอย่าง · ผลจากโมเดลจริงกับผู้ใช้ตัวอย่าง
    </span>
  )
}

export function Insight({ children, title = 'ML Insight' }: { children: ReactNode; title?: string }) {
  return (
    <div className="bg-ink text-white rounded-xl px-4 py-3.5 flex gap-3 items-start">
      <Sparkle className="text-primary-mid shrink-0 mt-0.5" />
      <span className="text-sm leading-relaxed">
        <b>{title}:</b> {children}
      </span>
    </div>
  )
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-muted py-10 justify-center" role="status">
      <span className="w-5 h-5 border-2 border-primary-line border-t-primary rounded-full animate-spin" />
      {label}
    </div>
  )
}

/** โครงร่างระหว่างโหลด — ใช้แทน Spinner ในการ์ดที่รู้รูปร่างล่วงหน้า */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('block bg-track rounded-lg animate-shimmer', className)} />
}

/** แถวโครงร่างหลายบรรทัด + ข้อความสำหรับ screen reader */
export function SkeletonRows({ rows = 4, label = 'กำลังโหลด…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 py-1">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-[32%] shrink-0" />
          <Skeleton className="h-3 grow" />
        </div>
      ))}
    </div>
  )
}

/** โหลดไม่สำเร็จ + ปุ่มลองใหม่ */
export function ErrorState({ message = 'โหลดข้อมูลไม่สำเร็จ', error, onRetry }: { message?: string; error?: unknown; onRetry?: () => void }) {
  const detail = error instanceof Error ? error.message : undefined
  return (
    <div role="alert" className="bg-warn-soft border border-warn/20 rounded-tile p-4 flex flex-wrap items-center justify-between gap-3">
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-warn-deep">{message}</span>
        {detail && <span className="text-[13px] text-warn-ink break-words">{detail}</span>}
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={cx(btn.secondary, 'min-h-11')}>
          ลองใหม่
        </button>
      )}
    </div>
  )
}

/** ยังไม่มีข้อมูล + ทางไปต่อ */
export function EmptyState({ title, desc, action, icon }: { title: ReactNode; desc?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="bg-white border border-dashed border-line-strong rounded-card px-6 py-10 flex flex-col items-center text-center gap-3">
      {icon && <span className="w-12 h-12 rounded-tile bg-primary-soft text-primary flex items-center justify-center">{icon}</span>}
      <h2 className="m-0 text-xl font-bold">{title}</h2>
      {desc && <p className="m-0 text-muted max-w-md leading-relaxed">{desc}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** แสดงเมื่อยังไม่มีผลประเมิน */
export function NeedAssessment() {
  return (
    <EmptyState
      icon={<Sparkle />}
      title="ยังไม่มีผลประเมิน"
      desc={`ทำแบบประเมิน ${QUESTION_COUNT} ข้อ (ประมาณ 10–15 นาที) เพื่อให้โมเดล ML จัดอันดับอาชีพ วิเคราะห์ Skill Gap และสร้าง Roadmap ให้คุณ`}
      action={
        <Link to="/assessment" className={btn.primary}>
          เริ่มประเมิน <ArrowRight />
        </Link>
      }
    />
  )
}

export function PageHead({ eyebrow, title, desc, right }: { eyebrow?: ReactNode; title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between items-end gap-3">
      <div className="flex flex-col gap-1.5 min-w-0">
        {eyebrow && <span className="text-sm text-muted">{eyebrow}</span>}
        <h1 className="m-0 text-[28px] sm:text-[32px] font-bold leading-tight">{title}</h1>
        {desc && <p className="m-0 text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  )
}

/** วงแหวน % บนพื้นเข้ม (hero) */
export function Ring({ value, size = 112, color = '#4ade80', label }: { value: number; size?: number; color?: string; label: string }) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${Math.round(value)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={10} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize={size / 4.4} fontWeight={700}>
        {Math.round(value)}%
      </text>
    </svg>
  )
}
