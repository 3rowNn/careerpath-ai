import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { IS_DEMO, listMajors } from '../api/client'
import { majorName } from '../lib/labels'
import { useMajor } from '../lib/queries'
import { useApp } from '../lib/store'
import { Card, cx, ErrorState, SkeletonRows } from './ui'

/** สาขาที่จบ → อาชีพในสายที่เรียน (ตาราง CIP–SOC) เรียงตามความเข้ากับผู้ใช้ด้วยโมเดล ML */
export function MajorCard() {
  const { major, setMajor } = useApp()
  const list = useQuery({ queryKey: ['majors'], queryFn: listMajors, staleTime: Infinity, enabled: !IS_DEMO })
  const q = useMajor(IS_DEMO ? null : major)
  const faculties = [...new Set(list.data?.map((m) => m.faculty) ?? [])]
  const d = q.data

  return (
    <Card className="!p-7 flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="m-0 text-[22px]">อาชีพในสายที่คุณเรียนจบ</h2>
          <p className="m-0 text-sm text-muted leading-relaxed">
            ไม่บังคับ · เลือกสาขาแล้วดูว่าอาชีพในสายนี้ อาชีพไหนเข้ากับตัวคุณที่สุด เทียบกับ Top 5 ด้านบนที่ไม่ได้ดูสาขาเลย
          </p>
        </div>
        {IS_DEMO ? (
          <span className="text-sm text-muted">ต้องเชื่อม backend</span>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-semibold min-w-[260px]">
            สาขาที่จบ
            <select
              value={major ?? ''}
              onChange={(e) => setMajor(e.target.value || null)}
              className="min-h-12 px-3 rounded-control border border-line-strong bg-white font-normal text-base"
            >
              <option value="">— ไม่ระบุ —</option>
              {faculties.map((f) => (
                <optgroup key={f} label={f}>
                  {list.data!
                    .filter((m) => m.faculty === f)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.major_th}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>

      {major && !IS_DEMO && !d && (q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={3} />)}
      {d && (
        <>
          <p className="m-0 text-sm text-ink-2 leading-relaxed">
            สาขา<b>{d.major_th}</b> เกี่ยวข้องกับ {d.n_linked} อาชีพจาก {d.total} · อาชีพในสายนี้ที่เข้ากับคุณที่สุดอยู่อันดับ <b>{d.best_rank}</b> ของทั้งหมด
            {d.in_top5.length > 0 ? (
              <> · มี {d.in_top5.length} อาชีพที่อยู่ใน Top 5 ของคุณด้วย — สายที่เรียนกับตัวคุณไปทางเดียวกัน</>
            ) : (
              <> · ไม่มีอาชีพในสายนี้อยู่ใน Top 5 — สิ่งที่คุณชอบและถนัดอาจอยู่นอกสายที่เรียน ซึ่งเป็นเรื่องปกติ</>
            )}
          </p>
          <ol className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-2.5">
            {d.careers.map((c) => {
              const top = d.in_top5.includes(c.code)
              return (
                <li key={c.code}>
                  <Link
                    to={`/goal?code=${encodeURIComponent(c.code)}`}
                    className={cx('flex items-center gap-3 p-3 rounded-xl border no-underline !text-ink hover:border-primary', top ? 'border-primary bg-primary-soft' : 'border-line bg-white')}
                  >
                    <span className="min-w-12 px-1.5 h-9 shrink-0 rounded-lg bg-page flex items-center justify-center text-sm font-bold text-ink-2" title="อันดับใน 910 อาชีพสำหรับคุณ">
                      #{c.rank}
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="font-semibold truncate" title={c.title_en}>{c.title}</span>
                      <span className="text-xs text-muted truncate">
                        {majorName(c.code)} · ทักษะครอบคลุม {c.skill_coverage_percent}%{top ? ' · อยู่ใน Top 5' : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <p className="m-0 text-[13px] text-muted leading-relaxed">
            สาขา → อาชีพ: ตาราง CIP 2020–SOC 2018 ของ NCES (สหรัฐฯ) ซึ่งจับคู่ตามความหมาย ไม่ใช่ข้อมูลว่าคนจบไปทำงานอะไรจริง · ชื่อสาขาไทยและรหัสที่จับคู่ร่างโดย Claude ·
            อันดับ (#) จัดด้วยโมเดล Ensemble จากคำตอบทั้งหมดของคุณ ส่วน % ทักษะครอบคลุมดูแค่ทักษะ จึงไม่จำเป็นต้องเรียงตามอันดับ · กดที่อาชีพเพื่อดูว่าต้องพัฒนาอะไร
          </p>
        </>
      )}
    </Card>
  )
}
