import aliasesJson from '../data/title_aliases.json'

const ALIAS = aliasesJson as Record<string, string>

export interface Searchable {
  code: string
  title: string
  title_en?: string
}

/** คะแนนความตรงของคำค้น (ต่ำ = ตรงกว่า, 9 = ไม่ตรง)
 *  ชื่อไทย/รหัสขึ้นต้นด้วยคำค้น > มีคำค้นในชื่อไทยหรือชื่อเรียกอื่น > ชื่ออังกฤษขึ้นต้น > ขึ้นต้นคำในชื่ออังกฤษ > มีคำค้นในชื่ออังกฤษ */
export function matchScore(c: Searchable, query: string): number {
  const s = query.trim().toLowerCase()
  if (!s) return 0
  const t = (c.title_en ?? c.title).toLowerCase()
  const th = `${c.title} ${ALIAS[c.code] ?? ''}`.toLowerCase()
  if (c.code.startsWith(s) || th.startsWith(s)) return 0
  if (th.includes(s)) return 1
  if (t.startsWith(s)) return 1.5
  if (new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 2
  return t.includes(s) ? 3 : 9
}

/** กรอง + เรียงตามความตรง (ชื่อสั้นก่อน — อาชีพหลักมักชื่อสั้นกว่าสาขาย่อย) */
export function searchCareers<T extends Searchable>(list: T[], query: string, limit = Infinity): T[] {
  if (!query.trim()) return list.slice(0, limit)
  return list
    .map((c) => ({ c, sc: matchScore(c, query) }))
    .filter((x) => x.sc < 9)
    .sort((a, b) => a.sc - b.sc || a.c.title.length - b.c.title.length)
    .slice(0, limit)
    .map((x) => x.c)
}
