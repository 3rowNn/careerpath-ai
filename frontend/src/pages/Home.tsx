import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Grad, Search, Sparkle, Sparkles } from '../components/icons'
import { btn, cx } from '../components/ui'
import questionsJson from '../data/questions.json'
import { QUESTION_COUNT, SECTION_META } from '../lib/labels'
import { useResult } from '../lib/useResult'

/* ---------- ข้อมูลที่คำนวณจากไฟล์จริง (ไม่พิมพ์ตัวเลขเอง) ---------- */

/** จำนวนข้อต่อหมวดของแบบประเมิน */
const SECTIONS = Object.entries(
  (questionsJson as { section: string }[]).reduce<Record<string, number>>((m, q) => ((m[q.section] = (m[q.section] ?? 0) + 1), m), {}),
).map(([s, n]) => ({ name: SECTION_META[s]?.short ?? s, n }))

const STEPS: [string, string, ReactNode][] = [
  [
    'รู้จักตัวเอง',
    `ตอบ ${QUESTION_COUNT} ข้อใน ${SECTIONS.length} หมวด เรื่องสิ่งที่ถนัด สิ่งที่ชอบทำ และนิสัยการทำงาน — ไม่มีถูกผิด ไม่ต้องรู้ศัพท์เทคนิค`,
    <ol key="s" className="m-0 p-0 list-none flex flex-col gap-1.5 text-sm">
      {SECTIONS.map((s) => (
        <li key={s.name} className="flex justify-between gap-2">
          <span className="text-ink-2">{s.name}</span>
          <span className="text-muted tabular-nums">{s.n} ข้อ</span>
        </li>
      ))}
    </ol>,
  ],
  [
    'เจออาชีพที่ใกล้คุณ',
    'โมเดล ML เทียบคำตอบกับ 910 อาชีพทุกสาย แล้วจัดอันดับ 5 อาชีพที่เหมาะ พร้อมบอกเหตุผลว่าทำไม',
    <span key="r" className="text-sm text-muted">
      + อาชีพใกล้เคียง · อาชีพในสายที่เรียนจบ
    </span>,
  ],
  [
    'รู้ว่าต้องพัฒนาอะไร',
    'เห็นทักษะที่ยังขาดสำหรับอาชีพที่สนใจ เรียงตามความสำคัญ แล้วได้ Roadmap ว่าควรเริ่มตรงไหน',
    <span key="g" className="text-sm text-muted">
      + ถาม AI Advisor ต่อได้ว่าผลแต่ละข้อหมายความว่าอะไร
    </span>,
  ],
]

const AUDIENCE: [ReactNode, string, string][] = [
  [<Grad key="g" />, 'เรียนจบแล้ว ยังไม่มีงาน', 'รู้ว่าอาชีพไหนเข้ากับทักษะและนิสัยที่มีอยู่ตอนนี้ และควรเติมอะไรก่อนเริ่มสมัครงาน'],
  [<Search key="s" size={28} />, 'ไม่รู้ว่าตัวเองเก่งอะไร', 'ตอบเรื่องสิ่งที่ชอบทำและนิสัยของตัวเอง แล้วให้โมเดลชี้จุดแข็งที่ตรงกับงานจริง'],
  [<Sparkles key="w" size={28} />, 'ไม่รู้ว่าอยากเป็นอะไร', 'เห็นอาชีพที่ใกล้เคียงจาก 910 อาชีพทุกสาย รวมถึงอาชีพที่อาจไม่เคยรู้จักมาก่อน'],
]

/* ---------- ค่อย ๆ ปรากฏเมื่อเลื่อนถึง (ปิดเองเมื่อ prefers-reduced-motion ผ่าน CSS) ---------- */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    el.style.opacity = '0'
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        el.style.opacity = ''
        el.style.animationDelay = `${delay}ms`
        el.classList.add('animate-fade-up')
        io.disconnect()
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [delay])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

const Container = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('max-w-[1200px] mx-auto px-4 sm:px-6', className)}>{children}</div>
)

const SectionHead = ({ eyebrow, title, desc, dark }: { eyebrow?: string; title: ReactNode; desc?: ReactNode; dark?: boolean }) => (
  <div className="flex flex-col gap-3 max-w-[720px]">
    {eyebrow && <span className={cx('text-sm font-semibold', dark ? 'text-primary-mid' : 'text-primary')}>{eyebrow}</span>}
    <h2 className="m-0 text-[28px] sm:text-[34px] font-bold leading-tight tracking-tight">{title}</h2>
    {desc && <p className={cx('m-0 text-[17px] leading-relaxed', dark ? 'text-on-dark' : 'text-muted')}>{desc}</p>}
  </div>
)

/* ---------- การ์ดใน hero: มีผลแล้ว = Top 5 ของผู้ใช้เอง · ยังไม่มี = สิ่งที่จะได้ (ไม่แสดงผลของผู้ใช้ตัวอย่าง) ---------- */
function HeroCard() {
  const { result, isSample } = useResult()
  if (isSample) {
    const steps: [string, string, string][] = [
      ['🎯', 'Top 5 อาชีพที่เข้ากับคุณ', 'จาก 910 อาชีพทุกสาย พร้อมเหตุผลรายคำถาม'],
      ['📊', 'Skill Gap', 'ทักษะที่ยังขาด เรียงตามความสำคัญ'],
      ['🗺️', 'Roadmap การเรียนรู้', 'ทำทีละขั้น แล้วประเมินซ้ำดูพัฒนาการ'],
      ['💬', 'AI Advisor', 'ถามต่อได้ อธิบายจากผลของโมเดล'],
    ]
    return (
      <div className="relative">
        <div aria-hidden className="absolute -inset-4 rounded-[28px] bg-primary/10 blur-2xl" />
        <div className="relative bg-white border border-line rounded-card shadow-pop p-5 sm:p-6 flex flex-col gap-4">
          <span className="font-semibold">หลังทำแบบประเมิน คุณจะได้</span>
          <ol className="m-0 p-0 list-none flex flex-col gap-2">
            {steps.map(([icon, t, d], i) => (
              <li key={t} className="flex items-center gap-3 rounded-control px-3 py-2.5 bg-page animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${200 + i * 90}ms` }}>
                <span className="w-10 h-10 shrink-0 rounded-xl bg-white border border-line flex items-center justify-center text-[20px]" aria-hidden="true">
                  {icon}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="font-medium text-[15px]">{t}</span>
                  <span className="text-xs text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <Link to="/assessment" className={cx(btn.primary, 'justify-center')}>
            เริ่มเลย <ArrowRight />
          </Link>
        </div>
      </div>
    )
  }
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-4 rounded-[28px] bg-primary/10 blur-2xl" />
      <div className="relative bg-white border border-line rounded-card shadow-pop p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex justify-between items-start gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">ผลล่าสุดของคุณ</span>
            <span className="text-[13px] text-muted">เรียงตามความเหมาะโดยรวม</span>
          </span>
          <Link to="/careers" className="text-sm font-semibold shrink-0">
            ดูทั้งหมด →
          </Link>
        </div>
        <ol className="m-0 p-0 list-none flex flex-col gap-2">
          {result.careers.map((c, i) => (
            <li key={c.code}>
              <Link
                to={`/careers/${encodeURIComponent(c.code)}`}
                className={cx('flex items-center gap-3 rounded-control px-3 py-2.5 no-underline !text-ink hover:ring-2 hover:ring-primary-line', i === 0 ? 'bg-primary-soft' : 'bg-page')}
              >
                <span
                  className={cx(
                    'w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-[13px] font-bold',
                    i === 0 ? 'bg-primary text-white' : 'bg-white text-ink-2 border border-line',
                  )}
                >
                  {c.rank}
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="font-medium text-[15px] truncate">{c.title}</span>
                  <span className="text-xs text-muted truncate">{c.title_en}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[11px] text-muted leading-tight">ทักษะครอบคลุม</span>
                  <span className="font-bold text-primary tabular-nums">{c.skill_coverage_percent}%</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** ปุ่มรองใน hero: มีผลแล้วไปดูผล · ยังไม่มีไปสำรวจอาชีพ */
function SecondaryCta() {
  const { isSample } = useResult()
  return isSample ? (
    <Link to="/explore" className={btn.secondary}>
      สำรวจอาชีพทั้งหมด
    </Link>
  ) : (
    <Link to="/careers" className={btn.secondary}>
      ดูผลของฉัน
    </Link>
  )
}

export default function Home() {
  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="bg-hero border-b border-line overflow-hidden">
        <Container className="py-14 sm:py-24 flex flex-wrap gap-12 lg:gap-16 items-center">
          <div className="flex-[1_1_480px] min-w-0 flex flex-col gap-6 animate-fade-up">
            <span className="self-start inline-flex items-center gap-2 text-sm font-semibold text-primary bg-white border border-primary-line px-3.5 py-1.5 rounded-full shadow-card">
              <Sparkle size={16} />
              แนะนำอาชีพด้วย Machine Learning · 910 อาชีพทุกสาย
            </span>
            <h1 className="m-0 text-[36px] sm:text-[52px] leading-[1.15] font-bold tracking-tight">
              ยังไม่รู้ว่าอยากทำ<span className="whitespace-nowrap">อาชีพอะไร?</span>
              <br />
              <span className="text-primary">เริ่มจากรู้จักตัวเอง</span>
            </h1>
            <p className="m-0 text-lg leading-relaxed text-muted max-w-[560px]">
              ตอบคำถามเกี่ยวกับสิ่งที่คุณถนัด สิ่งที่ชอบทำ และนิสัยการทำงาน แล้วระบบจะเทียบกับ 910 อาชีพ บอกว่าอาชีพไหนใกล้คุณ
              ยังขาดทักษะอะไร และควรเริ่มพัฒนาตรงไหน
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/assessment" className={btn.primary}>
                เริ่มทำแบบประเมิน <ArrowRight />
              </Link>
              <SecondaryCta />
            </div>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
              {[`${QUESTION_COUNT} ข้อ · ไม่มีจำกัดเวลา`, 'ไม่ต้องสมัครก็ลองได้', 'ไม่มีคำตอบถูกหรือผิด'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check size={16} className="text-good" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-[1_1_400px] min-w-0 animate-fade-up [animation-delay:120ms]">
            <HeroCard />
          </div>
        </Container>
      </section>

      {/* ---------------- Audience ---------------- */}
      <Container className="py-20 flex flex-col gap-10">
        <Reveal>
          <SectionHead eyebrow="สำหรับใคร" title="ไม่ต้องรู้คำตอบมาก่อน" desc="เว็บนี้ทำมาเพื่อคนที่ยังไม่มีทิศทาง — ทุกสายอาชีพสำคัญเท่ากัน ไม่ว่าจะเป็นงานบริการ งานช่าง งานดูแลคน หรืองานสำนักงาน" />
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
          {AUDIENCE.map(([icon, t, d], i) => (
            <Reveal key={t} delay={i * 80}>
              <div className="h-full bg-white border border-line rounded-card shadow-card p-7 flex flex-col gap-3 transition-[box-shadow,transform] duration-200 hover:shadow-lift hover:-translate-y-0.5">
                <span className="w-12 h-12 rounded-tile bg-primary-soft text-primary flex items-center justify-center">{icon}</span>
                <h3 className="m-0 text-[19px]">{t}</h3>
                <p className="m-0 text-muted leading-relaxed">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>

      {/* ---------------- How it works ---------------- */}
      <section className="bg-white border-y border-line">
        <Container className="py-20 flex flex-col gap-10">
          <Reveal>
            <SectionHead eyebrow="ใช้งานยังไง" title="3 ขั้น จากไม่รู้ทาง สู่รู้ว่าต้องทำอะไรต่อ" />
          </Reveal>
          <ol className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
            {STEPS.map(([t, d, extra], i) => (
              <Reveal key={t} delay={i * 80} className="h-full">
                <li className="h-full relative border border-line rounded-card p-6 flex flex-col gap-3 bg-page">
                  <span className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">{i + 1}</span>
                  <h3 className="m-0 text-[19px]">{t}</h3>
                  <p className="m-0 text-muted leading-relaxed">{d}</p>
                  <div className="mt-auto pt-3 border-t border-line">{extra}</div>
                </li>
              </Reveal>
            ))}
          </ol>
          <Reveal>
            <Link to="/assessment" className={btn.primary}>
              เริ่มขั้นที่ 1 <ArrowRight />
            </Link>
          </Reveal>
        </Container>
      </section>

      {/* ---------------- Transparency ---------------- */}
      <Container className="py-20">
        <Reveal>
          <div className="bg-white border border-line rounded-card shadow-card p-6 sm:p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-primary">ข้อมูลมาจากไหน</span>
              <h2 className="m-0 text-[22px] font-bold leading-snug">โปร่งใสกับสิ่งที่ระบบรู้และไม่รู้</h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-6">
              {[
                ['ข้อมูลอาชีพ', 'O*NET ฐานข้อมูลอาชีพของสหรัฐฯ — ทักษะ ความสนใจ งานที่ทำ และนิสัย ของ 910 อาชีพ'],
                ['ชื่อภาษาไทย', 'ชื่ออาชีพและสาขาภาษาไทยแปลโดย AI ไม่ใช่ชื่อทางการ'],
                ['ผลลัพธ์', 'เป็นข้อมูลประกอบการตัดสินใจ ไม่ใช่คำตัดสิน — ยังไม่มีข้อมูลเงินเดือนหรือความต้องการตลาดไทย'],
              ].map(([t, d]) => (
                <div key={t} className="flex flex-col gap-1.5 border-l-2 border-primary-line pl-4">
                  <span className="font-semibold">{t}</span>
                  <span className="text-sm text-muted leading-relaxed">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Container>

      {/* ---------------- CTA ---------------- */}
      <Container className="pb-20">
        <Reveal>
          <div className="relative overflow-hidden bg-primary text-white rounded-[20px] p-8 sm:p-12 flex flex-wrap gap-6 items-center justify-between shadow-pop">
            <div aria-hidden className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-white/10" />
            <div aria-hidden className="absolute right-24 -bottom-32 w-64 h-64 rounded-full bg-white/5" />
            <div className="relative flex flex-col gap-2 flex-[1_1_400px]">
              <h2 className="m-0 text-[26px] sm:text-[32px] font-bold">อนาคตเริ่มจากรู้จักตัวเอง</h2>
              <p className="m-0 text-white/85">
                ทำแบบประเมิน {SECTIONS.length} หมวด {QUESTION_COUNT} ข้อ แล้วดูผลได้ทันที — ไม่ต้องสมัครสมาชิก
              </p>
            </div>
            <Link to="/assessment" className={cx(btn.light, 'relative')}>
              เริ่มทำแบบประเมิน <ArrowRight />
            </Link>
          </div>
        </Reveal>
      </Container>
    </>
  )
}
