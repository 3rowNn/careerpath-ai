import { Link, useParams } from 'react-router-dom'
import type { CareerRequirement } from '../api/types'
import { ArrowRight } from '../components/icons'
import { JobSearch } from '../components/JobSearch'
import { Main } from '../components/Layout'
import { Badge, btn, Card, cx, EmptyState, ErrorState, GapBar, SectionTitle, Skeleton, SkeletonRows, GapLegend } from '../components/ui'
import { clusterName, majorName, questionOf, RIASEC_TH } from '../lib/labels'
import { useCareerDetail, useSimilar, useSkillGap, useTarget } from '../lib/queries'
import { useResult } from '../lib/useResult'

/** ระดับ 0–100 เป็นคำ */
const levelWord = (v: number) => (v >= 75 ? 'สูงมาก' : v >= 55 ? 'สูง' : v >= 35 ? 'ปานกลาง' : 'ต่ำ')

function Bar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'soft' }) {
  return (
    <span className="block h-2 bg-track rounded-full overflow-hidden grow min-w-0">
      <span className={cx('block h-full rounded-full', tone === 'primary' ? 'bg-primary' : 'bg-primary-mid')} style={{ width: `${Math.max(value, 2)}%` }} />
    </span>
  )
}

/** ลักษณะงาน/นิสัยที่อาชีพนี้โดดเด่นกว่าอาชีพทั่วไป */
function Distinctive({ items, empty }: { items: CareerRequirement[]; empty: string }) {
  if (!items.length) return <p className="m-0 text-sm text-muted">{empty}</p>
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
      {items.map((r) => (
        <li key={r.feature} className="flex flex-col gap-1.5">
          <span className="flex justify-between gap-3 text-[15px]">
            <span className="min-w-0">{questionOf(r.feature, r.name)}</span>
            <span className="text-[13px] text-muted shrink-0">{levelWord(r.required)}</span>
          </span>
          <Bar value={r.required} tone="soft" />
        </li>
      ))}
    </ul>
  )
}

export default function CareerDetail() {
  const { code = '' } = useParams()
  const { isSample } = useResult()
  const q = useCareerDetail(code)
  const gap = useSkillGap(code)
  const target = useTarget(code)
  const similar = useSimilar(code)

  if (q.isError) {
    return (
      <Main>
        <Link to="/careers" className="text-[15px] font-semibold">
          ← กลับไปอาชีพที่แนะนำ
        </Link>
        <ErrorState message="โหลดข้อมูลอาชีพไม่สำเร็จ" error={q.error} onRetry={() => q.refetch()} />
      </Main>
    )
  }
  if (!q.data) {
    return (
      <Main>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-[60%]" />
        <SkeletonRows rows={8} label="กำลังโหลดข้อมูลอาชีพ…" />
      </Main>
    )
  }

  const d = q.data
  const by = (dom: string[]) => d.requirements.filter((r) => dom.includes(r.domain))
  const userOf = Object.fromEntries((gap.data?.all ?? []).map((r) => [r.feature, r.user]))
  const skills = by(['grp']).sort((a, b) => b.required - a.required).slice(0, 10)
  const riasec = by(['ri']).sort((a, b) => b.required - a.required)
  // ลักษณะงาน/นิสัย: เลือกที่สูงกว่าค่าเฉลี่ยทุกอาชีพชัดเจน (z ≥ 0.5) เรียงตามความโดดเด่น
  const work = by(['gtask', 'task']).filter((r) => r.distinctiveness >= 0.5).sort((a, b) => b.distinctiveness - a.distinctiveness).slice(0, 6)
  const styles = by(['ws']).filter((r) => r.distinctiveness >= 0.5).sort((a, b) => b.distinctiveness - a.distinctiveness).slice(0, 5)
  const rank = target.data?.career.rank
  const g = gap.data

  return (
    <Main className="gap-6">
      <Link to="/careers" className="text-[15px] font-semibold self-start">
        ← กลับไปอาชีพที่แนะนำ
      </Link>

      {/* ---------- หัว ---------- */}
      <header className="flex flex-wrap justify-between items-end gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge>{majorName(d.code)}</Badge>
            <Badge tone="neutral">③ {clusterName(d.cluster)}</Badge>
          </div>
          <h1 className="m-0 text-[30px] sm:text-[36px] font-bold leading-tight">{d.title}</h1>
          <span className="text-muted">
            {d.title_en ?? d.title} · O*NET {d.code}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link to={`/goal?code=${encodeURIComponent(d.code)}`} className={btn.primary}>
            ตั้งเป็นอาชีพที่อยากเป็น <ArrowRight />
          </Link>
          <Link to={`/advisor?c=new&career=${encodeURIComponent(d.code)}`} className={btn.secondary}>
            ถาม AI Advisor
          </Link>
        </div>
      </header>

      {/* ---------- สำหรับคุณ (ยังไม่มีผลประเมิน = ชวนทำ ไม่แสดงผลของผู้ใช้ตัวอย่าง) ---------- */}
      {isSample ? (
        <div className="bg-primary-soft border border-primary-line rounded-tile p-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-ink-2 leading-relaxed flex-[1_1_320px]">
            <b>อาชีพนี้เหมาะกับคุณแค่ไหน?</b> ทำแบบประเมินก่อน แล้วจะเห็นอันดับของอาชีพนี้สำหรับคุณ ทักษะที่ถึงเกณฑ์ และสิ่งที่ควรพัฒนา
          </span>
          <Link to="/assessment" className={btn.primary}>
            ทำแบบประเมิน <ArrowRight />
          </Link>
        </div>
      ) : (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <div className="bg-white border border-line rounded-tile p-5 shadow-card flex flex-col gap-1">
          <span className="text-sm text-muted">อันดับสำหรับคุณ</span>
          {rank ? (
            <span className="text-[32px] font-bold text-primary leading-tight">
              {rank} <span className="text-base font-semibold text-muted">/ {target.data?.total}</span>
            </span>
          ) : (
            <Skeleton className="h-9 w-24" />
          )}
          <span className="text-[13px] text-muted">เรียงตามความเหมาะโดยรวม (Ensemble)</span>
        </div>
        <div className="bg-white border border-line rounded-tile p-5 shadow-card flex flex-col gap-1">
          <span className="text-sm text-muted">ทักษะของคุณที่ถึงระดับที่อาชีพนี้ต้องการ</span>
          {g ? (
            <>
              <span className="text-[32px] font-bold text-good leading-tight">
                {g.skills_met} <span className="text-base font-semibold text-muted">จาก {g.skills_total} กลุ่ม</span>
              </span>
              <span className="text-[13px] text-muted">
                {g.skills_total - g.skills_met > 0 ? `ยังต้องพัฒนาอีก ${g.skills_total - g.skills_met} กลุ่ม` : 'ครบทุกกลุ่มแล้ว'}
              </span>
            </>
          ) : (
            <Skeleton className="h-9 w-24" />
          )}
          {g && g.skills_total - g.skills_met > 0 && (
            <Link to={`/goal?code=${encodeURIComponent(d.code)}`} className="text-[13px] font-semibold">
              ดูว่าขาดทักษะอะไรบ้าง →
            </Link>
          )}
        </div>
        <div className="bg-white border border-line rounded-tile p-5 shadow-card flex flex-col gap-1">
          <span className="text-sm text-muted">ควรพัฒนาก่อน</span>
          {g ? (
            <span className="text-[20px] font-bold leading-snug">{g.top_priorities[0]?.name ?? 'ถึงเกณฑ์ครบแล้ว'}</span>
          ) : (
            <Skeleton className="h-7 w-40" />
          )}
          {g?.top_priorities[0] && <span className="text-[13px] text-muted">ขาด {g.top_priorities[0].gap.toFixed(0)} คะแนน (Skill Priority อันดับ 1)</span>}
        </div>
      </div>
      )}

      <div className="flex flex-wrap gap-6 items-start">
        {/* ---------- ซ้าย ---------- */}
        <div className="flex-[1_1_560px] min-w-0 flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <SectionTitle title="อาชีพนี้ทำอะไร" desc="คำอธิบายจาก O*NET (ภาษาอังกฤษ — ยังไม่ได้แปล)" />
            <p className="m-0 leading-relaxed text-ink-2" lang="en">
              {d.description ?? 'ไม่มีคำอธิบายในข้อมูล'}
            </p>
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionTitle
              title="ทักษะที่อาชีพนี้ต้องการ"
              desc={<span className="flex flex-col gap-1">10 กลุ่มทักษะที่อาชีพนี้ต้องการสูงสุด · คะแนนเต็ม 100<GapLegend /></span>}
              right={
                <Link to={`/goal?code=${encodeURIComponent(d.code)}`} className="text-sm font-semibold">
                  ดูว่าขาดทักษะอะไรบ้าง →
                </Link>
              }
            />
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {skills.map((r) => {
                const u = userOf[r.feature]
                const short = u != null ? r.required - u : 0
                return (
                  <li key={r.feature} className="flex flex-col gap-1.5">
                    <span className="flex justify-between gap-3 text-[15px]">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-[13px] shrink-0">
                        {u == null ? (
                          <span className="text-muted">ต้องการ {r.required.toFixed(0)}</span>
                        ) : short > 0 ? (
                          <span className="text-warn font-semibold">ขาด {short.toFixed(0)}</span>
                        ) : (
                          <span className="text-good font-semibold">ถึงเกณฑ์</span>
                        )}
                      </span>
                    </span>
                    {u != null ? <GapBar user={u} required={r.required} /> : <Bar value={r.required} />}
                  </li>
                )
              })}
            </ul>
            {gap.isError && <p className="m-0 text-[13px] text-muted">เทียบกับทักษะของคุณไม่ได้ — แสดงเฉพาะระดับที่ต้องการ</p>}
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionTitle title="ลักษณะงานที่โดดเด่น" desc="สิ่งที่อาชีพนี้ทำมากกว่าอาชีพทั่วไปชัดเจน (จาก Task Statements ของ O*NET)" />
            <Distinctive items={work} empty="ไม่มีลักษณะงานที่โดดเด่นกว่าอาชีพทั่วไปชัดเจน" />
          </Card>
        </div>

        {/* ---------- ขวา ---------- */}
        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-6">
          <Card className="flex flex-col gap-4 border-primary-line">
            <SectionTitle title="🔎 หางานนี้ในไทย" desc="ดูประกาศงานจริงที่เปิดรับอยู่ตอนนี้" />
            <JobSearch key={d.code} titleTh={d.title} titleEn={d.title_en} />
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionTitle title="เหมาะกับคนที่สนใจ" desc="ความสนใจ 6 ด้าน (RIASEC)" />
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
              {riasec.map((r, i) => (
                <li key={r.feature} className="flex items-center gap-3 text-sm">
                  <span className={cx('w-[150px] shrink-0', i < 2 ? 'font-semibold text-ink' : 'text-ink-2')}>{RIASEC_TH[r.name] ?? r.name}</span>
                  <Bar value={r.required} tone={i < 2 ? 'primary' : 'soft'} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionTitle title="นิสัยที่เหมาะ" desc="Work Styles ที่สูงกว่าอาชีพทั่วไป" />
            <Distinctive items={styles} empty="ไม่มีนิสัยที่โดดเด่นกว่าอาชีพทั่วไปชัดเจน" />
          </Card>

          {d.tools.length > 0 && (
            <Card className="flex flex-col gap-3">
              <SectionTitle title="เครื่องมือที่ใช้" desc="O*NET Software Skills" />
              <div className="flex flex-wrap gap-1.5">
                {d.tools.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <SectionTitle title="อาชีพใกล้เคียง" desc="คลัสเตอร์เดียวกัน (③ K-Means) เรียงตามความคล้าย" />
            {similar.data ? (
              similar.data.length ? (
                <ul className="m-0 p-0 list-none flex flex-col gap-1">
                  {similar.data.map((s) => (
                    <li key={s.code}>
                      <Link
                        to={`/careers/${encodeURIComponent(s.code)}`}
                        className="flex justify-between items-center gap-3 px-3 py-2.5 rounded-control no-underline !text-ink hover:bg-page"
                      >
                        <span className="min-w-0 truncate">{s.title}</span>
                        <ArrowRight size={16} className="shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted">ไม่มีอาชีพอื่นในคลัสเตอร์นี้</p>
              )
            ) : similar.isError ? (
              <ErrorState error={similar.error} onRetry={() => similar.refetch()} />
            ) : (
              <SkeletonRows rows={4} />
            )}
          </Card>
        </div>
      </div>

      <EmptyState
        title="ข้อมูลที่ยังไม่มี"
        desc="เงินเดือน วุฒิการศึกษาที่ต้องใช้ และความต้องการในตลาดแรงงานไทย ไม่อยู่ในชุดข้อมูลที่โมเดลใช้ (O*NET เป็นข้อมูลของสหรัฐฯ) จึงไม่แสดง เพื่อไม่ให้เข้าใจผิด"
      />
    </Main>
  )
}
