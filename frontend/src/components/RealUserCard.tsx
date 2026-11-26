import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { listCareers, type RealUserLabel } from '../api/client'
import { QUESTION_COUNT } from '../lib/labels'
import { cx } from './ui'

export interface RealUserDraft {
  working: boolean
  code: string | null
  years: RealUserLabel['years_in_role']
  consent: boolean
}

export const EMPTY_DRAFT: RealUserDraft = { working: false, code: null, years: null, consent: false }
export const draftReady = (d: RealUserDraft) => d.working && !!d.code && d.consent

/**
 * การ์ดไม่บังคับท้ายแบบประเมิน — คนที่ทำงานอยู่แล้วบอกอาชีพจริงของตัวเอง
 * ใช้เป็น "ผู้ใช้จริง" สำหรับวัดความแม่นของโมเดล (evaluate.py ชั้นที่ 4) — ไม่ตอบก็ใช้งานได้ปกติ
 */
export function RealUserCard({ value, onChange }: { value: RealUserDraft; onChange: (d: RealUserDraft) => void }) {
  const ids = { q: useId(), list: useId(), years: useId(), consent: useId() }
  const careers = useQuery({ queryKey: ['careers'], queryFn: listCareers, staleTime: Infinity, enabled: value.working })
  const [text, setText] = useState('')
  const byTitle = useMemo(() => new Map((careers.data ?? []).map((c) => [c.title.toLowerCase(), c.code])), [careers.data])
  const set = (p: Partial<RealUserDraft>) => onChange({ ...value, ...p })

  return (
    <section className="bg-white border border-line rounded-card shadow-card px-6 py-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-primary">ไม่บังคับ · ช่วยพัฒนาโมเดล</span>
        <h2 className="m-0 text-lg">คุณทำงานอยู่แล้วหรือไม่?</h2>
        <p className="m-0 text-sm text-muted leading-relaxed">
          ถ้าบอกอาชีพที่ทำอยู่จริง เราจะใช้คำตอบของคุณวัดว่าโมเดลแนะนำถูกแค่ไหนกับคนจริง ตอนนี้ความแม่นทุกตัวเลขมาจากผู้ใช้จำลอง
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="สถานะการทำงาน">
        {[
          [false, 'ยังไม่ได้ทำงาน / ข้าม'],
          [true, 'ทำงานอยู่ ขอบอกอาชีพ'],
        ].map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value.working === v}
            onClick={() => set(v ? { working: true } : EMPTY_DRAFT)}
            className={cx(
              'min-h-11 px-4 rounded-full text-sm border',
              value.working === v ? 'bg-primary border-primary text-white font-semibold' : 'bg-white border-line-strong text-ink-2',
            )}
          >
            {l as string}
          </button>
        ))}
      </div>

      {value.working && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5 flex-[2_1_280px]">
              <label htmlFor={ids.q} className="text-sm font-semibold">
                อาชีพที่ทำอยู่ (ชื่อตาม O*NET ภาษาอังกฤษ)
              </label>
              <input
                id={ids.q}
                list={ids.list}
                value={text}
                placeholder={careers.isLoading ? 'กำลังโหลดรายชื่อ…' : 'พิมพ์ค้นหา เช่น Software Developers'}
                onChange={(e) => {
                  setText(e.target.value)
                  set({ code: byTitle.get(e.target.value.trim().toLowerCase()) ?? null })
                }}
                className="text-[15px] px-3.5 py-3 min-h-12 border border-line-strong rounded-control outline-none focus:border-primary"
              />
              <datalist id={ids.list}>
                {careers.data?.map((c) => (
                  <option key={c.code} value={c.title} />
                ))}
              </datalist>
              <span className={cx('text-[13px]', value.code ? 'text-good' : 'text-muted')}>
                {value.code ? `เลือกแล้ว: ${value.code}` : text ? 'ยังไม่ตรงกับชื่อในรายการ — เลือกจากรายการที่แนะนำ' : 'เลือกจากรายการ 910 อาชีพ'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 flex-[1_1_160px]">
              <label htmlFor={ids.years} className="text-sm font-semibold">
                ทำมานานเท่าไร
              </label>
              <select
                id={ids.years}
                value={value.years ?? ''}
                onChange={(e) => set({ years: (e.target.value || null) as RealUserDraft['years'] })}
                className="text-[15px] px-3.5 py-3 min-h-12 border border-line-strong rounded-control bg-white"
              >
                <option value="">ไม่ระบุ</option>
                <option value="<1">น้อยกว่า 1 ปี</option>
                <option value="1-3">1–3 ปี</option>
                <option value="3-5">3–5 ปี</option>
                <option value="5+">มากกว่า 5 ปี</option>
              </select>
            </div>
          </div>
          <label htmlFor={ids.consent} className="flex gap-3 items-start text-sm text-ink-2 leading-relaxed cursor-pointer">
            <input
              id={ids.consent}
              type="checkbox"
              checked={value.consent}
              onChange={(e) => set({ consent: e.target.checked })}
              className="w-5 h-5 mt-0.5 accent-primary shrink-0"
            />
            ยินยอมให้เก็บคำตอบ {QUESTION_COUNT} ข้อและอาชีพของฉันแบบไม่ระบุตัวตน (ไม่เก็บชื่อหรืออีเมล) เพื่อใช้วัดและปรับปรุงความแม่นของโมเดล
          </label>
        </div>
      )}
    </section>
  )
}
