import type { CSSProperties } from 'react'
import { SOC_MAJOR } from './labels'

/** ไอคอน + สีประจำกลุ่มอาชีพ (SOC major) — ใช้ตกแต่งเท่านั้น ไม่เกี่ยวกับผลโมเดล */
export const MAJOR_ICON: Record<string, string> = {
  '11': '👔', '13': '💰', '15': '💻', '17': '📐', '19': '🔬', '21': '🤝', '23': '⚖️', '25': '📚',
  '27': '🎨', '29': '🩺', '31': '💊', '33': '🛡️', '35': '🍳', '37': '🧹', '39': '💇', '41': '🛍️',
  '43': '🗂️', '45': '🌾', '47': '🏗️', '49': '🔧', '51': '🏭', '53': '🚚',
}
export const MAJOR_KEYS = Object.keys(SOC_MAJOR)
const hueOf = (major?: string) => (Math.max(0, MAJOR_KEYS.indexOf(major ?? '')) * 47) % 360
/** สีพื้นอ่อน + ตัวอักษรเข้มของกลุ่มอาชีพ (major = 2 หลักแรกของรหัส) */
export const tint = (major?: string): CSSProperties => ({ background: `hsl(${hueOf(major)} 80% 95%)`, color: `hsl(${hueOf(major)} 55% 32%)` })
export const iconOf = (code: string) => MAJOR_ICON[code.slice(0, 2)] ?? '💼'

export const RIASEC_ICON: Record<string, string> = { Realistic: '🔧', Investigative: '🔬', Artistic: '🎨', Social: '🤝', Enterprising: '📣', Conventional: '🗂️' }
