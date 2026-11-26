import { useState } from 'react'
import { NeedAssessment } from '../components/NeedAssessment'
import { Link, useNavigate } from 'react-router-dom'
import type { ExplainResult, SkillGapResult } from '../api/types'
import { IS_DEMO } from '../api/client'
import { Main } from '../components/Layout'
import { JobSearch } from '../components/JobSearch'
import { MajorCard } from '../components/MajorCard'
import { ExplainPanel } from '../components/MlExplain'
import { btn, Card, CoverageValue, cx, DemoNote, RankNote, ErrorState, SkeletonRows } from '../components/ui'
import { iconOf, tint } from '../lib/careerVisual'
import { clusterName, majorName, pct, questionOf, SOC_MAJOR } from '../lib/labels'
import { useAllExplains, useAllSkillGaps, useExplain, useSimilar } from '../lib/queries'
import { useApp } from '../lib/store'
import { useResult, useResultTime } from '../lib/useResult'

function ModelBar({ label, value, tone, text, note }: { label: string; value: number; tone: string; text: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm gap-2">
        <span className="text-muted">{label}</span>
        <span className="font-bold tabular-nums">{text}</span>
      </div>
      <div className="h-1.5 bg-line rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
      <span className="text-[12px] text-muted leading-snug">{note}</span>
    </div>
  )
}

/* เหตุผลหลัก 2 ข้อจาก explain() (① แยกคะแนนรายคำถาม) — บอกว่าทำไมอาชีพนี้ได้อันดับนี้ ไม่ใช่ % ทักษะครอบคลุม */
function Reasons({ e }: { e?: ExplainResult }) {
  if (!e) return null
  const top = e.positive.filter((r) => r.contribution > 0).slice(0, 2)
  if (!top.length) return null
  return (
    <span className="text-[13px] text-ink-2 leading-snug line-clamp-2">
      <span className="text-primary font-semibold">เหตุผลหลัก: </span>
      {top.map((r) => questionOf(r.feature, r.name)).join(' · ')}
    </span>
  )
}

export default function Careers() {
  const { isSample } = useResult()
  return isSample ? (
    <NeedAssessment icon="💼" title="ยังไม่มีอาชีพที่แนะนำสำหรับคุณ" desc="หลังทำแบบประเมิน โมเดล ML จะจับคู่คำตอบของคุณกับ 910 อาชีพ แล้วแสดง 5 อาชีพที่เข้ากับคุณที่สุด พร้อมเหตุผลรายคำถาม" />
  ) : (
    <CareersBody />
  )
}

function CareersBody() {
  const { result, isSample, target } = useResult()
  const resultTime = useResultTime()
  const { setTarget, user } = useApp()
  const nav = useNavigate()
  const [selCode, setSel] = useState(target.code)
  const sel = result.careers.find((c) => c.code === selCode) ?? result.careers[0]

  const gapsQ = useAllSkillGaps(result.careers.map((c) => c.code))
  const gaps = gapsQ.map((q) => q.data).filter(Boolean) as SkillGapResult[]
  const selGap = gaps.find((g) => g.code === sel.code)
  const gapsError = gapsQ.find((q) => q.isError)?.error
  const retryGaps = () => gapsQ.forEach((q) => q.isError && q.refetch())
  const similar = useSimilar(sel.code)
  const explain = useExplain(sel.code)
  const explains = useAllExplains(result.careers.map((c) => c.code))

  const strong = selGap ? selGap.all.filter((r) => r.gap === 0 && r.required >= 30).sort((a, b) => b.required - a.required).slice(0, 5) : []
  const missing = selGap?.top_priorities.slice(0, 5) ?? []

  const goGap = () => {
    setTarget(sel.code)
    nav('/skill-gap')
  }

  return (
    <Main className="gap-7">
      <section className="relative overflow-hidden rounded-[22px] px-5 py-7 sm:px-9 sm:py-9 text-white bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_55%,#2747D0_110%)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
          {['💼', '📄', '🤝', '🏢', '✅'].map((e, i) => (
            <span
              key={e}
              className="absolute text-[36px] opacity-20 animate-float motion-reduce:animate-none"
              style={{ right: `${5 + (i % 3) * 10}%`, top: `${14 + Math.floor(i / 3) * 46 + (i % 2) * 8}%`, animationDelay: `${i * 0.7}s` }}
            >
              {e}
            </span>
          ))}
        </div>
        <div className="relative flex flex-col gap-3 max-w-[680px]">
          <span className="text-sm font-semibold text-white/75 flex items-center gap-2">
            💼 กระดานงานที่แมตช์กับคุณ <DemoNote className="!text-ink" />
          </span>
          <h1 className="m-0 text-[28px] sm:text-[38px] leading-tight font-bold">
            {result.careers.length} ตำแหน่งที่เข้ากับโปรไฟล์ของคุณ
          </h1>
          <p className="m-0 text-white/85 leading-relaxed">
            โมเดล ML จับคู่คำตอบของคุณกับ 910 อาชีพ (Ensemble ของ Cosine Matching + MLP Classifier) — เลือกตำแหน่งเพื่อดูว่าคุณมีคุณสมบัติอะไรแล้ว
            และต้องเพิ่มอะไรก่อนลงสนามจริง
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-[13px] px-3 py-1.5 rounded-full bg-white/15 border border-white/20">
              🥇 แมตช์อันดับ 1: <b>{result.careers[0].title}</b>
            </span>
            {result.major_groups[0] && (
              <span className="text-[13px] px-3 py-1.5 rounded-full bg-white/15 border border-white/20">
                🧭 สายงานที่เด่น: <b>{SOC_MAJOR[result.major_groups[0].major] ?? result.major_groups[0].major}</b>
              </span>
            )}
          </div>
          {resultTime && (
            <span className="text-[13px] text-white/85">
              📋 ผลจากแบบประเมินเมื่อ <b>{resultTime}</b> ·{' '}
              <Link to="/assessment" className="!text-white underline underline-offset-4">
                ทำแบบประเมินใหม่
              </Link>
            </span>
          )}
          <span className="text-[12px] text-white/60">อาชีพจากฐานข้อมูล O*NET (สหรัฐฯ) — เป็นแนวทางอาชีพ ไม่ใช่ประกาศรับสมัครงานจริง</span>
        </div>
      </section>
      {!isSample && !IS_DEMO && !user && (
        <Card className="!py-4 flex flex-wrap items-center justify-between gap-3 bg-primary-soft border-primary-line">
          <p className="m-0 text-sm text-ink-2 leading-relaxed flex-[1_1_320px]">
            ผลนี้เก็บไว้ในเบราว์เซอร์นี้เท่านั้น — <b>สมัครสมาชิกเพื่อบันทึกเข้าบัญชี</b> ดูประวัติการประเมินและ Roadmap ได้ทุกเครื่อง (ระบบย้ายผลนี้ให้อัตโนมัติ)
          </p>
          <div className="flex gap-2">
            <Link to="/login?mode=register&next=/careers" className={btn.primary}>
              สมัครเพื่อบันทึกผล
            </Link>
            <Link to="/login?next=/careers" className={btn.ghost}>
              มีบัญชีแล้ว
            </Link>
          </div>
        </Card>
      )}

      {/* จอใหญ่: รายการซ้าย รายละเอียดขวา · จอเล็ก: รายละเอียดก่อน (เลือกอาชีพด้วยแถบด้านบนของการ์ด แทนที่เนื้อหาเดิม) */}
      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label="Top 5 อาชีพ" className="order-2 lg:order-1 min-w-0 flex flex-col gap-2.5">
          <div className="hidden lg:flex flex-col gap-2.5">
          <RankNote />
          {result.careers.map((c, i) => {
            const on = c.code === sel.code
            return (
              <button
                key={c.code}
                type="button"
                aria-pressed={on}
                onClick={() => setSel(c.code)}
                className={cx(
                  'group relative flex gap-3.5 items-start w-full p-4 rounded-xl bg-white text-left text-ink transition-[transform,box-shadow,border-color] duration-150 animate-fade-up motion-reduce:animate-none',
                  on
                    ? 'border-2 border-primary shadow-lift'
                    : 'border border-line m-px hover:border-primary-mid hover:-translate-y-0.5 hover:shadow-lift',
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="relative w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-[24px] transition-transform group-hover:scale-105" style={tint(c.code.slice(0, 2))} aria-hidden="true">
                  {iconOf(c.code)}
                  <span className="absolute -top-2 -left-2 min-w-6 h-6 px-1 rounded-full bg-ink text-white text-[12px] font-bold flex items-center justify-center">
                    {c.rank}
                  </span>
                </span>
                <span className="flex-1 flex flex-col gap-2 min-w-0">
                  {c.rank === 1 && (
                    <span className="self-start text-[12px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">🔥 แมตช์ที่สุด</span>
                  )}
                  <span className="flex justify-between gap-2">
                    <span className="font-semibold truncate">{c.title}</span>
                    <CoverageValue value={c.skill_coverage_percent} />
                  </span>
                  <span className="block h-2 bg-line rounded-full overflow-hidden">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${c.skill_coverage_percent}%` }} />
                  </span>
                  <span className="text-[13px] text-muted truncate">
                    🏢 {majorName(c.code)} · {c.title_en}
                  </span>
                  <Reasons e={explains[i]?.data} />
                </span>
              </button>
            )
          })}
          </div>

          <Link
            to="/goal"
            className="mt-2 flex items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-primary-line bg-primary-soft no-underline !text-ink hover:border-primary"
          >
            <span className="flex flex-col">
              <span className="font-semibold">🎯 มีตำแหน่งในใจอยู่แล้ว?</span>
              <span className="text-sm text-muted">เลือกจาก 910 อาชีพ แล้วดูว่าต้องพัฒนาอะไรจึงจะใกล้ขึ้น</span>
            </span>
            <span className="text-primary font-semibold shrink-0">เลือกอาชีพ →</span>
          </Link>
        </section>

        <Card className="order-1 lg:order-2 min-w-0 !p-5 sm:!p-7 flex flex-col gap-5">
          {/* จอเล็ก: เลือกอาชีพที่นี่ — เนื้อหาด้านล่างเปลี่ยนแทนที่ ไม่ต่อท้าย */}
          <div className="lg:hidden flex flex-col gap-2 -mx-1">
            <div role="tablist" aria-label="เลือกอาชีพใน Top 5" className="flex gap-2 overflow-x-auto snap-x px-1 pb-1">
              {result.careers.map((c) => {
                const on = c.code === sel.code
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSel(c.code)}
                    className={cx(
                      'snap-start shrink-0 w-[200px] text-left rounded-xl border p-3 flex flex-col gap-1',
                      on ? 'border-2 border-primary bg-primary-soft' : 'border-line bg-white',
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-ink text-white text-[12px] font-bold flex items-center justify-center">{c.rank}</span>
                      <span className="font-semibold text-[14px] truncate">{c.title}</span>
                    </span>
                    <CoverageValue value={c.skill_coverage_percent} />
                  </button>
                )
              })}
            </div>
            <RankNote />
          </div>

          <div className="flex flex-wrap justify-between gap-4 items-start">
            <div className="flex gap-4 items-start min-w-0 flex-[1_1_300px]">
              <span className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-[34px]" style={tint(sel.code.slice(0, 2))} aria-hidden="true">
                {iconOf(sel.code)}
              </span>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[13px] text-muted">
                📋 รายละเอียดตำแหน่ง · แมตช์อันดับ {sel.rank}
              </span>
              <h2 className="m-0 text-[26px] leading-tight">{sel.title}</h2>
              <span className="flex flex-wrap gap-1.5">
                <span className="text-[12px] font-medium px-2 py-0.5 rounded-full" style={tint(sel.code.slice(0, 2))}>
                  🏢 สายงาน: {majorName(sel.code)}
                </span>
                <span className="text-[12px] px-2 py-0.5 rounded-full bg-page text-ink-2">
                  {sel.title_en} · {sel.code}
                </span>
              </span>
              {!IS_DEMO && (
                <Link to={`/careers/${encodeURIComponent(sel.code)}`} className="text-sm font-semibold self-start">
                  ดูรายละเอียดอาชีพ →
                </Link>
              )}
            </div>
            </div>
            <div className="text-right">
              <span className="text-4xl font-bold text-primary">{sel.skill_coverage_percent}%</span>
              <br />
              <span className="text-[13px] text-muted">ทักษะครอบคลุม</span>
            </div>
          </div>

          {/* รายละเอียดเชิงเทคนิค — พับไว้ ผู้ใช้ทั่วไปไม่จำเป็นต้องเห็น */}
          <details className="group/ml border border-line rounded-xl">
            <summary className="cursor-pointer list-none p-4 text-sm font-semibold flex items-center gap-2">
              <span className="transition-transform group-open/ml:rotate-90">▸</span> 🔬 ดูการทำงานของโมเดล
              <span className="font-normal text-muted">(สำหรับผู้สนใจเทคนิค)</span>
            </summary>
            <div className="px-4 pb-4 flex flex-col gap-3">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
                <ModelBar
                  label="① Cosine Matching"
                  value={sel.matching_similarity}
                  text={sel.matching_similarity.toFixed(3)}
                  note="ความคล้ายของโปรไฟล์ (−1 ถึง 1) ไม่ใช่เปอร์เซ็นต์"
                  tone="bg-primary-mid"
                />
                <ModelBar
                  label="②a MLP Classifier"
                  value={sel.classifier_probability}
                  text={pct(sel.classifier_probability, 1)}
                  note="ความน่าจะเป็นที่ทายเป็นอาชีพนี้ จาก 910 อาชีพ"
                  tone="bg-primary"
                />
                <ModelBar
                  label="Ensemble"
                  value={sel.ensemble_score}
                  text={pct(sel.ensemble_score, 1)}
                  note="คะแนนที่ใช้จัดอันดับ (ทั้ง 910 อาชีพรวมกันได้ 100%)"
                  tone="bg-ink"
                />
              </div>
              <p className="m-0 text-[13px] text-muted leading-relaxed">
                <b className="text-ink-2">Ensemble = 0.9 × softmax(Cosine) + 0.1 × MLP</b> — แปลงค่า Cosine ของทั้ง 910 อาชีพเป็นความน่าจะเป็นด้วย
                softmax (T = 0.01) ก่อน แล้วรวมกับความน่าจะเป็นของ MLP จึงคิดจากตัวเลข Cosine ตรง ๆ ไม่ได้ ·
                ③ K-Means จัดอยู่กลุ่ม “{clusterName(sel.cluster)}” · ตัวเลขเหล่านี้ไม่ใช่ % ทักษะครอบคลุม
              </p>
            </div>
          </details>

          {explain.data ? (
            <div className={cx('transition-opacity', explain.isPlaceholderData && 'opacity-40')} aria-busy={explain.isPlaceholderData}>
              <ExplainPanel e={explain.data} />
            </div>
          ) : explain.isError ? (
            <ErrorState message="อธิบายผลไม่สำเร็จ" error={explain.error} onRetry={() => explain.refetch()} />
          ) : (
            <SkeletonRows rows={5} label="กำลังอธิบายผล…" />
          )}

          {!selGap ? (
            gapsError ? (
              <ErrorState message="วิเคราะห์ทักษะไม่สำเร็จ" error={gapsError} onRetry={retryGaps} />
            ) : (
              <SkeletonRows rows={4} label="กำลังวิเคราะห์ทักษะ…" />
            )
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <div className="bg-good-soft rounded-xl p-4 flex flex-col gap-2.5">
                <span className="font-semibold text-good-ink">✅ คุณสมบัติที่คุณมีแล้ว</span>
                <div className="flex flex-wrap gap-1.5">
                  {strong.length ? (
                    strong.map((s) => (
                      <span key={s.feature} className="bg-white text-good-ink text-sm px-2.5 py-1 rounded-full">
                        {s.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-good-ink">—</span>
                  )}
                </div>
              </div>
              <div className="bg-warn-soft rounded-xl p-4 flex flex-col gap-2.5">
                <span className="font-semibold text-warn-ink">📌 คุณสมบัติที่ควรเพิ่มก่อน</span>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map((s) => (
                    <span key={s.feature} className="bg-white text-warn-ink text-sm px-2.5 py-1 rounded-full">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">🔁 ตำแหน่งใกล้เคียง (③ คลัสเตอร์เดียวกัน)</span>
            <div className="flex flex-wrap gap-1.5">
              {similar.isLoading && <span className="text-sm text-muted">กำลังโหลด…</span>}
              {similar.data?.map((s) => (
                IS_DEMO ? (
                  <span key={s.code} className="text-sm bg-page border border-line px-2.5 py-1 rounded-full" title={`ความคล้าย ${pct(s.similarity)}`}>
                    {s.title}
                  </span>
                ) : (
                  <Link
                    key={s.code}
                    to={`/careers/${encodeURIComponent(s.code)}`}
                    className="text-sm bg-page border border-line px-2.5 py-1 rounded-full no-underline !text-ink hover:border-primary hover:!text-primary"
                  >
                    {s.title}
                  </Link>
                )
              ))}
              {similar.data?.length === 0 && <span className="text-sm text-muted">ไม่มีอาชีพอื่นในคลัสเตอร์นี้</span>}
            </div>
          </div>

          <JobSearch key={sel.code} compact titleTh={sel.title} titleEn={sel.title_en} />

          <div className="flex flex-wrap gap-3 items-center pt-4 border-t border-line">
            <button type="button" onClick={goGap} className={btn.primary}>
              📝 เตรียมตัวสู่ตำแหน่งนี้: ตั้งเป้าหมาย &amp; ดู Skill Gap
            </button>
            <Link to={`/advisor?c=new&career=${encodeURIComponent(sel.code)}`} className={btn.secondary}>
              ถาม AI เกี่ยวกับอาชีพนี้
            </Link>
          </div>
        </Card>
      </div>

      <MajorCard />
    </Main>
  )
}
