import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/store'
import { LogoMark, Menu, UserIcon } from './icons'
import { cx, Spinner } from './ui'

type NavItem = { to: string; label: string; icon: string; desc?: string; end?: boolean }
type NavGroup = { label: string; icon: string; items: NavItem[] }

/** เมนูหลัก: รายการเดี่ยว + กลุ่ม (dropdown บนจอใหญ่ · หัวข้อย่อยบนมือถือ) */
const MENU: (NavItem | NavGroup)[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/assessment', label: 'แบบประเมิน', icon: '📝' },
  {
    label: 'อาชีพ',
    icon: '💼',
    items: [
      { to: '/careers', label: 'อาชีพที่แนะนำ', icon: '⭐', desc: 'Top 5 ที่เข้ากับคุณจากโมเดล ML' },
      { to: '/goal', label: 'อาชีพที่อยากเป็น', icon: '🎯', desc: 'เลือกเอง แล้วดูว่าห่างแค่ไหน' },
      { to: '/explore', label: 'สำรวจอาชีพ', icon: '🧭', desc: 'ค้นหาและเดินดู 910 อาชีพ' },
    ],
  },
  {
    label: 'พัฒนาตัวเอง',
    icon: '📈',
    items: [
      { to: '/skill-gap', label: 'Skill Gap', icon: '📊', desc: 'ทักษะที่ยังขาด เรียงตามความสำคัญ' },
      { to: '/roadmap', label: 'Roadmap', icon: '🗺️', desc: 'แผนเรียนรู้ทีละขั้น + ประเมินซ้ำ' },
    ],
  },
  { to: '/advisor', label: 'AI Advisor', icon: '💬' },
]
const isGroup = (m: NavItem | NavGroup): m is NavGroup => 'items' in m
/** รายการทั้งหมดแบบแบน (ใช้ที่ footer) */
const NAV: NavItem[] = MENU.flatMap((m) => (isGroup(m) ? m.items : [m]))

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2.5 no-underline font-bold text-lg shrink-0', dark ? '!text-white' : '!text-ink')}>
      <span className="w-9 h-9 rounded-control bg-[linear-gradient(135deg,#2747D0,#7c3aed)] flex items-center justify-center text-white shadow-card">
        <LogoMark />
      </span>
      <span>
        CareerPath <span className="text-primary">AI</span>
      </span>
    </Link>
  )
}

const pill = (active: boolean) =>
  cx(
    'relative flex items-center gap-1.5 px-3 py-2 rounded-full no-underline whitespace-nowrap text-[15px] transition-colors border-0',
    active ? 'bg-primary-soft !text-primary font-semibold' : '!text-ink-2 bg-transparent hover:bg-page hover:!text-ink',
  )

function DesktopGroup({ g }: { g: NavGroup }) {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = g.items.some((i) => loc.pathname.startsWith(i.to))
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} className={pill(active)}>
        <span aria-hidden>{g.icon}</span>
        {g.label}
        <span aria-hidden className={cx('text-[10px] transition-transform', open && 'rotate-180')}>
          ▼
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-2 z-30">
          <div className="w-[300px] bg-white border border-line rounded-card shadow-pop p-2 flex flex-col animate-fade-up [animation-duration:180ms]">
            {g.items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  cx('flex items-start gap-3 rounded-tile p-2.5 no-underline', isActive ? 'bg-primary-soft' : 'hover:bg-page')
                }
              >
                <span className="w-10 h-10 shrink-0 rounded-xl bg-page border border-line flex items-center justify-center text-[20px]" aria-hidden>
                  {i.icon}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="font-semibold !text-ink text-[15px]">{i.label}</span>
                  <span className="text-[13px] text-muted leading-snug">{i.desc}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Header() {
  const { user, result } = useApp()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const initial = user?.name.trim().charAt(0).toUpperCase() ?? ''

  return (
    <header
      className={cx(
        'sticky top-0 z-20 border-b transition-[background-color,box-shadow,border-color] duration-200',
        scrolled || open ? 'bg-white/90 backdrop-blur-md border-line shadow-card' : 'bg-white/70 backdrop-blur-md border-transparent',
      )}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Logo />

        {/* จอใหญ่ */}
        <nav aria-label="เมนูหลัก" className="hidden lg:flex items-center gap-0.5 mx-auto">
          {MENU.map((m) =>
            isGroup(m) ? (
              <DesktopGroup key={m.label} g={m} />
            ) : (
              <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => pill(isActive)}>
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="ml-auto lg:ml-0 flex items-center gap-2">
          {!result && (
            <Link to="/assessment" className="hidden sm:inline-flex lg:hidden xl:inline-flex items-center min-h-10 px-4 rounded-full bg-primary !text-white text-sm font-semibold no-underline hover:bg-primary-hover shadow-card">
              เริ่มประเมิน
            </Link>
          )}
          {user ? (
            <Link
              to="/account"
              title={user.name}
              aria-label={`บัญชีของ ${user.name}`}
              className="hidden lg:flex items-center gap-2 pl-1 pr-3 min-h-10 rounded-full border border-line bg-white no-underline !text-ink hover:border-primary"
            >
              <span className="w-8 h-8 rounded-full bg-[linear-gradient(135deg,#2747D0,#7c3aed)] text-white text-sm font-bold flex items-center justify-center">
                {initial || <UserIcon />}
              </span>
              <span className="text-sm font-medium max-w-[110px] truncate">{user.name}</span>
            </Link>
          ) : (
            <Link to="/login" className="hidden lg:inline-flex items-center gap-1.5 min-h-10 px-4 rounded-full border border-line-strong bg-white !text-ink text-sm font-semibold no-underline hover:border-primary">
              <UserIcon /> เข้าสู่ระบบ
            </Link>
          )}
          <button
            type="button"
            className="lg:hidden w-11 h-11 rounded-full border border-line-strong bg-white flex items-center justify-center text-ink"
            aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <span className="text-[20px] leading-none">✕</span> : <Menu />}
          </button>
        </div>
      </div>

      {/* มือถือ */}
      {open && (
        <nav aria-label="เมนูหลัก" className="lg:hidden border-t border-line bg-white max-h-[calc(100vh-64px)] overflow-y-auto animate-fade-up [animation-duration:180ms]">
          <div className="max-w-[1200px] mx-auto px-4 py-3 flex flex-col gap-1">
            <NavLink to="/" end className={({ isActive }) => cx(pill(isActive), 'rounded-tile')}>
              <span aria-hidden>🏡</span> หน้าแรก
            </NavLink>
            {MENU.map((m) =>
              isGroup(m) ? (
                <div key={m.label} className="flex flex-col gap-1 pt-2">
                  <span className="px-3 text-[12px] font-semibold text-muted">
                    {m.icon} {m.label}
                  </span>
                  {m.items.map((i) => (
                    <NavLink key={i.to} to={i.to} className={({ isActive }) => cx(pill(isActive), 'rounded-tile pl-5')}>
                      <span aria-hidden>{i.icon}</span> {i.label}
                    </NavLink>
                  ))}
                </div>
              ) : (
                <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => cx(pill(isActive), 'rounded-tile')}>
                  <span aria-hidden>{m.icon}</span> {m.label}
                </NavLink>
              ),
            )}
            <Link
              to={user ? '/account' : '/login'}
              className="mt-2 flex items-center gap-3 rounded-tile border border-line p-3 no-underline !text-ink hover:border-primary"
            >
              <span className="w-9 h-9 rounded-full bg-[linear-gradient(135deg,#2747D0,#7c3aed)] text-white font-bold flex items-center justify-center">
                {initial || <UserIcon />}
              </span>
              <span className="flex flex-col">
                <span className="font-semibold">{user ? user.name : 'เข้าสู่ระบบ / สมัครสมาชิก'}</span>
                <span className="text-[13px] text-muted">{user ? 'บัญชีของฉัน' : 'บันทึกผลไว้ดูได้ทุกเครื่อง'}</span>
              </span>
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </div>
      <footer className="border-t border-line bg-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-8 text-sm">
          <div className="flex flex-col gap-3">
            <Logo />
            <p className="m-0 text-muted leading-relaxed">AI Career Predictor + Skill Gap Analyzer — โปรเจกต์ Data/ML แนะนำอาชีพด้วย Machine Learning</p>
          </div>
          <nav aria-label="ลิงก์ท้ายหน้า" className="flex flex-col gap-2">
            <span className="font-semibold text-ink">เริ่มใช้งาน</span>
            {NAV.filter((n) => ['/assessment', '/careers', '/skill-gap', '/advisor'].includes(n.to)).map((n) => (
              <Link key={n.to} to={n.to} className="!text-muted hover:!text-primary no-underline">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 text-muted">
            <span className="font-semibold text-ink">ที่มาของข้อมูล</span>
            <span>O*NET — โปรไฟล์ 910 อาชีพ (ตลาดแรงงานสหรัฐฯ)</span>
            <span>NCES CIP–SOC — สาขาที่เรียน → อาชีพ</span>
            <span>ชื่อภาษาไทยแปลโดย AI ไม่ใช่ชื่อทางการ</span>
          </div>
          <div className="flex flex-col gap-2 text-muted">
            <span className="font-semibold text-ink">ข้อควรรู้</span>
            <span>ผลลัพธ์เป็นข้อมูลประกอบการตัดสินใจ ไม่ใช่คำตัดสินสุดท้าย</span>
            <span>ความแม่นของโมเดลวัดจากผู้ใช้จำลอง ยังไม่ได้วัดกับคนจริง</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function Main({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cx('max-w-[1200px] mx-auto px-4 sm:px-6 pt-10 pb-16 flex flex-col gap-6', className)}>{children}</main>
}
