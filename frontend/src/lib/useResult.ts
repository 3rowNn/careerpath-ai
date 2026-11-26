import { useMemo } from 'react'
import { localize, SAMPLE_RECOMMEND as SAMPLE } from '../api/client'
import { useApp } from './store'

/** ผลประเมินของผู้ใช้ — ถ้ายังไม่เคยทำ ใช้ผลของผู้ใช้ตัวอย่างเพื่อให้ดูหน้าตาได้ (isSample = true) */
export function useResult() {
  const { result: stored, targetCode, goal: storedGoal } = useApp()
  // ผลที่เก็บใน browser ก่อนมีชื่อไทยยังเป็นชื่ออังกฤษ — แปลงตอนอ่าน
  const result = useMemo(() => (stored ? localize(stored) : null), [stored])
  const goal = useMemo(() => (storedGoal ? localize(storedGoal) : null), [storedGoal])
  const r = result ?? SAMPLE
  const inTop = targetCode ? r.careers.find((c) => c.code === targetCode) : undefined
  // อาชีพที่ผู้ใช้เลือกเอง (ไม่อยู่ใน Top 5) ใช้ได้เมื่อมีผลประเมินจริงเท่านั้น
  const fromGoal = !inTop && result && goal && goal.code === targetCode ? goal : undefined
  const target = inTop || fromGoal || r.careers[0]
  return { result: r, isSample: !result, target, isGoal: !!fromGoal }
}

/** เวลาที่ได้ผลประเมินชุดที่แสดงอยู่ = รายการล่าสุดในประวัติ (saveResult / โหลดจากบัญชี) — ไม่มีประวัติ = null */
export function useResultTime(): string | null {
  const { result, history } = useApp()
  if (!result || !history.length) return null
  const at = history[history.length - 1].at
  if (!Number.isFinite(at)) return null
  return new Date(at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
