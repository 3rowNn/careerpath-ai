import { useState } from 'react'
import { cx } from './ui'

/*
 * ลิงก์ค้นหางานจริงในเว็บหางาน — เปิดแท็บใหม่ ไม่ส่งข้อมูลผู้ใช้ไปไหน (ส่งแค่คำค้น)
 * ชื่ออาชีพไทยแปลโดย Claude และมักยาว → ตัดวงเล็บ/คำต่อท้าย และให้ผู้ใช้แก้คำค้นเองได้
 */
const shortTh = (t: string) => t.replace(/\s*[(（].*?[)）]/g, '').split(/[,/]| และ| หรือ/)[0].trim()
const shortEn = (t: string) => t.replace(/\s*\(.*?\)/g, '').split(/,| and /)[0].trim()

const SITES = [
  { name: 'JobThai', lang: 'th', url: (q: string) => `https://www.jobthai.com/th/jobs?keyword=${encodeURIComponent(q)}` },
  { name: 'JobsDB', lang: 'th', url: (q: string) => `https://th.jobsdb.com/${encodeURIComponent(q.replace(/\s+/g, '-'))}-jobs` },
  { name: 'LinkedIn', lang: 'en', url: (q: string) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Thailand` },
] as const

export function JobSearch({ titleTh, titleEn, compact = false }: { titleTh: string; titleEn?: string; compact?: boolean }) {
  const [th, setTh] = useState(() => shortTh(titleTh))
  const en = shortEn(titleEn ?? titleTh)
  const links = SITES.map((s) => ({ ...s, q: s.lang === 'th' ? th.trim() || shortTh(titleTh) : en }))

  if (compact)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">🔎 หางานนี้ในไทย:</span>
        {links.map((l) => (
          <a
            key={l.name}
            href={l.url(l.q)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm bg-page border border-line px-2.5 py-1 rounded-full no-underline !text-ink hover:border-primary hover:!text-primary"
          >
            {l.name} ↗
          </a>
        ))}
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
        คำค้นภาษาไทย
        <input
          value={th}
          onChange={(e) => setTh(e.target.value)}
          maxLength={60}
          className="min-h-11 px-3 rounded-control border border-line-strong bg-white text-[15px] font-normal text-ink focus:border-primary outline-none"
        />
        <span className="font-normal text-[12px] text-muted">ชื่ออาชีพแปลโดย AI — ถ้าไม่เจองาน ลองใช้คำสั้นลงหรือคำที่ใช้ในประกาศงานจริง</span>
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-2">
        {links.map((l) => (
          <a
            key={l.name}
            href={l.url(l.q)}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(
              'flex flex-col gap-0.5 rounded-tile border border-line p-3 no-underline !text-ink transition-[border-color,transform] hover:border-primary hover:-translate-y-0.5',
            )}
          >
            <span className="font-semibold">{l.name} ↗</span>
            <span className="text-[12px] text-muted truncate">“{l.q}”</span>
          </a>
        ))}
      </div>
      <span className="text-[12px] text-muted leading-relaxed">
        เปิดผลค้นหาในเว็บหางานภายนอก (แท็บใหม่) — ส่งไปแค่คำค้น ไม่ส่งข้อมูลหรือผลประเมินของคุณ · จำนวนงานขึ้นกับประกาศในแต่ละเว็บ
      </span>
    </div>
  )
}
