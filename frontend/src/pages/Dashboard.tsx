import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SkillRow } from '../api/types'
import { HistoryBars, SkillBars } from '../components/charts'
import { ArrowRight, Chat } from '../components/icons'
import { Main } from '../components/Layout'
import { btn, Card, Chip, cx, ErrorState, GapBar, GapLegend, PageHead, Ring, SkeletonRows } from '../components/ui'
import { RIASEC_ICON } from '../lib/careerVisual'
import { categoryOf, questionOf, RIASEC_TH, SKILL_CATEGORY_LABEL, toAnswer, WS_TH, type SkillCategory } from '../lib/labels'
import { useResultAnswers, useSkillGap } from '../lib/queries'
import { statusOf, type SkillStatus } from '../lib/skills'
import { useApp } from '../lib/store'
import { useResult, useResultTime } from '../lib/useResult'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

/** ข้อที่ผู้ใช้ตอบสูงสุดในหมวดหนึ่ง (เฉพาะที่ตอบ 4–5) — answers เป็นคำตอบดิบ 1–5 (ไม่ใช่ 0–100) */
function topOf(answers: Record<string, number>, prefixes: string[]) {
  return Object.entries(answers)
    .filter(([f, v]) => prefixes.some((p) => f.startsWith(p)) && v >= 4)
    .sort((a, b) => b[1] - a[1])
}
const likeText = (f: string) => questionOf(f).replace(/^ชอบ(งาน)?/, '')

function ProfileTile({ icon, title, items, empty }: { icon: string; title: string; items: { key: string; label: string; level: number }[]; empty: string }) {
  return (
    <div className="bg-page rounded-tile p-4 flex flex-col gap-2.5 min-w-0">
      <span className="text-sm font-semibold text-ink-2 flex justify-between gap-2">
        <span>
          {icon} {title}
        </span>
        {items.length > 0 && <span className="font-normal text-muted">{items.length} ข้อ</span>}
      </span>
      {items.length ? (
        <ul tabIndex={0} aria-label={title} className="m-0 p-0 pr-1.5 list-none flex flex-col gap-1.5 max-h-[168px] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-primary rounded">
          {items.map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3 text-[15px]">
              <span className="leading-snug">{it.label}</span>
              <span className="shrink-0 text-[13px] font-semibold text-primary" title="คำตอบของคุณ (1–5)">
                {it.level}/5
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[13px] text-muted leading-snug">{empty}</span>
      )}
    </div>
  )
}

/** คำตอบขั้นต่ำ (1–5) ที่ทำให้คะแนน ((คำตอบ − 1) × 25) ถึงระดับที่ต้องการ — null = เกิน 100 */
const minAnswer = (required: number) => {
  const a = Math.ceil(required / 25 - 1e-9) + 1
  return a <= 5 ? Math.max(a, 1) : null
}

function SkillLine({ r, on, onPick }: { r: SkillRow; on: boolean; onPick: (f: string) => void }) {
  const ok = r.gap <= 0
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onPick(r.feature)}
        className={cx(
          'w-full text-left text-ink flex flex-col gap-1.5 rounded-control border px-3 py-2.5 transition-colors',
          on ? 'border-primary bg-primary-soft' : 'border-transparent bg-white hover:bg-page',
        )}
      >
      <span className="flex justify-between gap-3 text-[15px]">
        <span className="font-semibold leading-snug">{r.name}</span>
        <span className={cx('shrink-0 text-sm font-semibold', ok ? 'text-good' : 'text-warn')}>{ok ? 'ถึงเกณฑ์' : `ขาด ${r.gap.toFixed(0)}`}</span>
      </span>
      <GapBar user={r.user} required={r.required} />
      </button>
    </li>
  )
}

/** ยังไม่มีผลประเมิน → ไม่แสดงผลของผู้ใช้ตัวอย่าง ชวนไปทำแบบประเมินแทน */
export default function Dashboard() {
  const { isSample } = useResult()
  return isSample ? <DashboardEmpty /> : <DashboardBody />
}

function DashboardEmpty() {
  const { user } = useApp()
  return (
    <Main>
      <PageHead title={`สวัสดี${user ? `, ${user.name}` : ''}`} desc="ภาพรวมเส้นทางอาชีพของคุณจะแสดงที่นี่หลังทำแบบประเมิน" />
      <Card className="!p-8 sm:!p-10 flex flex-col items-center text-center gap-5">
        <span className="text-[56px] leading-none" aria-hidden="true">
          🧭
        </span>
        <div className="flex flex-col gap-2 max-w-[520px]">
          <h2 className="m-0 text-[24px]">ยังไม่มีผลประเมินของคุณ</h2>
          <p className="m-0 text-muted leading-relaxed">
            ทำแบบประเมิน 76 ข้อ (ไม่มีจำกัดเวลา ทำต่อทีหลังได้) แล้วหน้านี้จะแสดงอาชีพที่เข้ากับคุณ ทักษะที่ควรพัฒนา
            และความคืบหน้าทุกครั้งที่ประเมินซ้ำ
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/assessment" className={btn.primary}>
            เริ่มทำแบบประเมิน <ArrowRight />
          </Link>
          <Link to="/explore" className={btn.secondary}>
            สำรวจอาชีพทั้งหมดก่อน
          </Link>
        </div>
      </Card>
    </Main>
  )
}

function DashboardBody() {
  const app = useApp()
  const { target, isGoal } = useResult()
  const resultTime = useResultTime()
  const q = useSkillGap(target.code)
  const all = useMemo(() => q.data?.all ?? [], [q.data])

  const counts = useMemo(() => {
    const c: Record<SkillStatus, number> = { strong: 0, near: 0, missing: 0 }
    for (const r of all) c[statusOf(r)]++
    return c
  }, [all])

  // ภาพรวมตัวผู้ใช้จากคำตอบดิบ 1–5 — ไม่ใช่ผลโมเดล
  const answers = useResultAnswers()
  const skillName = useMemo(() => Object.fromEntries(all.map((r) => [r.feature, r.name])), [all])
  const profile = useMemo(
    () => ({
      interests: topOf(answers, ['ri::']).map(([f, v]) => {
        const k = f.slice(4)
        return { key: f, label: `${RIASEC_ICON[k] ?? ''} ${RIASEC_TH[k] ?? k}`, level: v }
      }),
      skills: topOf(answers, ['grp::']).map(([f, v]) => ({ key: f, label: skillName[f] ?? questionOf(f), level: v })),
      work: topOf(answers, ['gtask::', 'task::']).map(([f, v]) => ({ key: f, label: likeText(f), level: v })),
      styles: topOf(answers, ['ws::']).map(([f, v]) => ({ key: f, label: WS_TH[f.slice(4)] ?? questionOf(f), level: v })),
    }),
    [answers, skillName],
  )
  const strengths = useMemo(() => all.filter((r) => r.gap <= 0).sort((a, b) => b.required - a.required).slice(0, 3), [all])
  const priorities = q.data?.top_priorities.slice(0, 3) ?? []

  // ---- มุมมองที่เชื่อมกัน: ตัวกรองหมวด → กราฟแท่ง → แผงรายละเอียด (และการ์ดจุดแข็ง/ควรพัฒนา → เลือกบนกราฟ) ----
  const [cat, setCat] = useState<'all' | SkillCategory>('all')
  const [picked, setPicked] = useState<string | null>(null)
  const chartRows = useMemo(() => all.filter((r) => cat === 'all' || categoryOf(r.feature) === cat).sort((a, b) => b.required - a.required), [all, cat])
  const pick = chartRows.find((r) => r.feature === picked) ?? chartRows.find((r) => r.gap > 0) ?? chartRows[0]
  const pickSkill = (f: string) => {
    setPicked(f)
    // ทักษะที่เลือกจากการ์ดอาจอยู่นอกหมวดที่กรองอยู่ → กลับไปดูทุกหมวด
    if (cat !== 'all' && categoryOf(f) !== cat) setCat('all')
    document.getElementById('skill-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // พัฒนาการ: เฉพาะครั้งที่อาชีพนี้มีคะแนน (อยู่ใน Top 5 ของครั้งนั้น)
  const hist = app.history.filter((h) => h.scores[target.code] != null)
  const delta = hist.length >= 2 ? hist[hist.length - 1].scores[target.code] - hist[0].scores[target.code] : null

  // กิจกรรม Roadmap ที่ทำเสร็จของอาชีพเป้าหมาย (key = `${code}|${itemId}`)
  const roadmapDone = Object.entries(app.roadmap).filter(([k, v]) => k.startsWith(`${target.code}|`) && (v === 'done' || v === 'passed')).length

  const summary = !q.data
    ? null
    : counts.missing + counts.near === 0
      ? `ทักษะของคุณถึงระดับที่อาชีพนี้ต้องการครบทุกกลุ่มแล้ว`
      : `ทักษะของคุณถึงเกณฑ์แล้ว ${counts.strong} จาก ${all.length} กลุ่ม — สิ่งที่ควรพัฒนาก่อนคือ ${priorities[0]?.name ?? '-'}`

  const steps: { to: string; icon: string; title: string; desc: string }[] = [
    { to: '/skill-gap', icon: '📊', title: 'ดูว่าขาดทักษะอะไร', desc: `ทักษะทั้ง ${all.length || 30} กลุ่ม เรียงตามความสำคัญ` },
    { to: '/roadmap', icon: '🗺️', title: 'เรียนตาม Roadmap', desc: roadmapDone ? `ทำเสร็จแล้ว ${roadmapDone} กิจกรรม` : 'ยังไม่ได้เริ่ม — มีแผนให้ทีละขั้น' },
    { to: '/assessment', icon: '🔁', title: 'ประเมินซ้ำ', desc: 'หลังฝึกแล้ว ดูว่าทักษะขยับขึ้นแค่ไหน' },
  ]

  return (
    <Main>
      <PageHead
        title={`สวัสดี${app.user ? `, ${app.user.name}` : ''}`}
        desc={`สรุปความพร้อมของคุณสำหรับอาชีพเป้าหมาย · ผลจากแบบประเมินเมื่อ ${resultTime ?? "ครั้งล่าสุด"}`}
        right={
          <Link to="/assessment" className={btn.secondary}>
            ทำแบบประเมินใหม่
          </Link>
        }
      />

      {/* ---------- 1. อาชีพเป้าหมาย + สรุป ---------- */}
      <section className="relative overflow-hidden rounded-[22px] px-5 py-7 sm:px-9 sm:py-9 text-white bg-[linear-gradient(135deg,#172554_0%,#2747D0_60%,#0ea5e9_130%)]">
        <div className="relative flex flex-wrap gap-7 items-center">
          <div className="flex flex-col gap-3 flex-[1_1_380px] min-w-0">
            <span className="text-sm font-semibold text-white/75">
              {isGoal ? `★ อาชีพที่คุณอยากเป็น · อันดับ ${target.rank} จาก 910` : `🎯 อาชีพเป้าหมาย · อันดับ ${target.rank} ที่แนะนำ`}
            </span>
            <h1 className="m-0 text-[28px] sm:text-[36px] leading-tight font-bold">{target.title}</h1>
            {summary ? <p className="m-0 text-white/90 text-[16px] leading-relaxed">{summary}</p> : null}
            <Link to="/careers" className="self-start text-sm font-semibold !text-white/90 underline underline-offset-4 hover:!text-white">
              เปลี่ยนอาชีพเป้าหมายที่หน้าอาชีพที่แนะนำ
            </Link>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <Ring value={target.skill_coverage_percent} color="#93c5fd" label="ทักษะครอบคลุม" />
            <span className="text-[12px] text-white/75">ทักษะครอบคลุม</span>
          </div>
        </div>
      </section>

      {/* ---------- 2. นับตามสถานะ ---------- */}
      {q.isError ? (
        <ErrorState message="วิเคราะห์ทักษะไม่สำเร็จ" error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={4} label="กำลังวิเคราะห์ทักษะ…" />
      ) : (
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-[19px]">🙋 คุณเป็นคนแบบไหน</h2>
              <span className="text-[13px] text-muted">สรุปจากคำตอบของคุณเอง — แสดงเฉพาะข้อที่คุณให้คะแนนตัวเองสูง (4 หรือ 5 เต็ม 5)</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-3">
              <ProfileTile icon="❤️" title="ความสนใจเด่น" items={profile.interests} empty="ยังไม่มีด้านที่ตอบ 4–5" />
              <ProfileTile icon="🛠️" title="ทักษะที่คุณมั่นใจ" items={profile.skills} empty="ยังไม่มีทักษะที่ตอบ 4–5 — ไม่เป็นไร เริ่มฝึกได้ตาม Roadmap" />
              <ProfileTile icon="💼" title="งานที่คุณชอบ" items={profile.work} empty="ยังไม่มีลักษณะงานที่ตอบ 4–5" />
              <ProfileTile icon="🌱" title="นิสัยในการทำงาน" items={profile.styles} empty="ยังไม่มีข้อที่ตอบ 4–5" />
            </div>
          </Card>

          <GapLegend className="-mb-2" />

          {/* ---------- 3. จุดแข็ง / ควรพัฒนาก่อน ---------- */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-5">
            <Card className="flex flex-col gap-4">
              <h2 className="m-0 text-[19px]">💪 จุดแข็งที่ใช้กับอาชีพนี้ได้เลย</h2>
              {strengths.length ? (
                <ul className="m-0 p-0 list-none flex flex-col gap-4">
                  {strengths.map((r) => (
                    <SkillLine key={r.feature} r={r} on={r.feature === pick?.feature} onPick={pickSkill} />
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted leading-relaxed">ยังไม่มีกลุ่มทักษะที่ถึงระดับที่อาชีพนี้ต้องการ — เริ่มจากรายการทางขวาได้เลย</p>
              )}
              <span className="text-[13px] text-muted">ใช้เล่าในเรซูเม่หรือตอนสัมภาษณ์ได้ · คลิกเพื่อดูบนกราฟ</span>
            </Card>
            <Card className="flex flex-col gap-4">
              <h2 className="m-0 text-[19px]">🚧 ควรพัฒนาก่อน 3 อันดับ</h2>
              {priorities.length ? (
                <ul className="m-0 p-0 list-none flex flex-col gap-4">
                  {priorities.map((r) => (
                    <SkillLine key={r.feature} r={r} on={r.feature === pick?.feature} onPick={pickSkill} />
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted">ไม่มีทักษะที่ต้องพัฒนาเพิ่ม 🎉</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 items-center text-[13px] text-muted">
                <span>เรียงตามความสำคัญต่ออาชีพและขนาดที่ขาด · คลิกเพื่อดูบนกราฟ</span>
              </div>
            </Card>
          </div>

          {/* ---------- 3b. ทักษะทั้งหมด (กราฟเชื่อมกัน) ---------- */}
          <Card className="flex flex-col gap-4">
            <div id="skill-map" className="scroll-mt-24 flex flex-wrap justify-between items-start gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-[19px]">📊 ทักษะทั้งหมดเทียบกับ {target.title}</h2>
                <span className="text-[13px] text-muted">
                  {chartRows.length} จาก {all.length} กลุ่มทักษะ · เรียงจากที่อาชีพนี้ต้องการสูงสุด · คลิกแท่งเพื่อดูรายละเอียด
                </span>
              </div>
              <GapLegend />
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="หมวดทักษะ">
              <Chip on={cat === 'all'} onClick={() => setCat('all')}>
                ทั้งหมด
              </Chip>
              {(Object.keys(SKILL_CATEGORY_LABEL) as SkillCategory[]).map((c) => (
                <Chip key={c} on={cat === c} onClick={() => setCat(c)}>
                  {SKILL_CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-5 items-start">
              <div className="flex-[1.6_1_420px] min-w-0">
                <SkillBars items={chartRows} selected={pick?.feature} onSelect={setPicked} />
              </div>
              {pick && (
                <aside aria-live="polite" className="flex-[1_1_260px] min-w-0 md:sticky md:top-20 border-2 border-primary rounded-2xl p-5 flex flex-col gap-3.5">
                  <span className="text-[13px] font-semibold text-primary">ทักษะที่เลือก</span>
                  <h3 className="m-0 text-[21px] leading-snug">{pick.name}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-page rounded-control p-2.5 flex flex-col">
                      <span className="text-[12px] text-muted">ของคุณ</span>
                      <span className="text-xl font-bold">{pick.user.toFixed(0)}</span>
                    </div>
                    <div className="bg-page rounded-control p-2.5 flex flex-col">
                      <span className="text-[12px] text-muted">ต้องการ</span>
                      <span className="text-xl font-bold">{pick.required.toFixed(0)}</span>
                    </div>
                    <div className={cx('rounded-control p-2.5 flex flex-col', pick.gap > 0 ? 'bg-warn-soft' : 'bg-good-soft')}>
                      <span className={cx('text-[12px]', pick.gap > 0 ? 'text-warn-ink' : 'text-good')}>{pick.gap > 0 ? 'ขาด' : 'ผล'}</span>
                      <span className={cx('text-xl font-bold', pick.gap > 0 ? 'text-warn-ink' : 'text-good')}>{pick.gap > 0 ? pick.gap.toFixed(0) : 'ถึงเกณฑ์'}</span>
                    </div>
                  </div>
                  <p className="m-0 text-sm leading-relaxed text-ink-2">
                    คุณตอบข้อนี้ระดับ <b>{toAnswer(pick.user)}</b> จาก 5 ·{' '}
                    {(() => {
                      const need = minAnswer(pick.required)
                      if (pick.gap <= 0) return <>ถึงระดับที่อาชีพนี้ต้องการแล้ว — ใช้เป็นจุดแข็งได้</>
                      return need ? (
                        <>
                          ต้องขยับเป็นอย่างน้อย <b>ระดับ {need}</b> จึงจะถึงเกณฑ์
                        </>
                      ) : (
                        <>อาชีพนี้ต้องการระดับสูงสุด</>
                      )
                    })()}
                  </p>
                  <p className="m-0 text-[12px] text-muted leading-relaxed">“{questionOf(pick.feature)}”</p>
                  {pick.gap > 0 ? (
                    <Link to="/roadmap" className={btn.primary}>
                      ดูวิธีฝึกใน Roadmap <ArrowRight size={18} />
                    </Link>
                  ) : (
                    <Link to={`/advisor?c=new&career=${encodeURIComponent(target.code)}`} className={btn.secondary}>
                      ถาม AI ว่าจะใช้จุดแข็งนี้ยังไง
                    </Link>
                  )}
                </aside>
              )}
            </div>
          </Card>
        </>
      )}

      {/* ---------- 4. ขั้นต่อไป ---------- */}
      <section aria-labelledby="next" className="flex flex-col gap-3">
        <h2 id="next" className="m-0 text-[19px]">ขั้นต่อไป</h2>
        <ol className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">
          {steps.map((s, i) => (
            <li key={s.to}>
              <Link
                to={s.to}
                className="group h-full bg-white border border-line rounded-tile p-4 flex items-center gap-3.5 no-underline !text-ink shadow-card transition-[box-shadow,border-color] hover:shadow-lift hover:border-primary-line"
              >
                <span className="w-10 h-10 shrink-0 rounded-full bg-primary text-white font-bold flex items-center justify-center">{i + 1}</span>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold group-hover:text-primary">
                    {s.icon} {s.title}
                  </span>
                  <span className="text-[13px] text-muted">{s.desc}</span>
                </span>
                <ArrowRight size={18} className="shrink-0 text-muted group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- 5. พัฒนาการ + AI ---------- */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[19px]">📈 พัฒนาการของคุณ</h2>
          {hist.length ? (
            <>
              <p className="m-0 text-[15px] leading-relaxed">
                {delta == null ? (
                  <>ประเมินมาแล้ว 1 ครั้ง — ทักษะครอบคลุม <b>{hist[0].scores[target.code].toFixed(0)}%</b> ประเมินซ้ำหลังฝึกเพื่อดูความเปลี่ยนแปลง</>
                ) : (
                  <>
                    ประเมิน {hist.length} ครั้ง ทักษะครอบคลุม{delta >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'}{' '}
                    <b className={delta >= 0 ? 'text-good' : 'text-warn'}>
                      {delta >= 0 ? '+' : ''}
                      {delta.toFixed(1)}
                    </b>{' '}
                    จากครั้งแรก
                  </>
                )}
              </p>
              <HistoryBars labels={hist.map((h) => fmtDate(h.at))} values={hist.map((h) => h.scores[target.code])} />
              <span className="text-[13px] text-muted">ทักษะครอบคลุม (%) ของ {target.title} ในแต่ละครั้งที่ประเมิน</span>
            </>
          ) : (
            <p className="m-0 text-sm text-muted leading-relaxed py-4">ยังไม่มีประวัติของอาชีพนี้ — ทำแบบประเมินซ้ำหลังฝึกทักษะ แล้วกราฟจะแสดงที่นี่</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-2">
            <h2 className="m-0 text-[19px]">💬 ถาม AI Advisor</h2>
            {app.conversations.length > 0 && (
              <Link to="/advisor" className="text-sm font-semibold">
                ดูประวัติทั้งหมด
              </Link>
            )}
          </div>
          {app.conversations.length === 0 ? (
            <>
              <p className="m-0 text-sm text-muted leading-relaxed">ไม่แน่ใจว่าจะเริ่มตรงไหน? ถาม AI ให้อธิบายผลของคุณเป็นภาษาง่าย ๆ</p>
              <Link to={`/advisor?c=new&career=${encodeURIComponent(target.code)}`} className={cx(btn.primary, 'self-start')}>
                ถามเรื่อง {target.title}
              </Link>
            </>
          ) : (
            app.conversations.slice(0, 3).map((c) => (
              <Link
                key={c.id}
                to={`/advisor?c=${c.id}`}
                className="flex gap-3 items-center p-3 border border-line rounded-control no-underline !text-ink hover:border-primary-mid"
              >
                <Chat className="text-primary shrink-0" />
                <span className="flex-1 flex flex-col min-w-0">
                  <span className="text-[15px] truncate">{c.title}</span>
                  <span className="text-[13px] text-muted">{fmtDate(c.createdAt)}</span>
                </span>
              </Link>
            ))
          )}
        </Card>
      </div>
    </Main>
  )
}
