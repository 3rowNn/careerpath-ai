import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as acc from '../api/account'
import { IS_DEMO, targetCareer } from '../api/client'
import type { Answers, CareerResult, Conversation, RecommendResult } from '../api/types'

/**
 * สถานะของแอปฝั่ง client
 * - ยังไม่เข้าสู่ระบบ: เก็บใน localStorage ของเบราว์เซอร์นี้
 * - เข้าสู่ระบบแล้ว: ทุกการเปลี่ยนแปลงส่งไปเก็บใน PostgreSQL ด้วย (assessments, user_targets, roadmap_items, learning_records, conversations/messages)
 *   และโหลดกลับจากเซิร์ฟเวอร์ตอนเปิดแอป · localStorage เป็นแค่ cache
 * - ไม่ติ๊ก "จดจำฉัน": เก็บใน sessionStorage แทน (ปิดแท็บ/เบราว์เซอร์แล้วออกจากระบบ) และ token อายุ 1 วัน
 */
export interface HistoryEntry {
  at: number
  topCode: string
  scores: Record<string, number> // code → skill_coverage_percent
}

/** passed = ประเมินทักษะนั้นซ้ำแล้วถึงเกณฑ์ (ต่างจาก done = ผู้ใช้ติ๊กเองว่าเรียนแล้ว) */
export type RoadmapStatus = 'todo' | 'doing' | 'done' | 'passed'

export type User = acc.AccountUser
export type LearningRecord = acc.LearningRecord

interface AppState {
  user: User | null
  token: string | null // JWT (เก็บแค่ user_id)
  remember: boolean // "จดจำฉัน" — false = เก็บใน sessionStorage
  answers: Answers
  result: RecommendResult | null
  resultAnswers: Answers // ชุดคำตอบที่ใช้สร้าง result (Skill Gap ต้องใช้ชุดเดียวกัน)
  targetCode: string | null
  major: string | null // สาขาที่จบ (ไม่บังคับ) — id ใน datasets/cip/thai_majors.csv
  goal: CareerResult | null // อาชีพที่ผู้ใช้เลือกเองจาก 910 (อาจไม่อยู่ใน Top 5) — rank = อันดับใน 910
  history: HistoryEntry[]
  conversations: Conversation[]
  roadmap: Record<string, RoadmapStatus> // key = `${code}|${itemId}`
  learning: LearningRecord[] // อาชีพที่เรียน Roadmap ครบแล้ว (ใหม่สุดก่อน)
}

interface AppApi extends AppState {
  /** เข้าสู่ระบบ/สมัครสำเร็จ → ย้ายข้อมูลในเบราว์เซอร์ขึ้นบัญชี (ถ้าบัญชียังว่าง) แล้วโหลดจากเซิร์ฟเวอร์ */
  signIn: (auth: acc.AuthResult, remember?: boolean) => Promise<{ migrated: boolean }>
  logout: () => void
  setUser: (u: User) => void
  setAnswer: (feature: string, value: number) => void
  setAnswers: (a: Answers) => void
  saveResult: (r: RecommendResult, answers: Answers) => void
  setTarget: (code: string) => void
  setGoal: (career: CareerResult) => void
  setMajor: (id: string | null) => void
  upsertConversation: (c: Conversation) => void
  deleteConversation: (id: string) => void
  setRoadmapStatus: (key: string, s: RoadmapStatus) => void
  /** Roadmap ครบ → บันทึก (มีแล้ว = คงวันที่ครบครั้งแรก อัปเดตตัวเลข) */
  recordLearning: (r: LearningRecord) => void
  deleteLearning: (code: string) => void
  syncError: string | null
}

const KEY = 'careerpath.v2' // v2 = แบบประเมินรอบที่ 4 (76 ข้อ) — ข้อมูล v1 (71 ข้อ) ใช้กับโมเดลใหม่ไม่ได้
const EMPTY: AppState = {
  user: null,
  token: null,
  remember: true,
  answers: {},
  result: null,
  resultAnswers: {},
  targetCode: null,
  goal: null,
  major: null,
  history: [],
  conversations: [],
  roadmap: {},
  learning: [],
}

function load(): AppState {
  try {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(KEY) // เข้าสู่ระบบแบบไม่จดจำ (แท็บนี้)
    } catch {
      /* ไม่มี sessionStorage */
    }
    raw ??= localStorage.getItem(KEY)
    const s = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<AppState>) } : EMPTY
    // บัญชีแบบเก่า (ก่อนมี backend) ไม่มี token — ถือว่ายังไม่ได้เข้าสู่ระบบ
    return s.user && !s.token ? { ...s, user: null } : s
  } catch {
    return EMPTY
  }
}

const historyEntry = (r: RecommendResult, at = Date.now()): HistoryEntry => ({
  at,
  topCode: r.careers[0]?.code ?? '',
  scores: Object.fromEntries(r.careers.map((c) => [c.code, c.skill_coverage_percent])),
})

/**
 * สถานะจากเซิร์ฟเวอร์ → state ของแอป (คำตอบที่กำลังกรอกอยู่ในเครื่องไม่ถูกทับ)
 * fillAnswers = เติมคำตอบจากผลล่าสุดในบัญชีเมื่อในเครื่องว่าง — ใช้เฉพาะตอนเข้าสู่ระบบ (เครื่องใหม่)
 * ตอนเปิดแอปซ้ำต้องไม่เติม: คำตอบว่างแปลว่าผู้ใช้กด "ล้างคำตอบ" เอง
 */
function fromServer(st: acc.ServerState, token: string, prev: AppState, fillAnswers = false): AppState {
  return {
    ...prev,
    user: st.user,
    token,
    result: st.latest?.result ?? null,
    resultAnswers: st.latest?.answers ?? {},
    answers: Object.keys(prev.answers).length || !fillAnswers ? prev.answers : (st.latest?.answers ?? {}),
    targetCode: st.targets.target_code ?? st.latest?.result.careers[0]?.code ?? null,
    goal: st.targets.goal,
    major: st.targets.major,
    history: st.history.map((h) => ({ at: Date.parse(h.created_at), topCode: h.top_code, scores: h.scores })),
    roadmap: st.roadmap as Record<string, RoadmapStatus>,
    conversations: st.conversations,
    learning: st.learning ?? [],
  }
}

const Ctx = createContext<AppApi | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<AppState>(load)
  const [syncError, setSyncError] = useState<string | null>(null)
  const token = s.token

  useEffect(() => {
    try {
      const [keep, drop] = s.remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
      keep.setItem(KEY, JSON.stringify(s))
      drop.removeItem(KEY)
    } catch {
      /* private mode — ใช้งานต่อได้แต่ไม่จำ */
    }
  }, [s])

  const patch = useCallback((p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    set((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }))
  }, [])

  /** ส่งการเปลี่ยนแปลงไปเซิร์ฟเวอร์ (ถ้าเข้าสู่ระบบ) — ล้มเหลวไม่ขวางการใช้งาน แต่แจ้งเตือน */
  const push = useCallback(
    (fn: (t: string) => Promise<unknown>) => {
      const t = token
      if (!t) return
      fn(t)
        .then(() => setSyncError(null))
        .catch((e: unknown) => {
          if (e instanceof acc.ApiError && e.status === 401) {
            patch({ ...EMPTY }) // token หมดอายุ — ออกจากระบบ
            setSyncError('เซสชันหมดอายุ — เข้าสู่ระบบใหม่เพื่อบันทึกข้อมูล')
          } else setSyncError(`บันทึกขึ้นบัญชีไม่สำเร็จ: ${(e as Error).message}`)
        })
    },
    [patch, token],
  )

  // เปิดแอปพร้อม token → โหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์ (เผื่อแก้จากเครื่องอื่น)
  useEffect(() => {
    if (!token) return
    let alive = true
    acc
      .getState(token)
      .then((st) => alive && set((prev) => fromServer(st, token, prev)))
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof acc.ApiError && e.status === 401) {
          set({ ...EMPTY })
          setSyncError('เซสชันหมดอายุ — เข้าสู่ระบบใหม่')
        } else setSyncError(`โหลดข้อมูลบัญชีไม่สำเร็จ: ${(e as Error).message}`)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวต่อ token
  }, [token])

  const signIn = useCallback(
    async ({ token: t, user }: acc.AuthResult, remember = true) => {
      let st = await acc.getState(t)
      let migrated = false
      const local = s
      // บัญชียังไม่มีผลประเมิน แต่เบราว์เซอร์นี้มี → ย้ายขึ้นบัญชี (เซิร์ฟเวอร์คำนวณผลใหม่จากคำตอบ)
      if (!st.latest && local.result && Object.keys(local.resultAnswers).length) {
        await acc.createAssessment(t, local.resultAnswers)
        const tg = local.targetCode
        await acc.putTargets(t, { ...(tg ? { target_code: tg } : {}), ...(local.goal ? { goal: local.goal } : {}), major: local.major ?? '' })
        if (Object.keys(local.roadmap).length) await acc.putRoadmap(t, local.roadmap)
        for (const c of local.conversations) await acc.putConversation(t, c)
        for (const r of local.learning) await acc.putLearning(t, r)
        st = await acc.getState(t)
        migrated = true
      }
      set((prev) => ({ ...fromServer({ ...st, user }, t, prev, true), remember }))
      setSyncError(null)
      return { migrated }
    },
    [s],
  )

  const api = useMemo<AppApi>(
    () => ({
      ...s,
      syncError,
      signIn,
      // ออกจากระบบ = ล้างข้อมูลของบัญชีออกจากเบราว์เซอร์นี้ (ข้อมูลยังอยู่ในบัญชี)
      logout: () => set({ ...EMPTY }),
      setUser: (user) => patch({ user }),
      setAnswer: (f, v) => patch((p) => ({ answers: { ...p.answers, [f]: v } })),
      setAnswers: (answers) => patch({ answers }),
      saveResult: (result, resultAnswers) => {
        // เข้าสู่ระบบแล้ว: ผลนี้มาจาก POST /assessments ซึ่งบันทึกบนเซิร์ฟเวอร์แล้ว (เซิร์ฟเวอร์คงเป้าหมายด้วยกฎเดียวกัน)
        // คงเป้าหมายเดิมไว้ — Skill Gap/Roadmap ต้องเทียบกับอาชีพเดิมจึงเห็นพัฒนาการ
        // เป้าหมายที่หลุด Top 5 และไม่ใช่อาชีพที่อยากเป็น → อันดับ 1
        patch((p) => {
          const keep = p.targetCode && (result.careers.some((c) => c.code === p.targetCode) || p.goal?.code === p.targetCode)
          return {
            result,
            resultAnswers,
            targetCode: keep ? p.targetCode : (result.careers[0]?.code ?? null),
            history: [...p.history, historyEntry(result)].slice(-12),
          }
        })
        // อันดับของอาชีพที่อยากเป็นคำนวณจากคำตอบชุดเก่า → คำนวณใหม่
        const g = s.goal
        if (g && !IS_DEMO)
          targetCareer(resultAnswers, g.code)
            .then((t) => patch((p) => (p.goal?.code === g.code ? { goal: t.career } : {})))
            .catch(() => {})
      },
      setTarget: (targetCode) => {
        patch({ targetCode })
        push((t) => acc.putTargets(t, { target_code: targetCode }))
      },
      setGoal: (goal) => {
        patch({ goal, targetCode: goal.code })
        push((t) => acc.putTargets(t, { goal, target_code: goal.code }))
      },
      setMajor: (major) => {
        patch({ major })
        push((t) => acc.putTargets(t, { major: major ?? '' }))
      },
      upsertConversation: (c) => {
        patch((p) => ({ conversations: [c, ...p.conversations.filter((x) => x.id !== c.id)] }))
        push((t) => acc.putConversation(t, c))
      },
      deleteConversation: (id) => {
        patch((p) => ({ conversations: p.conversations.filter((x) => x.id !== id) }))
        push((t) => acc.deleteConversation(t, id))
      },
      setRoadmapStatus: (k, st) => {
        patch((p) => ({ roadmap: { ...p.roadmap, [k]: st } }))
        push((t) => acc.putRoadmap(t, { [k]: st }))
      },
      recordLearning: (r) => {
        const old = s.learning.find((x) => x.code === r.code)
        const rec = old ? { ...r, completedAt: old.completedAt } : r
        if (old && old.title === rec.title && old.total === rec.total && old.skills === rec.skills && old.passed === rec.passed) return
        patch((p) => ({ learning: [rec, ...p.learning.filter((x) => x.code !== r.code)].sort((a, b) => b.completedAt - a.completedAt) }))
        push((t) => acc.putLearning(t, rec))
      },
      deleteLearning: (code) => {
        patch((p) => ({ learning: p.learning.filter((x) => x.code !== code) }))
        push((t) => acc.deleteLearning(t, code))
      },
    }),
    [s, patch, push, signIn, syncError],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp ต้องอยู่ใน <AppProvider>')
  return v
}
