import { useMemo, useState } from 'react'
import { NeedAssessment } from '../components/NeedAssessment'
import { Link } from 'react-router-dom'
import { Main } from '../components/Layout'
import { Badge, btn, Card, Chip, cx, ErrorState, GapBar, GapLegend, Ring, SectionTitle, SkeletonRows } from '../components/ui'
import { categoryOf, SKILL_CATEGORY_LABEL, type SkillCategory } from '../lib/labels'
import { useSkillGap } from '../lib/queries'
import { NEAR, statusOf, tiersOf, type SkillStatus } from '../lib/skills'
import { useResult } from '../lib/useResult'

type Status = SkillStatus
const STATUS: Record<Status, { label: string; desc: string; tone: 'good' | 'primary' | 'warn'; text: string; icon: string; seg: string; stripe: string; soft: string }> = {
  strong: { label: 'ถึงเกณฑ์แล้ว', desc: 'คะแนนของคุณถึงหรือเกินระดับที่อาชีพนี้ต้องการ — เป็นจุดแข็ง', tone: 'good', text: 'text-good', icon: '💪', seg: 'bg-[#4ade80]', stripe: 'bg-good', soft: 'bg-good-soft' },
  near: { label: 'ขาดอีกนิด', desc: `ต่ำกว่าที่ต้องการไม่เกิน ${NEAR} คะแนน (ราว 1 ระดับคำตอบ)`, tone: 'primary', text: 'text-primary', icon: '🎯', seg: 'bg-[#93c5fd]', stripe: 'bg-primary', soft: 'bg-primary-soft' },
  missing: { label: 'ยังห่างมาก', desc: `ต่ำกว่าที่ต้องการเกิน ${NEAR} คะแนน — ควรเริ่มฝึกก่อน`, tone: 'warn', text: 'text-warn', icon: '🚧', seg: 'bg-[#fdba74]', stripe: 'bg-warn', soft: 'bg-warn-soft' },
}
const MEDAL = ['🥇', '🥈', '🥉']

/** ลำดับการแสดงในรายการ: ที่ต้องฝึกก่อนอยู่บน */
const ORDER: Status[] = ['missing', 'near', 'strong']

export default function SkillGap() {
  const { isSample } = useResult()
  return isSample ? (
    <NeedAssessment icon="📊" title="ยังไม่มี Skill Gap ของคุณ" desc="Skill Gap เทียบทักษะของคุณกับระดับที่อาชีพต้องการ จึงต้องรู้ทักษะของคุณจากแบบประเมินก่อน" />
  ) : (
    <SkillGapBody />
  )
}

function SkillGapBody() {
  const { target, isGoal } = useResult()
  const q = useSkillGap(target.code)
  const [cat, setCat] = useState<'all' | SkillCategory>('all')
  const [status, setStatus] = useState<'all' | Status>('all')

  const all = useMemo(() => q.data?.all ?? [], [q.data])
  const tiers = useMemo(() => tiersOf(all), [all])
  const counts = useMemo(() => {
    const c = { strong: 0, near: 0, missing: 0 }
    for (const r of all) c[statusOf(r)]++
    return c
  }, [all])

  const rows = useMemo(
    () =>
      all
        .filter((r) => cat === 'all' || categoryOf(r.feature) === cat)
        .filter((r) => status === 'all' || statusOf(r) === status)
        .sort((a, b) => b.priority - a.priority || b.required - a.required),
    [all, cat, status],
  )
  // นับตามสถานะในหมวดที่เลือก (ตัวเลขบนปุ่มสถานะ)
  const catCounts = useMemo(() => {
    const c = { strong: 0, near: 0, missing: 0 }
    for (const r of all) if (cat === 'all' || categoryOf(r.feature) === cat) c[statusOf(r)]++
    return c
  }, [all, cat])
  const catTotal = catCounts.strong + catCounts.near + catCounts.missing

  const first = q.data?.top_priorities[0]

  // คำอธิบายตัวกรองที่ใช้อยู่ เช่น ' ในหมวด "คิดวิเคราะห์และเทคนิค" · สถานะ "ขาดอีกนิด"'
  const filterNote = `${cat !== 'all' ? ` ในหมวด "${SKILL_CATEGORY_LABEL[cat]}"` : ''}${status !== 'all' ? ` · สถานะ "${STATUS[status].label}"` : ''}`

  const reset = () => {
    setCat('all')
    setStatus('all')
  }

  return (
    <Main>
      <section className="relative overflow-hidden rounded-[22px] px-5 py-7 sm:px-9 sm:py-9 text-white bg-[linear-gradient(135deg,#1e1b4b_0%,#2747D0_60%,#0ea5e9_130%)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-4 -bottom-12 text-[170px] opacity-10 rotate-[8deg]">
          📊
        </div>
        <div className="relative flex flex-wrap gap-7 items-center">
          <div className="flex flex-col gap-3 flex-[1_1_380px] min-w-0">
            <span className="text-sm font-semibold text-white/75">
              📊 Skill Gap · {isGoal ? `อาชีพที่คุณเลือกเอง · อันดับ ${target.rank} จาก 910` : `อาชีพเป้าหมาย · อันดับ ${target.rank}`}
            </span>
            <h1 className="m-0 text-[28px] sm:text-[36px] leading-tight font-bold">{target.title}</h1>
            <p className="m-0 text-white/85 leading-relaxed">เทียบทักษะของคุณกับระดับที่อาชีพนี้ต้องการ ใน 30 กลุ่มทักษะ</p>
            {all.length > 0 && (
              <div className="flex flex-col gap-2">
                {/* แถบ 30 ช่อง = 30 กลุ่มทักษะ เรียงจากจุดแข็ง → ยังขาด */}
                <div className="flex gap-[3px]" role="img" aria-label={`ถึงเกณฑ์แล้ว ${counts.strong} ขาดอีกนิด ${counts.near} ยังห่างมาก ${counts.missing} จาก ${all.length} กลุ่มทักษะ`}>
                  {(['strong', 'near', 'missing'] as Status[]).flatMap((st) =>
                    Array.from({ length: counts[st] }, (_, i) => <span key={st + i} className={cx('h-3 flex-1 rounded-sm', STATUS[st].seg)} />),
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/85">
                  {(Object.keys(STATUS) as Status[]).map((st) => (
                    <span key={st} className="inline-flex items-center gap-1.5">
                      <span className={cx('w-2.5 h-2.5 rounded-sm', STATUS[st].seg)} />
                      {STATUS[st].label} {counts[st]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <Ring value={target.skill_coverage_percent} color="#93c5fd" label="ทักษะครอบคลุม" />
            <span className="text-[12px] text-white/75">ทักษะครอบคลุม</span>
          </div>
        </div>
      </section>

      {/* ---------- อาชีพเป้าหมาย (เปลี่ยนได้ที่หน้าอาชีพที่แนะนำ) ---------- */}
      <section aria-label="อาชีพเป้าหมาย" className="flex flex-wrap items-center gap-2">
        <Badge className="min-h-10 px-3.5 text-sm">{isGoal ? '★ อาชีพที่อยากเป็น' : '🎯 อาชีพเป้าหมาย'}: {target.title}</Badge>
        <Link to="/careers" className={cx(btn.ghost, 'min-h-10 text-sm')}>
          เปลี่ยนอาชีพที่หน้าอาชีพที่แนะนำ
        </Link>
      </section>

      {!q.data ? (
        q.isError ? (
          <ErrorState message="โหลด Skill Gap ไม่สำเร็จ" error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <SkeletonRows rows={6} label="กำลังวิเคราะห์ Skill Gap…" />
        )
      ) : (
        <>
          {first && (
            <section aria-labelledby="first-title" className="bg-ink text-white rounded-card p-5 sm:p-7 flex flex-col gap-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold text-primary-mid">ตาม Skill Priority</span>
                  <h2 id="first-title" className="m-0 text-[22px]">🚀 ควรเริ่มพัฒนา 3 ทักษะนี้ก่อน</h2>
                </div>
                <Link to="/roadmap" className={btn.light}>
                  สร้าง Roadmap จากทักษะเหล่านี้
                </Link>
              </div>
              <ol className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-3">
                {q.data.top_priorities.slice(0, 3).map((r, i) => (
                  <li key={r.feature}>
                    <div className="h-full rounded-tile bg-white/[0.07] border border-white/15 p-4 flex flex-col gap-2.5 text-white">
                      <span className="flex items-center gap-2">
                        <span className="text-[22px]" aria-hidden="true">{MEDAL[i]}</span>
                        <span className="font-semibold leading-snug">{r.name}</span>
                      </span>
                      <GapBar user={r.user} required={r.required} tone="dark" />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* ---------- ตัวกรอง ---------- */}
          <section aria-label="ตัวกรอง" className="bg-white border border-line rounded-card shadow-card px-5 py-4 flex flex-wrap gap-x-7 gap-y-4 items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-2">หมวดทักษะ</span>
              <Chip on={cat === 'all'} onClick={() => setCat('all')}>
                ทั้งหมด
              </Chip>
              {(Object.keys(SKILL_CATEGORY_LABEL) as SkillCategory[]).map((c) => (
                <Chip key={c} on={cat === c} onClick={() => setCat(c)}>
                  {SKILL_CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-2">แสดง</span>
              <Chip on={status === 'all'} onClick={() => setStatus('all')}>
                ทั้งหมด {catTotal}
              </Chip>
              {ORDER.map((s) => (
                <Chip key={s} on={status === s} onClick={() => setStatus(s)}>
                  {STATUS[s].icon} {STATUS[s].label} {catCounts[s]}
                </Chip>
              ))}
            </div>
            {(cat !== 'all' || status !== 'all') && (
              <button type="button" onClick={reset} className={cx(btn.ghost, 'min-h-10 text-sm')}>
                ล้างตัวกรอง
              </button>
            )}
          </section>

          {/* ---------- รายทักษะ ---------- */}
            <Card className="flex flex-col gap-3">
              <SectionTitle
                title="รายทักษะ"
                desc={`${rows.length} จาก ${all.length} กลุ่มทักษะ${filterNote} · คะแนนเต็ม 100`}
                right={<GapLegend />}
              />
              {rows.length === 0 && <p className="text-muted text-sm m-0 py-6">ไม่มีทักษะตามตัวกรองนี้</p>}
              {ORDER.map((st) => {
                const group = rows.filter((r) => statusOf(r) === st)
                if (!group.length) return null
                return (
                  <section key={st} aria-label={STATUS[st].label} className="flex flex-col gap-2 pt-1">
                    <h3 className={cx('m-0 text-[16px] flex flex-wrap items-baseline gap-x-2', STATUS[st].text)}>
                      {STATUS[st].icon} {STATUS[st].label} {group.length} กลุ่ม
                      <span className="text-[13px] font-normal text-muted">{STATUS[st].desc}</span>
                    </h3>
                    <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(min(100%,400px),1fr))] gap-2">
                      {group.map((r) => (
                        <li key={r.feature} className="relative overflow-hidden flex flex-col gap-1.5 text-ink pl-4 pr-3 py-2.5 rounded-control border border-line bg-white">
                          <span aria-hidden="true" className={cx('absolute left-0 inset-y-0 w-1', STATUS[st].stripe)} />
                          <span className="flex justify-between items-start gap-2 text-[15px]">
                            <span className="font-semibold min-w-0 leading-snug">{r.name}</span>
                            <span className={cx('shrink-0 text-sm font-semibold', STATUS[st].text)}>{st === 'strong' ? 'ถึงเกณฑ์ ✓' : `ขาด ${r.gap.toFixed(0)}`}</span>
                          </span>
                          <GapBar user={r.user} required={r.required} />
                          {tiers[r.feature] === 'high' && <span className="text-[13px] font-semibold text-warn-ink">⭐ สำคัญมากกับอาชีพนี้</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </Card>

          {/* ---------- เครื่องมือ + วิธีคิด ---------- */}
          {q.data.tools_used.length > 0 && (
            <Card className="flex flex-col gap-3">
              <SectionTitle title="เครื่องมือที่อาชีพนี้ใช้" desc="จาก O*NET Software Skills — ไม่ได้ถามในแบบประเมิน ใช้แนะนำใน Roadmap" />
              <div className="flex flex-wrap gap-1.5">
                {q.data.tools_used.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </Card>
          )}

          <details className="bg-white border border-line rounded-card px-5 py-4 text-sm text-ink-2 group">
            <summary className="cursor-pointer font-semibold text-ink min-h-11 flex items-center">จัดกลุ่มและลำดับความสำคัญยังไง</summary>
            <ul className="m-0 mt-2 pl-5 flex flex-col gap-2 leading-relaxed">
              <li>
                คะแนนทักษะ 0–100 มาจากคำตอบ 1–5 ของคุณ (1 = 0, 2 = 25, … 5 = 100) เทียบกับระดับที่อาชีพนี้ต้องการจาก O*NET · นับเฉพาะ 30 กลุ่มทักษะ
                ไม่นับความสนใจ ลักษณะงานที่ชอบ และนิสัย
              </li>
              <li>
                <b>ถึงเกณฑ์แล้ว</b> = คะแนนของคุณถึงระดับที่อาชีพนี้ต้องการ · <b>ขาดอีกนิด</b> = ขาดไม่เกิน {NEAR} คะแนน (ราว 1 ระดับคำตอบ) · <b>ยังห่างมาก</b> = ขาดมากกว่านั้น
              </li>
              <li>
                <b>ลำดับความสำคัญ</b> มาจาก Skill Priority = Gap × (1 + 0.5 × ความสำคัญของทักษะตาม O*NET + 0.5 × ความเฉพาะของทักษะในอาชีพนี้) ในแต่ละสถานะเรียงตามค่านี้ ·
                ⭐ สำคัญมากกับอาชีพนี้ = อยู่ 1 ใน 3 แรกของทักษะที่ยังขาด
              </li>
            </ul>
          </details>
        </>
      )}
    </Main>
  )
}
