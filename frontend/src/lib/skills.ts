import type { SkillRow } from '../api/types'

/* จัดกลุ่มทักษะจากค่าที่ backend ส่งมา (skill_gap) — ใช้ร่วมกันใน Skill Gap และ Roadmap ไม่ใช่สูตรคะแนนใหม่ */

/** 25 คะแนน = 1 ระดับของสเกล 1–5 */
export const NEAR = 25

export type SkillStatus = 'strong' | 'near' | 'missing'
export const statusOf = (r: Pick<SkillRow, 'gap'>): SkillStatus => (r.gap <= 0 ? 'strong' : r.gap <= NEAR ? 'near' : 'missing')

/** ลำดับความสำคัญ: แบ่งทักษะที่ยังมี Gap เป็น 3 ช่วงเท่า ๆ กันตามค่า priority (Skill Priority) */
export type Tier = 'high' | 'mid' | 'low'
export function tiersOf(all: SkillRow[]): Record<string, Tier> {
  const gaps = all.filter((r) => r.gap > 0).sort((a, b) => b.priority - a.priority)
  const n = gaps.length
  return Object.fromEntries(gaps.map((r, i) => [r.feature, i < n / 3 ? 'high' : i < (2 * n) / 3 ? 'mid' : 'low']))
}
