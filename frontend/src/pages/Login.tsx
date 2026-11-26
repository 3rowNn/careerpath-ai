import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Sparkle } from '../components/icons'
import { Logo } from '../components/Layout'
import { btn, cx } from '../components/ui'
import { ApiError, login as loginApi, register } from '../api/account'
import { IS_DEMO } from '../api/client'
import { useApp } from '../lib/store'

const input =
  'font-[inherit] text-[15px] px-3.5 py-3 min-h-12 box-border border border-line-strong rounded-control bg-white text-ink w-full focus:border-primary outline-none'

export default function Login() {
  const [params, setParams] = useSearchParams()
  const reg = params.get('mode') === 'register'
  const setMode = (m: 'login' | 'register') => {
    const n = params.get('next')
    setParams({ ...(m === 'register' ? { mode: 'register' } : {}), ...(n ? { next: n } : {}) }, { replace: true })
  }
  const { signIn, user } = useApp()
  const nav = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  // กลับไปหน้าที่ถูกส่งมาจาก RequireAuth — รับเฉพาะ path ในเว็บนี้ (กัน open redirect)
  const nextRaw = params.get('next')
  // กลับไปหน้าที่ตั้งใจไว้ (เช่น /careers จากปุ่มบันทึกผล) — ยกเว้นหน้าบัญชี: เข้าสู่ระบบแล้วไปหน้าแรกเสมอ
  const next =
    nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') && !nextRaw.startsWith('/account') ? nextRaw : null

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email') ?? '').trim()
    const password = String(f.get('password') ?? '')
    const name = String(f.get('fullname') ?? '').trim() || email.split('@')[0]
    const status = reg ? String(f.get('role') ?? '') || null : null
    const remember = f.get('remember') === 'on'
    if (!email) return setError('กรอกอีเมล')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('รูปแบบอีเมลไม่ถูกต้อง')
    if (password.length < 8) return setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    if (new TextEncoder().encode(password).length > 72) return setError('รหัสผ่านยาวเกินไป (สูงสุด 72 ไบต์)')
    setBusy(true)
    setError('')
    try {
      const auth = reg ? await register({ email, password, name, status, remember }) : await loginApi({ email, password, remember })
      await signIn(auth, remember)
      nav(next ?? (reg ? '/assessment' : '/'))
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? 'ระบบบัญชียังไม่เปิด (เซิร์ฟเวอร์ไม่ได้ตั้งค่าฐานข้อมูล)'
          : err instanceof TypeError
            ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง'
            : (err as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-wrap bg-white">
      <section className="flex-[1_1_480px] bg-ink text-white p-8 sm:p-12 box-border flex flex-col justify-between gap-10">
        <Logo dark />
        <div className="flex flex-col gap-6 max-w-[480px]">
          <h1 className="m-0 text-[30px] sm:text-4xl leading-snug">
            ให้ AI จำเส้นทางอาชีพ
            <br />
            ของคุณไว้ให้
          </h1>
          <p className="m-0 text-on-dark text-[17px] leading-relaxed">
            สมัครเพื่อบันทึกผลวิเคราะห์ ติดตามความคืบหน้า และให้ AI ปรับคำแนะนำตามพัฒนาการของคุณทุกครั้งที่กลับมา
          </p>
          <ul className="list-none m-0 p-0 flex flex-col gap-3.5">
            {['บันทึกผล Career Matching และ Skill Gap', 'ติดตาม Learning Roadmap ของตัวเอง', 'AI Advisor จำบริบทและประวัติการคุย'].map((t) => (
              <li key={t} className="flex gap-3 items-center">
                <span className="w-8 h-8 shrink-0 rounded-lg bg-dark-2 flex items-center justify-center text-primary-mid">
                  <Check />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-dark-2 border border-dark-line rounded-tile px-[18px] py-4 flex gap-3 max-w-[480px]">
          <Sparkle className="text-primary-mid shrink-0 mt-0.5" />
          <span className="text-sm text-on-dark-strong leading-relaxed">
            “ตั้งแต่ครั้งก่อน ทักษะครอบคลุมสำหรับพยาบาลวิชาชีพของคุณขยับขึ้นแล้ว” — ตัวอย่าง Insight ที่จะเห็นใน Dashboard
          </span>
        </div>
      </section>

      <section className="flex-[1_1_480px] px-6 py-12 box-border flex items-center justify-center">
        <div className="w-full max-w-[420px] flex flex-col gap-6">
          <div role="tablist" aria-label="เลือกโหมด" className="flex bg-track rounded-xl p-1">
            {(
              [
                ['login', 'เข้าสู่ระบบ'],
                ['register', 'สมัครสมาชิก'],
              ] as const
            ).map(([m, label]) => {
              const on = (m === 'register') === reg
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setMode(m)}
                  className={cx(
                    'flex-1 min-h-11 text-[15px] border-0 rounded-[9px]',
                    on ? 'bg-white text-ink font-semibold shadow-sm' : 'bg-transparent text-muted font-medium',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-[26px]">{reg ? 'สร้างบัญชีใหม่' : 'ยินดีต้อนรับกลับมา'}</h2>
            <p className="m-0 text-muted">{reg ? 'เริ่มต้นให้ AI วิเคราะห์เส้นทางอาชีพของคุณ' : 'เข้าสู่ระบบเพื่อดูผลวิเคราะห์และ Roadmap ของคุณ'}</p>
          </div>

          {IS_DEMO ? (
            <p className="m-0 text-[13px] text-warn-deep bg-warn-soft rounded-control px-3 py-2.5 leading-relaxed">
              โหมดตัวอย่างไม่มีระบบบัญชี — เชื่อมต่อ backend เพื่อสมัครสมาชิก (ยังทำแบบประเมินได้โดยไม่ต้องสมัคร)
            </p>
          ) : user ? (
            <p className="m-0 text-[13px] text-ink-2 bg-page border border-line rounded-control px-3 py-2.5 leading-relaxed">
              เข้าสู่ระบบอยู่แล้วในชื่อ <b>{user.name}</b> — <Link to="/account">ไปที่บัญชีของฉัน</Link>
            </p>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            {reg && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fullname" className="text-sm font-semibold">
                  ชื่อ-นามสกุล
                </label>
                <input id="fullname" name="fullname" type="text" autoComplete="name" placeholder="ชื่อของคุณ" className={input} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-semibold">
                อีเมล
              </label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" className={input} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <label htmlFor="pw" className="text-sm font-semibold">
                  รหัสผ่าน
                </label>
                {!reg && (
                  <button type="button" className="text-sm text-primary bg-transparent border-0 p-0 min-h-0 underline-offset-2 hover:underline" aria-expanded={forgot} onClick={() => setForgot((v) => !v)}>
                    ลืมรหัสผ่าน?
                  </button>
                )}
              </div>
              {forgot && !reg && (
                <p className="m-0 text-[13px] text-ink-2 bg-page border border-line rounded-control px-3 py-2.5 leading-relaxed">
                  ยังไม่รองรับการรีเซ็ตรหัสผ่าน (ระบบยังไม่มีการส่งอีเมล) — ถ้าจำรหัสไม่ได้ สมัครบัญชีใหม่ได้ ผลประเมินที่ทำไว้ในเบราว์เซอร์นี้จะย้ายเข้าบัญชีใหม่
                </p>
              )}
              <input
                id="pw"
                name="password"
                type="password"
                autoComplete={reg ? 'new-password' : 'current-password'}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className={input}
              />
            </div>
            {reg && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="role" className="text-sm font-semibold">
                  คุณคือ
                </label>
                <select id="role" name="role" className={input}>
                  <option>เรียนจบแล้ว ยังไม่มีงาน</option>
                  <option>ยังไม่รู้ว่าตัวเองเก่งอะไร / อยากเป็นอะไร</option>
                  <option>นักเรียน / นักศึกษา</option>
                  <option>ทำงานอยู่ อยากเปลี่ยนสายงาน</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2.5 min-h-11 text-sm text-ink-2 cursor-pointer">
              <input type="checkbox" name="remember" defaultChecked className="w-[18px] h-[18px] accent-primary" />
              จดจำฉันในเครื่องนี้
            </label>
            {error && (
              <p role="alert" className="m-0 text-sm text-warn-ink bg-warn-soft rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || IS_DEMO} className={btn.primary}>
              {busy ? 'กำลังดำเนินการ…' : reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="text-center text-sm text-muted">
            ยังไม่พร้อมสมัคร?{' '}
            <Link to="/assessment" className="font-semibold">
              ลองทำแบบประเมินก่อน
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
