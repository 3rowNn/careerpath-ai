/**
 * บัญชีผู้ใช้ (ระยะ 3) — POST /auth/register|login → JWT (เก็บแค่ user_id) · ข้อมูลส่วนตัวอยู่ใน PostgreSQL
 * โหมดตัวอย่าง (ไม่ตั้ง VITE_API_URL) ไม่มีระบบบัญชี
 */
import { API_URL, IS_DEMO, localize } from './client'
import type { Answers, Conversation, CareerResult, RecommendResult } from './types'

export interface AccountUser {
  id: number
  email: string
  name: string
  status: string | null
  education: string | null
}

export interface AuthResult {
  token: string
  user: AccountUser
}

export interface ServerHistory {
  id: number
  created_at: string
  top_code: string
  scores: Record<string, number>
}

export interface ServerAssessment {
  id: number
  created_at: string
  answers: Answers
  result: RecommendResult
}

/** บันทึกการเรียน: Roadmap ของอาชีพนี้ครบทุกรายการแล้ว */
export interface LearningRecord {
  code: string
  title: string
  completedAt: number // ms — ครั้งแรกที่ครบ
  total: number // รายการใน Roadmap
  skills: number // ทักษะใน Roadmap
  passed: number // ทักษะที่ผ่านเกณฑ์จากคะแนนประเมินจริง
}

export interface ServerState {
  user: AccountUser
  latest: ServerAssessment | null
  history: ServerHistory[]
  targets: { target_code: string | null; goal: CareerResult | null; major: string | null }
  roadmap: Record<string, string>
  conversations: Conversation[]
  learning?: LearningRecord[]
}

/** ข้อผิดพลาดจาก API พร้อมข้อความภาษาไทยจาก backend (FastAPI detail) */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  if (IS_DEMO) throw new ApiError(0, 'โหมดตัวอย่างไม่มีระบบบัญชี — เชื่อมต่อ backend (ตั้ง VITE_API_URL)')
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `${path} → HTTP ${res.status}`
    try {
      const d = (await res.json()).detail
      if (typeof d === 'string') msg = d
      else if (Array.isArray(d) && d[0]?.msg) msg = fieldMessage(d[0])
    } catch {
      /* ไม่ใช่ JSON */
    }
    throw new ApiError(res.status, msg)
  }
  return res.status === 204 ? (undefined as T) : localize((await res.json()) as T)
}

/** แปลงข้อผิดพลาด validation ของ pydantic ที่พบบ่อยเป็นภาษาไทย */
function fieldMessage(e: { loc?: (string | number)[]; msg: string; type?: string }): string {
  const field = String(e.loc?.[e.loc.length - 1] ?? '')
  if (field === 'email') return 'รูปแบบอีเมลไม่ถูกต้อง'
  if (field === 'password' && e.type === 'string_too_short') return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  if (field === 'password' && e.type === 'string_too_long') return 'รหัสผ่านยาวเกิน 72 ตัวอักษร'
  if (field === 'name') return 'กรอกชื่อ'
  return e.msg
}

/** remember = "จดจำฉัน" — ไม่ติ๊ก: token อายุ 1 วัน และเก็บแค่ใน sessionStorage (ปิดเบราว์เซอร์แล้วหาย) */
export const register = (b: { email: string; password: string; name: string; status?: string | null; education?: string | null; remember?: boolean }) =>
  call<AuthResult>('POST', '/auth/register', null, b)
export const login = (b: { email: string; password: string; remember?: boolean }) => call<AuthResult>('POST', '/auth/login', null, b)
export const getState = (t: string) => call<ServerState>('GET', '/me/state', t)
export const updateMe = (t: string, b: { name?: string; status?: string; education?: string }) => call<AccountUser>('PATCH', '/me', t, b)
export const deleteMe = (t: string) => call<void>('DELETE', '/me', t)

/** ส่งคำตอบ → backend คำนวณ recommend() เองแล้วบันทึก */
export const listAssessments = (t: string, limit = 50) => call<ServerHistory[]>('GET', `/assessments?limit=${limit}`, t)
export const getAssessment = (t: string, id: number) => call<ServerAssessment>('GET', `/assessments/${id}`, t)
export const createAssessment = (t: string, answers: Answers) => call<ServerAssessment>('POST', '/assessments', t, { answers })

export const putTargets = (t: string, b: { target_code?: string; goal?: CareerResult; major?: string | null; clear_goal?: boolean }) =>
  call('PUT', '/me/targets', t, b)
export const putRoadmap = (t: string, items: Record<string, string>) => call<Record<string, string>>('PUT', '/roadmap', t, { items })
export const putLearning = (t: string, r: LearningRecord) => call<LearningRecord>('PUT', `/learning/${encodeURIComponent(r.code)}`, t, r)
export const deleteLearning = (t: string, code: string) => call<void>('DELETE', `/learning/${encodeURIComponent(code)}`, t)
export const putConversation = (t: string, c: Conversation) => call('PUT', `/conversations/${encodeURIComponent(c.id)}`, t, c)
export const deleteConversation = (t: string, id: string) => call<void>('DELETE', `/conversations/${encodeURIComponent(id)}`, t)
