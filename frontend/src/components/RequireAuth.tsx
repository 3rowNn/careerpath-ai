import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { IS_DEMO } from '../api/client'
import { Main } from './Layout'
import { btn, EmptyState } from './ui'
import { Lock } from './icons'
import { useApp } from '../lib/store'

/** หน้าที่ต้องมีบัญชี — ยังไม่เข้าสู่ระบบ → ไปหน้า Login แล้วกลับมาหน้าเดิม (?next=) */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, token } = useApp()
  const loc = useLocation()
  if (IS_DEMO)
    return (
      <Main>
        <EmptyState
          icon={<Lock />}
          title="โหมดตัวอย่างไม่มีระบบบัญชี"
          desc="เชื่อมต่อ backend (ตั้ง VITE_API_URL) เพื่อใช้บัญชี — ยังทำแบบประเมินได้โดยไม่ต้องสมัคร"
          action={
            <Link to="/assessment" className={btn.primary}>
              ทำแบบประเมิน
            </Link>
          }
        />
      </Main>
    )
  if (!user || !token) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}
