import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as acc from '../api/account'
import { listMajors, thaiTitle } from '../api/client'
import { Main } from '../components/Layout'
import { Check, Trash } from '../components/icons'
import { Badge, btn, Card, CoverageValue, EmptyState, ErrorState, PageHead, RankNote, SectionTitle, SkeletonRows } from '../components/ui'
import { useApp } from '../lib/store'

/** ตัวเลือกโปรไฟล์ — เก็บไว้ดูเอง ไม่ใช่ input ของโมเดล */
const STATUS = ['เรียนจบแล้ว ยังไม่มีงาน', 'ยังไม่รู้ว่าตัวเองเก่งอะไร / อยากเป็นอะไร', 'นักเรียน / นักศึกษา', 'ทำงานอยู่ อยากเปลี่ยนสายงาน']
const EDUCATION = ['มัธยมศึกษา / ปวช.', 'ปวส. / อนุปริญญา', 'ปริญญาตรี', 'ปริญญาโทขึ้นไป', 'อื่น ๆ']

const field = 'font-[inherit] text-[15px] px-3.5 py-3 min-h-12 box-border border border-line-strong rounded-control bg-white text-ink w-full focus:border-primary outline-none'
const fmt = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

/** ตัวเลือกที่มีอยู่ + ค่าที่บันทึกไว้แล้วแต่ไม่อยู่ในรายการ (ไม่ให้ค่าเดิมหาย) */
const withCurrent = (opts: string[], cur: string | null) => (cur && !opts.includes(cur) ? [cur, ...opts] : opts)

export default function Account() {
  const app = useApp()
  const user = app.user!
  const token = app.token!
  const nav = useNavigate()
  const qc = useQueryClient()
  const majors = useQuery({ queryKey: ['majors'], queryFn: listMajors, staleTime: Infinity })
  const history = useQuery({ queryKey: ['assessments', user.id], queryFn: () => acc.listAssessments(token) })
  const faculties = [...new Set(majors.data?.map((m) => m.faculty) ?? [])]

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name') ?? '').trim()
    if (!name) return setMsg({ ok: false, text: 'กรอกชื่อ' })
    setSaving(true)
    setMsg(null)
    try {
      const u = await acc.updateMe(token, { name, status: String(f.get('status') ?? ''), education: String(f.get('education') ?? '') })
      app.setUser(u)
      const major = String(f.get('major') ?? '') || null
      if (major !== app.major) app.setMajor(major)
      setMsg({ ok: true, text: 'บันทึกโปรไฟล์แล้ว' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    app.logout()
    qc.clear()
    nav('/')
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await acc.deleteMe(token)
      logout()
    } catch (err) {
      setMsg({ ok: false, text: `ลบบัญชีไม่สำเร็จ: ${(err as Error).message}` })
      setDeleting(false)
    }
  }

  return (
    <Main>
      <PageHead
        eyebrow="บัญชีของฉัน"
        title={user.name}
        desc={user.email}
        right={
          <button type="button" className={btn.secondary} onClick={logout}>
            ออกจากระบบ
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        <Card className="flex flex-col gap-5">
          <SectionTitle title="โปรไฟล์" desc="ข้อมูลส่วนนี้ไม่ได้ใช้คำนวณอันดับอาชีพ ยกเว้นสาขาที่จบ ซึ่งใช้กับการ์ด “อาชีพในสายที่คุณเรียนจบ”" />
          <form className="flex flex-col gap-4" onSubmit={save} noValidate>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              ชื่อ
              <input name="name" defaultValue={user.name} autoComplete="name" maxLength={120} className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              อีเมล
              <input value={user.email} readOnly className={`${field} bg-page text-muted`} />
              <span className="font-normal text-[13px] text-muted">ยังเปลี่ยนอีเมลไม่ได้</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              ระดับการศึกษา
              <select name="education" defaultValue={user.education ?? ''} className={field}>
                <option value="">— ไม่ระบุ —</option>
                {withCurrent(EDUCATION, user.education).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              สาขาที่จบ
              {majors.isError ? (
                <ErrorState message="โหลดรายชื่อสาขาไม่สำเร็จ" error={majors.error} onRetry={() => majors.refetch()} />
              ) : (
                <select name="major" key={majors.data ? 'ready' : 'loading'} defaultValue={app.major ?? ''} disabled={!majors.data} className={field}>
                  <option value="">{majors.data ? '— ไม่ระบุ —' : 'กำลังโหลดรายชื่อสาขา…'}</option>
                  {faculties.map((f) => (
                    <optgroup key={f} label={f}>
                      {majors.data!
                        .filter((m) => m.faculty === f)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.major_th}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              สถานะตอนนี้
              <select name="status" defaultValue={user.status ?? ''} className={field}>
                <option value="">— ไม่ระบุ —</option>
                {withCurrent(STATUS, user.status).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            {msg && (
              <p role={msg.ok ? 'status' : 'alert'} className={`m-0 text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-good-deep bg-good-soft' : 'text-warn-ink bg-warn-soft'}`}>
                {msg.text}
              </p>
            )}
            <button type="submit" disabled={saving} className={btn.primary}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}
            </button>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <SectionTitle
              title="ประวัติการประเมิน"
              desc="ผลทุกครั้งคำนวณที่เซิร์ฟเวอร์ด้วยโมเดลตัวเดียวกัน · ตัวเลข % = ทักษะครอบคลุม ไม่ใช่ % ความเหมาะ"
              right={
                <Link to="/assessment" className={btn.ghost}>
                  ประเมินใหม่
                </Link>
              }
            />
            {history.isPending ? (
              <SkeletonRows rows={3} />
            ) : history.isError ? (
              <ErrorState error={history.error} onRetry={() => history.refetch()} />
            ) : history.data.length === 0 ? (
              <EmptyState
                title="ยังไม่มีผลประเมินในบัญชีนี้"
                desc="ทำแบบประเมิน 76 ข้อ แล้วผลจะถูกบันทึกไว้ที่นี่"
                action={
                  <Link to="/assessment" className={btn.primary}>
                    เริ่มทำแบบประเมิน
                  </Link>
                }
              />
            ) : (
              <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
                {[...history.data].reverse().map((h, i) => (
                  <HistoryRow key={h.id} h={h} token={token} latest={i === 0} open={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)} />
                ))}
              </ol>
            )}
          </Card>

          <LearningLog />

          <Card className="flex flex-col gap-3 border-warn-soft">
            <SectionTitle title="ลบบัญชี" desc="ลบบัญชี ผลประเมิน เป้าหมาย Roadmap และประวัติแชททั้งหมดออกจากเซิร์ฟเวอร์ — ย้อนกลับไม่ได้" />
            {confirmDelete ? (
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-sm text-warn-ink font-semibold">ยืนยันลบบัญชี {user.email}?</span>
                <button type="button" className={`${btn.primary} !bg-warn-ink`} disabled={deleting} onClick={remove}>
                  {deleting ? 'กำลังลบ…' : 'ลบถาวร'}
                </button>
                <button type="button" className={btn.secondary} onClick={() => setConfirmDelete(false)}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button type="button" className={`${btn.secondary} self-start !text-warn-ink`} onClick={() => setConfirmDelete(true)}>
                <Trash /> ลบบัญชี
              </button>
            )}
          </Card>
        </div>
      </div>
    </Main>
  )
}

function HistoryRow({ h, token, latest, open, onToggle }: { h: acc.ServerHistory; token: string; latest: boolean; open: boolean; onToggle: () => void }) {
  const detail = useQuery({ queryKey: ['assessment', h.id], queryFn: () => acc.getAssessment(token, h.id), enabled: open, staleTime: Infinity })
  const id = `assessment-${h.id}`
  return (
    <li className="border border-line rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="w-full min-h-14 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 bg-transparent border-0 text-left text-ink rounded-xl hover:bg-page"
      >
        <span className="text-sm text-muted min-w-[150px]">{fmt(h.created_at)}</span>
        <span className="flex-1 min-w-0 font-semibold truncate">อันดับ 1: {thaiTitle(h.top_code, h.top_code)}</span>
        {latest && <Badge tone="good">ล่าสุด</Badge>}
        <span className="text-sm text-primary">{open ? 'ซ่อน' : 'ดู Top 5'}</span>
      </button>
      {open && (
        <div id={id} className="px-4 pb-4 flex flex-col gap-2">
          {detail.isPending ? (
            <SkeletonRows rows={5} />
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : (
            <>
              <ol className="m-0 p-0 list-none flex flex-col gap-1.5">
                {detail.data.result.careers.map((c, i) => (
                  <li key={c.code} className="flex items-center gap-3">
                    <span className="w-7 text-sm font-bold text-ink-2">{i + 1}</span>
                    <Link to={`/careers/${encodeURIComponent(c.code)}`} className="flex-1 min-w-0 truncate" title={c.title_en}>
                      {c.title}
                    </Link>
                    <CoverageValue value={c.skill_coverage_percent} />
                  </li>
                ))}
              </ol>
              <RankNote />
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** บันทึกการเรียน — อาชีพที่เรียน Roadmap ครบทุกรายการแล้ว (บันทึกอัตโนมัติจากหน้า Roadmap) */
function LearningLog() {
  const app = useApp()
  const nav = useNavigate()
  const [confirm, setConfirm] = useState<string | null>(null)
  const openable = new Set([...(app.result?.careers.map((c) => c.code) ?? []), ...(app.goal ? [app.goal.code] : [])])
  const day = (ms: number) => new Date(ms).toLocaleDateString('th-TH', { dateStyle: 'medium' })

  return (
    <Card className="flex flex-col gap-4">
      <SectionTitle
        title="บันทึกการเรียน"
        desc="อาชีพที่คุณเรียน Roadmap ครบทุกรายการแล้ว — บันทึกให้อัตโนมัติเมื่อ Roadmap ครบ"
        right={app.learning.length > 0 ? <Badge tone="good">{app.learning.length} อาชีพ</Badge> : undefined}
      />
      {app.learning.length === 0 ? (
        <EmptyState
          title="ยังไม่มีอาชีพที่เรียนครบ"
          desc="ทำ Roadmap ของอาชีพที่สนใจให้ครบทุกรายการ แล้วอาชีพนั้นจะถูกบันทึกไว้ที่นี่"
          action={
            <Link to="/roadmap" className={btn.primary}>
              ไปที่ Roadmap
            </Link>
          }
        />
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
          {app.learning.map((r) => {
            const verified = r.skills > 0 && r.passed >= r.skills
            return (
              <li key={r.code} className="border border-line rounded-tile p-4 flex flex-wrap gap-3 items-start">
                <span className="w-10 h-10 shrink-0 rounded-full bg-good-soft text-good flex items-center justify-center">
                  <Check />
                </span>
                <div className="flex flex-col gap-1.5 flex-[1_1_220px] min-w-0">
                  <Link to={`/careers/${r.code}`} className="font-semibold text-ink">
                    {r.title}
                  </Link>
                  <span className="text-sm text-muted">
                    เรียนครบ {r.total} รายการ · {day(r.completedAt)}
                  </span>
                  <Badge tone={verified ? 'good' : 'warn'} className="self-start">
                    {verified
                      ? `ผ่านเกณฑ์ครบ ${r.skills} ทักษะจากการประเมินซ้ำ`
                      : `ผ่านเกณฑ์จากการประเมินซ้ำ ${r.passed} / ${r.skills} ทักษะ`}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {openable.has(r.code) && (
                    <button
                      type="button"
                      className={btn.ghost}
                      onClick={() => {
                        app.setTarget(r.code)
                        nav('/roadmap')
                      }}
                    >
                      เปิด Roadmap
                    </button>
                  )}
                  {confirm === r.code ? (
                    <>
                      <button type="button" className={`${btn.ghost} !text-warn-ink`} onClick={() => app.deleteLearning(r.code)}>
                        ยืนยันลบ
                      </button>
                      <button type="button" className={btn.ghost} onClick={() => setConfirm(null)}>
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <button type="button" aria-label={`ลบ ${r.title} ออกจากบันทึก`} className={`${btn.ghost} !px-3`} onClick={() => setConfirm(r.code)}>
                      <Trash />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <p className="m-0 text-[13px] text-muted leading-relaxed">
        “ผ่านเกณฑ์” นับจากคะแนนประเมินซ้ำเท่านั้น ส่วนรายการที่ติ๊กเองว่าเรียนแล้วยังไม่ถือว่าผ่าน · ลบออกจากบันทึกแล้ว ถ้า Roadmap ยังครบอยู่ จะถูกบันทึกใหม่เมื่อเปิดหน้า Roadmap ของอาชีพนั้น
      </p>
    </Card>
  )
}
