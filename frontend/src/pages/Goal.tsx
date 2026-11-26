import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO, listCareers } from '../api/client'
import type { Counterfactual } from '../api/types'
import { Main } from '../components/Layout'
import { ExplainPanel } from '../components/MlExplain'
import { SampleBanner } from '../components/SampleBanner'
import { btn, Card, cx, Insight, PageHead, ErrorState, SkeletonRows, StatTile } from '../components/ui'
import { DOMAIN_LABEL, majorName, questionOf, toAnswer } from '../lib/labels'
import { useTarget } from '../lib/queries'
import { searchCareers } from '../lib/search'
import { useApp } from '../lib/store'
import { useResult } from '../lib/useResult'

/** ค้นหาจาก 910 อาชีพ (ชื่ออังกฤษ, ชื่อไทยที่มี, หรือรหัส) */
function CareerSearch({ onPick }: { onPick: (code: string) => void }) {
  const careers = useQuery({ queryKey: ['careers'], queryFn: listCareers, staleTime: Infinity, enabled: !IS_DEMO })
  const [q, setQ] = useState('')
  const hits = useMemo(() => (q.trim() && careers.data ? searchCareers(careers.data, q, 10) : []), [q, careers.data])
  return (
    <div className="flex flex-col gap-2 relative">
      <label htmlFor="career-q" className="text-sm font-semibold">
        ค้นหาอาชีพที่อยากเป็น (จาก 910 อาชีพ)
      </label>
      <input
        id="career-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="เช่น พยาบาล, Nurse, Accountant, 29-1141"
        className="min-h-12 px-4 rounded-control border border-line-strong bg-white text-base focus:border-primary"
        autoComplete="off"
      />
      {careers.isLoading && <span className="text-sm text-muted">กำลังโหลดรายชื่ออาชีพ…</span>}
      {q.trim() && careers.data && (
        <ul className="m-0 p-0 list-none border border-line rounded-xl bg-white overflow-hidden" role="listbox" aria-label="ผลการค้นหา">
          {hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">ไม่พบ ลองพิมพ์ชื่อภาษาอังกฤษ</li>}
          {hits.map((c) => (
            <li key={c.code} className="border-t border-line first:border-t-0">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(c.code)
                  setQ('')
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-page flex flex-col"
              >
                <span className="font-semibold">{c.title}</span>
                <span className="text-xs text-muted">
                  {c.title_en} · {c.code} · {majorName(c.code)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CfCard({ cf, title, desc, tone }: { cf: Counterfactual; title: string; desc: string; tone: 'skills' | 'all' }) {
  return (
    <div className="border border-line rounded-xl p-5 flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-muted">{desc}</span>
        </div>
        <span className={cx('text-sm font-semibold px-2.5 py-1 rounded-full', cf.reached ? 'bg-good-soft text-good-ink' : 'bg-warn-soft text-warn-ink')}>
          {cf.reached ? '✓ เข้า Top 5 ได้' : '✗ ยังไม่ถึง Top 5'}
        </span>
      </div>
      <div className="text-sm text-ink-2">
        อันดับ <b>{cf.rank_before}</b> → <b>{cf.rank_after}</b> · ขยับคำตอบ {cf.levels} ระดับ ใน {cf.changes.length} ข้อ
        {!cf.reached && cf.levels >= cf.max_steps && <span className="text-muted"> (ค้นถึงขีดจำกัด {cf.max_steps} ระดับแล้ว)</span>}
      </div>
      {cf.changes.length > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {cf.changes.map((c) => {
            const isSkill = c.feature.startsWith('grp::')
            return (
              <li key={c.feature} className="flex items-start justify-between gap-3 text-sm border-t border-line pt-2">
                <span className="min-w-0 leading-snug">
                  {isSkill ? c.name : questionOf(c.feature, c.name)}
                  {tone === 'all' && <span className="block text-xs text-muted">{DOMAIN_LABEL[c.feature.split('::')[0]]}</span>}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-right">
                  {toAnswer(c.from)} → <span className={c.to > c.from ? 'text-primary' : 'text-ink-2'}>{toAnswer(c.to)}</span>
                  <span className="text-muted font-normal">/5</span>
                  <span className="block text-xs font-normal text-muted">{c.to > c.from ? '▲ สูงขึ้น' : '▼ ต่ำลง'}</span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">ไม่มีข้อไหนที่ช่วยได้เพิ่ม</p>
      )}
    </div>
  )
}

export default function Goal() {
  const { isSample } = useResult()
  const { setGoal, result } = useApp()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const code = params.get('code')
  const q = useTarget(code)
  const d = q.data

  const go = (path: string) => {
    if (!d) return
    setGoal(d.career)
    nav(path)
  }

  const skills = d?.counterfactual
  const all = d?.counterfactual_all

  return (
    <Main className="gap-6">
      {isSample && <SampleBanner />}
      <PageHead
        title="อาชีพที่อยากเป็น"
        desc="มีเป้าหมายอยู่แล้ว? เลือกอาชีพ แล้วดูว่าโปรไฟล์ของคุณห่างจากอาชีพนั้นแค่ไหน และต้องพัฒนาอะไรจึงจะใกล้ขึ้น"
      />

      <Card className="!p-6 flex flex-col gap-3">
        {IS_DEMO ? (
          <p className="m-0 text-sm text-warn-ink bg-warn-soft rounded-lg p-3">โหมดตัวอย่างไม่ได้เชื่อม backend จึงวิเคราะห์อาชีพที่เลือกเองไม่ได้</p>
        ) : (
          <CareerSearch onPick={(c) => setParams({ code: c })} />
        )}
        {!result && !IS_DEMO && (
          <p className="m-0 text-sm text-muted">
            ยังไม่ได้ทำแบบประเมิน — ผลด้านล่างใช้คำตอบของผู้ใช้ตัวอย่าง <Link to="/assessment">ทำแบบประเมินของคุณ</Link>
          </p>
        )}
      </Card>

      {code && q.isLoading && <SkeletonRows rows={5} label="กำลังวิเคราะห์…" />}
      {q.isError && <ErrorState message="วิเคราะห์อาชีพนี้ไม่สำเร็จ" error={q.error} onRetry={() => q.refetch()} />}

      {d && skills && all && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted">
              {d.career.title_en} · {d.career.code} · {majorName(d.career.code)}
            </span>
            <h2 className="m-0 text-[26px]">{d.career.title}</h2>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <StatTile
              label="อันดับของอาชีพนี้สำหรับคุณ"
              value={`#${d.career.rank}`}
              sub={`จาก ${d.total} อาชีพ (จัดอันดับด้วย Ensemble)`}
              tone={d.career.rank <= 5 ? 'good' : 'primary'}
            />
            <StatTile label="ทักษะครอบคลุม" value={`${d.career.skill_coverage_percent}%`} sub="ของระดับที่อาชีพนี้ต้องการ" tone="ink" />
            <StatTile
              label="ถ้าพัฒนาทักษะ"
              value={skills.already ? 'อยู่ใน Top 5' : skills.reached ? `+${skills.levels} ระดับ` : 'ยังไม่พอ'}
              sub={skills.already ? 'ไม่ต้องเปลี่ยนอะไร' : `ขึ้นได้ถึงอันดับ ${skills.rank_after}`}
              tone={skills.reached ? 'good' : 'warn'}
            />
          </div>

          {!skills.already && (
            <Card className="!p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="m-0 text-xl">ต้องเปลี่ยนอะไรบ้าง อาชีพนี้จึงจะขึ้นมาอยู่ใน Top 5 (Counterfactual)</h3>
                <p className="m-0 text-sm text-muted leading-relaxed">
                  ระบบค้นหาการเปลี่ยนคำตอบที่น้อยที่สุด ทีละ 1 ระดับ แล้วให้โมเดล Ensemble ตัวเดียวกับที่ใช้แนะนำจัดอันดับใหม่ทุกครั้ง
                </p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
                <CfCard cf={skills} tone="skills" title="1. พัฒนาทักษะอย่างเดียว" desc="เพิ่มเฉพาะกลุ่มทักษะที่อาชีพนี้ต้องการ — สิ่งที่ฝึกได้จริง" />
                <CfCard
                  cf={all}
                  tone="all"
                  title="2. ถ้าความชอบและนิสัยตรงกับงานนี้ด้วย"
                  desc="ไม่ใช่คำแนะนำให้ฝืนเปลี่ยน — ใช้ดูว่าความชอบ/นิสัยข้อไหนที่ต่างจากงานนี้ (ทั้งที่สูงหรือต่ำกว่า)"
                />
              </div>
              {skills.reached ? (
                <Insight>
                  พัฒนาทักษะตามข้อ 1 อาชีพนี้จะขึ้นมาอยู่อันดับ {skills.rank_after} — ตั้งเป็นเป้าหมายเพื่อดู Skill Gap และ Roadmap แบบละเอียด
                </Insight>
              ) : (
                <Insight title="สิ่งที่ควรรู้">
                  ทักษะอย่างเดียวยังไม่พอให้อาชีพนี้ขึ้นมาใน Top 5 เพราะสิ่งที่คุณ<b>ชอบและเป็น</b>ต่างจากงานนี้
                  {skills.blocking.length > 0 && (
                    <>
                      {' '}
                      เช่น{' '}
                      {skills.blocking
                        .slice(0, 3)
                        .map((b) => `“${questionOf(b.feature, b.name)}” (คุณตอบ ${toAnswer(b.user)}/5)`)
                        .join(', ')}
                    </>
                  )}{' '}
                  ลองถามตัวเองว่าชอบงานลักษณะนี้จริงไหม ถ้าใช่ อาจเป็นเพราะยังไม่เคยลองทำ — ไม่ได้แปลว่าเป็นไม่ได้
                </Insight>
              )}
            </Card>
          )}

          <ExplainPanel e={d.explain} title={`ทำไมอาชีพนี้อยู่อันดับ ${d.career.rank}`} />

          <div className="flex flex-wrap gap-3">
            <button type="button" className={btn.primary} onClick={() => go('/skill-gap')}>
              ตั้งเป็นเป้าหมาย &amp; ดู Skill Gap
            </button>
            <button type="button" className={btn.secondary} onClick={() => go('/roadmap')}>
              ดู Roadmap ของอาชีพนี้
            </button>
          </div>
          <p className="m-0 text-[13px] text-muted leading-relaxed">
            อันดับคำนวณจากคำตอบแบบประเมินและข้อมูลอาชีพของ O*NET (สหรัฐฯ) ไม่ได้รวมเงินเดือน วุฒิที่ต้องใช้ หรือความต้องการแรงงานในไทย ·
            ทุกการคำนวณใช้โมเดลจริง แต่ความแม่นที่วัดได้มาจากผู้ใช้จำลอง
          </p>
        </>
      )}
    </Main>
  )
}
