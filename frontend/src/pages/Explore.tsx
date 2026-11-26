import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO, listCareers } from '../api/client'
import type { CareerListItem } from '../api/types'
import { ArrowRight, Search } from '../components/icons'
import { Main } from '../components/Layout'
import { btn, cx, EmptyState, ErrorState, Skeleton } from '../components/ui'
import thaiTitles from '../data/thai_titles.json'
import { clusterName, RIASEC_TH, SOC_MAJOR } from '../lib/labels'
import { MAJOR_ICON, RIASEC_ICON, tint } from '../lib/careerVisual'
import { searchCareers } from '../lib/search'

const PAGE = 24

/** โหมดตัวอย่าง: ไม่มี backend → ใช้รายชื่อจากไฟล์ชื่อไทย (มีแค่กลุ่มอาชีพ ไม่มีคลัสเตอร์/ความสนใจ) */
const OFFLINE: CareerListItem[] = Object.entries(thaiTitles as Record<string, string>).map(([code, title]) => ({ code, title, major: code.slice(0, 2) }))

/** คลัสเตอร์ ③ ที่มีอยู่จริงในรายการ → ชื่อ (lib/labels CLUSTER_NAME) */
function clusterNames(list: CareerListItem[]): Record<number, string> {
  const ks = new Set(list.map((c) => c.cluster).filter((k): k is number => k != null))
  return Object.fromEntries([...ks].map((k) => [k, clusterName(k)]))
}

const SUGGEST = ['พยาบาล', 'ครู', 'เชฟ', 'ช่างไฟ', 'นักบัญชี', 'นักออกแบบ', 'โปรแกรมเมอร์', 'นักจิตวิทยา']

const careerHref = (code: string) => (IS_DEMO ? `/goal?code=${encodeURIComponent(code)}` : `/careers/${encodeURIComponent(code)}`)

function CareerCard({ c }: { c: CareerListItem }) {
  return (
    <Link
      to={careerHref(c.code)}
      className={cx(
        'group h-full bg-white border rounded-tile overflow-hidden flex flex-col no-underline !text-ink shadow-card transition-[box-shadow,border-color,transform] duration-200 hover:shadow-lift hover:-translate-y-1',
        'border-line hover:border-primary-line',
      )}
    >
      <span className="flex items-center gap-3 px-4 pt-4">
        <span className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[22px] transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6" style={tint(c.major)} aria-hidden="true">
          {MAJOR_ICON[c.major ?? ''] ?? '💼'}
        </span>
        <span className="flex flex-col min-w-0 flex-1">
          <span className="font-semibold leading-snug group-hover:text-primary">{c.title}</span>
          <span className="text-[12px] text-muted leading-snug truncate">{c.title_en ?? c.code}</span>
        </span>
      </span>
      <span className="mt-auto px-4 pt-3 pb-4 flex flex-wrap gap-1.5 items-center">
        {c.major && (
          <span className="text-[12px] font-medium px-2 py-0.5 rounded-full" style={tint(c.major)}>
            {SOC_MAJOR[c.major] ?? c.major}
          </span>
        )}
        {c.riasec?.slice(0, 2).map((r) => (
          <span key={r} className="text-[12px] px-2 py-0.5 rounded-full bg-page text-ink-2" title={RIASEC_TH[r]}>
            {RIASEC_ICON[r]} {RIASEC_TH[r]?.split(' ')[0] ?? r}
          </span>
        ))}
        <ArrowRight size={16} className="ml-auto text-muted opacity-0 -translate-x-1 transition-[opacity,transform] group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary" />
      </span>
    </Link>
  )
}

export default function Explore() {
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['careers'], queryFn: listCareers, staleTime: Infinity, enabled: !IS_DEMO })
  const [params, setParams] = useSearchParams()
  const [shown, setShown] = useState(PAGE)

  const query = params.get('q') ?? ''
  const interest = params.get('ri') ?? ''
  const cluster = params.get('c') ?? ''
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
    setShown(PAGE)
  }

  const list = useMemo(() => (IS_DEMO ? OFFLINE : (q.data ?? [])), [q.data])
  const clusters = useMemo(() => clusterNames(list), [list])

  const filtered = useMemo(() => {
    const base = list.filter(
      (c) =>
        (!interest || c.riasec?.[0] === interest) &&
        (!cluster || String(c.cluster) === cluster),
    )
    return query.trim() ? searchCareers(base, query) : [...base].sort((a, b) => a.title.localeCompare(b.title, 'th'))
  }, [list, query, interest, cluster])

  const active = !!(query || interest || cluster)
  const loading = !IS_DEMO && q.isLoading
  // กดค้นหา / Enter / คำแนะนำ → เลื่อนลงไปที่ผลลัพธ์ (รอให้รายการอัปเดตก่อน)
  const goResults = () =>
    requestAnimationFrame(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const random = () => {
    const pool = filtered.length ? filtered : list
    if (pool.length) nav(careerHref(pool[Math.floor(Math.random() * pool.length)].code))
  }

  return (
    <Main>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-[22px] px-5 py-8 sm:px-10 sm:py-11 text-white bg-[linear-gradient(135deg,#172554_0%,#2747D0_55%,#7c3aed_120%)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
          {['🩺', '🍳', '💻', '🎨', '🔧', '📚', '🌾', '⚖️'].map((e, i) => (
            <span
              key={e}
              className="absolute text-[34px] opacity-25 animate-float motion-reduce:animate-none"
              style={{ right: `${4 + (i % 4) * 9}%`, top: `${12 + Math.floor(i / 4) * 44 + (i % 2) * 10}%`, animationDelay: `${i * 0.6}s` }}
            >
              {e}
            </span>
          ))}
        </div>
        <div className="relative flex flex-col gap-4 max-w-[640px]">
          <span className="text-sm font-semibold text-white/75">Career Explorer</span>
          <h1 className="m-0 text-[30px] sm:text-[40px] leading-tight font-bold">โลกนี้มีงานมากกว่าที่คุณคิด</h1>
          <p className="m-0 text-white/85 text-[16px] leading-relaxed">
            เดินดู {list.length || 910} อาชีพจากฐานข้อมูล O*NET ทุกสายงาน — กดที่อาชีพเพื่อดูว่าทำอะไร ใช้ทักษะอะไร และใกล้กับคุณแค่ไหน
          </p>
          <form
            role="search"
            className="relative mt-1"
            onSubmit={(e) => {
              e.preventDefault()
              ;(document.activeElement as HTMLElement | null)?.blur() // ปิดคีย์บอร์ดบนมือถือ
              goResults()
            }}
          >
            <label htmlFor="career-search" className="sr-only">
              ค้นหาอาชีพ
            </label>
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              id="career-search"
              type="search"
              value={query}
              onChange={(e) => set('q', e.target.value)}
              placeholder="ค้นหาชื่ออาชีพ ไทยหรืออังกฤษ"
              className="w-full min-h-14 pl-12 pr-[112px] rounded-tile border-0 bg-white text-ink text-[17px] shadow-lift outline-none focus:ring-4 focus:ring-white/40"
              autoComplete="off"
              enterKeyHint="search"
            />
            <button type="submit" className={cx(btn.primary, 'absolute right-1.5 top-1/2 -translate-y-1/2 min-h-11 px-5')}>
              ค้นหา
            </button>
          </form>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[13px] text-white/70">ลองค้น:</span>
            {SUGGEST.map((w) => (
              <button key={w} type="button" onClick={() => (set('q', w), goResults())} className="text-[13px] min-h-8 px-3 rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20">
                {w}
              </button>
            ))}
            <button type="button" onClick={random} disabled={!list.length} className="text-[13px] min-h-8 px-3 rounded-full border-0 bg-white text-ink font-semibold hover:bg-primary-soft disabled:opacity-50">
              🎲 สุ่มอาชีพให้หน่อย
            </button>
          </div>
        </div>
      </section>

      {/* ---------- ตัวกรองเพิ่มเติม ---------- */}
      {!IS_DEMO ? (
        <section aria-label="ตัวกรองเพิ่มเติม" className="bg-white border border-line rounded-card shadow-card p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-2">อาชีพที่เหมาะกับคนชอบ…</span>
            <div className="flex flex-wrap gap-2">
              {Object.keys(RIASEC_TH).map((k) => {
                const on = interest === k
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('ri', on ? '' : k)}
                    className={cx(
                      'min-h-10 px-3.5 rounded-full border text-[14px] flex items-center gap-1.5 transition-colors',
                      on ? 'bg-primary border-primary text-white font-semibold' : 'bg-white border-line-strong text-ink-2 hover:border-primary',
                    )}
                  >
                    <span aria-hidden="true">{RIASEC_ICON[k]}</span> {RIASEC_TH[k]}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2 max-w-[520px]">
            กลุ่มอาชีพที่ใช้ทักษะคล้ายกัน (③ จัดกลุ่มด้วย K-Means)
            <select value={cluster} onChange={(e) => set('c', e.target.value)} className="min-h-11 px-3 rounded-control border border-line-strong bg-white text-[15px] font-normal text-ink">
              <option value="">ทุกกลุ่ม</option>
              {Object.entries(clusters)
                .sort((a, b) => a[1].localeCompare(b[1], 'th'))
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        </section>
      ) : (
        <p className="m-0 text-[13px] text-muted">โหมดตัวอย่าง: ค้นหาได้อย่างเดียว — เชื่อม backend เพื่อกรองตามความสนใจและกลุ่มอาชีพ</p>
      )}

      {/* ---------- ผลลัพธ์ ---------- */}
      <div id="results" className="scroll-mt-24 flex flex-wrap justify-between items-center gap-3">
        <span className="text-[15px]" aria-live="polite">
          {loading ? 'กำลังโหลด…' : (
            <>
              พบ <b className="text-primary text-[18px]">{filtered.length}</b> อาชีพ
            </>
          )}
        </span>
        {active && (
          <button type="button" onClick={() => (setParams({}, { replace: true }), setShown(PAGE))} className={cx(btn.ghost, 'min-h-10 text-sm')}>
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {q.isError ? (
        <ErrorState message="โหลดรายชื่ออาชีพไม่สำเร็จ" error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-3" role="status">
          <span className="sr-only">กำลังโหลดรายชื่ออาชีพ…</span>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-tile" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="ไม่พบอาชีพที่ตรงกับเงื่อนไข"
          desc="ลองพิมพ์ชื่อภาษาอังกฤษ ใช้คำที่สั้นลง หรือล้างตัวกรองบางอย่าง"
          action={
            <button type="button" onClick={() => setParams({}, { replace: true })} className={btn.secondary}>
              ล้างตัวกรองทั้งหมด
            </button>
          }
        />
      ) : (
        <>
          <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-3">
            {filtered.slice(0, shown).map((c, i) => (
              <li key={c.code} className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i % PAGE, 12) * 30}ms` }}>
                <CareerCard c={c} />
              </li>
            ))}
          </ul>
          {shown < filtered.length && (
            <button type="button" onClick={() => setShown((n) => n + PAGE * 2)} className={cx(btn.secondary, 'self-center')}>
              แสดงเพิ่ม ({filtered.length - shown} อาชีพ)
            </button>
          )}
        </>
      )}
    </Main>
  )
}
