import type { Confidence, Contribution, ExplainResult } from '../api/types'
import { DOMAIN_LABEL, pct, questionOf, toAnswer } from '../lib/labels'
import { cx } from './ui'

const LEVEL = {
  high: { label: 'ความมั่นใจสูง', tone: 'bg-good-soft text-good-ink', bar: 'bg-good', icon: '▲' },
  medium: { label: 'ความมั่นใจปานกลาง', tone: 'bg-primary-soft text-primary', bar: 'bg-primary', icon: '■' },
  low: { label: 'ความมั่นใจต่ำ', tone: 'bg-warn-soft text-warn-ink', bar: 'bg-warn', icon: '▼' },
} as const

/** ความมั่นใจของโมเดล — calibrate จากผู้ใช้จำลอง (datasets/ml/calibrate_confidence.py) */
/** collapsible = พับรายละเอียดไว้ เห็นแค่หัวข้อ + ระดับความมั่นใจ */
export function ConfidenceCard({ c, collapsible = false }: { c: Confidence; collapsible?: boolean }) {
  const L = LEVEL[c.level]
  const head = (
    <>
      <span className="text-sm font-semibold flex items-center gap-2">
        {collapsible && <span className="transition-transform group-open/conf:rotate-90" aria-hidden>▸</span>}
        ความมั่นใจของโมเดล
      </span>
      <span className={cx('text-sm font-semibold px-2.5 py-1 rounded-full', L.tone)}>
        <span aria-hidden>{L.icon}</span> {L.label}
      </span>
    </>
  )
  if (collapsible)
    return (
      <details className="group/conf">
        <summary className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2">{head}</summary>
        <div className="pt-3">
          <ConfidenceBody c={c} L={L} />
        </div>
      </details>
    )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">{head}</div>
      <ConfidenceBody c={c} L={L} />
    </div>
  )
}

function ConfidenceBody({ c, L }: { c: Confidence; L: (typeof LEVEL)[keyof typeof LEVEL] }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex gap-1"
        role="img"
        aria-label={`คะแนนอันดับ 1 อยู่ช่วงที่ ${c.bin + 1} จาก ${c.n_bins} (ต่ำ → สูง)`}
      >
        {Array.from({ length: c.n_bins }, (_, i) => (
          <span key={i} className={cx('h-2 flex-1 rounded-full', i <= c.bin ? L.bar : 'bg-track')} />
        ))}
      </div>
      <p className="m-0 text-sm leading-relaxed text-ink-2">
        ในผู้ใช้จำลองที่ได้คะแนนช่วงเดียวกับคุณ อาชีพอันดับ 1 ตรงกับอาชีพจริง <b>{pct(c.sim_top1_accuracy)}</b> และอาชีพจริงอยู่ใน
        Top 5 <b>{pct(c.sim_top5_accuracy)}</b>
      </p>
      <p className="m-0 text-sm leading-relaxed text-ink-2">
        ① Cosine กับ ②a MLP {c.models_agree ? <b>เลือกอันดับ 1 ตรงกัน</b> : <b>เลือกอันดับ 1 ต่างกัน</b>} (ในผู้ใช้จำลอง กรณีนี้อันดับ 1
        ถูก {pct(c.sim_top1_if_agreement)})
      </p>
      {c.level === 'low' && (
        <p className="m-0 text-sm leading-relaxed text-muted">
          ความมั่นใจต่ำไม่ได้แปลว่าผลผิด แต่คำตอบของคุณใกล้กับหลายอาชีพพอ ๆ กัน ควรดูทั้ง 5 อาชีพ ไม่ใช่แค่อันดับ 1
        </p>
      )}
      <span className="text-xs text-muted">วัดจากผู้ใช้จำลอง {c.n_simulated.toLocaleString()} คน ไม่ใช่คนจริง</span>
    </div>
  )
}

function Row({ r, max }: { r: Contribution; max: number }) {
  const pos = r.contribution > 0
  const w = (Math.abs(r.contribution) / max) * 100
  const tip = `คุณตอบ ${toAnswer(r.user)}/5 · อาชีพนี้ใช้ระดับ ${Math.round(r.required)}/100 · ${pos ? '+' : '−'}${Math.abs(r.share * 100).toFixed(1)}% ของคะแนนที่อธิบายได้`
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center" title={tip}>
      <span className="text-sm leading-snug min-w-0">{questionOf(r.feature, r.name)}</span>
      <span className={cx('text-sm font-semibold tabular-nums', pos ? 'text-primary' : 'text-ink-2')}>
        {pos ? '+' : '−'}
        {Math.abs(r.share * 100).toFixed(1)}%
      </span>
      <span className="col-span-2 flex items-center gap-2">
        <span className="h-2 grow bg-track rounded-full overflow-hidden">
          <span className={cx('block h-full rounded-full', pos ? 'bg-primary' : 'bg-ink-2')} style={{ width: `${Math.max(w, 2)}%` }} />
        </span>
        <span className="text-xs text-muted shrink-0 w-[150px] text-right">
          คุณ {toAnswer(r.user)}/5 · อาชีพนี้ {Math.round(r.required)}/100
        </span>
      </span>
    </li>
  )
}

/** ① แยกคะแนน Cosine เป็นรายคำถาม — ทำไมอาชีพนี้ได้คะแนนสูงกว่าอาชีพทั่วไป */
export function ExplainPanel({ e, title = 'ทำไมอาชีพนี้ขึ้นมา' }: { e: ExplainResult; title?: string }) {
  const all = [...e.positive, ...e.negative]
  const max = Math.max(...all.map((r) => Math.abs(r.contribution)), 1e-9)
  // รวมตามหัวข้อในแบบประเมิน (gtask + task อยู่หมวดเดียวกัน)
  const byLabel: Record<string, number> = {}
  for (const [d, v] of Object.entries(e.by_domain)) byLabel[DOMAIN_LABEL[d] ?? d] = (byLabel[DOMAIN_LABEL[d] ?? d] ?? 0) + v
  const domains = Object.entries(byLabel).sort((a, b) => b[1] - a[1])
  const dmax = Math.max(...domains.map(([, v]) => Math.abs(v)), 1e-9)
  return (
    <div className="border border-line rounded-xl p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] text-muted leading-relaxed">
          คำตอบของคุณคล้ายอาชีพนี้ {(e.similarity * 100).toFixed(1)}% เทียบกับค่าเฉลี่ยทุกอาชีพ {(e.mean_similarity * 100).toFixed(1)}% · อันดับ {e.rank_matching} จาก
          910 ใน ① · ส่วนต่างนี้แยกเป็นรายข้อได้พอดี
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-primary">ช่วยให้อาชีพนี้ขึ้นมา</span>
          <span className="text-xs text-muted -mt-1.5">อาชีพนี้ใช้ข้อนี้มากกว่าอาชีพทั่วไป และคุณก็ตอบข้อนี้ไว้ (ยิ่งตอบสูง ยิ่งช่วยมาก)</span>
          <ul className="m-0 p-0 list-none flex flex-col gap-3">
            {e.positive.map((r) => (
              <Row key={r.feature} r={r} max={max} />
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-ink-2">ทำให้คะแนนลดลง</span>
          <span className="text-xs text-muted -mt-1.5">คุณตอบข้อนี้ไว้ แต่อาชีพนี้ใช้น้อยกว่าอาชีพทั่วไป จึงไม่ได้ช่วย</span>
          <ul className="m-0 p-0 list-none flex flex-col gap-3">
            {e.negative.length ? e.negative.map((r) => <Row key={r.feature} r={r} max={max} />) : <li className="text-sm text-muted">—</li>}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted">รวมตามหมวดคำถาม</span>
        {domains.map(([d, v]) => (
          <div key={d} className="flex items-center gap-3 text-sm">
            <span className="w-[140px] shrink-0 truncate">{d}</span>
            <span className="grow h-2 relative bg-track rounded-full">
              <span
                className={cx('absolute inset-y-0 rounded-full', v >= 0 ? 'left-1/2 bg-primary' : 'right-1/2 bg-ink-2')}
                style={{ width: `${(Math.abs(v) / dmax) * 50}%` }}
              />
              <span className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-line-strong" />
            </span>
            <span className="w-12 text-right tabular-nums text-ink-2">{v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(3)}</span>
          </div>
        ))}
      </div>
      <span className="text-xs text-muted leading-relaxed">
        อธิบายเฉพาะ ① ซึ่งมีน้ำหนัก 0.9 ใน Ensemble · ②a MLP (0.1) แยกเป็นรายข้อแบบนี้ไม่ได้
      </span>
    </div>
  )
}
