import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { careerDetail, explainCareer, majorView, SAMPLE_ANSWERS, similarCareers, skillGap, targetCareer } from '../api/client'
import { useApp } from './store'

const ansKey = (a: Record<string, number>) => JSON.stringify(Object.entries(a).sort())

/** คำตอบที่ใช้วิเคราะห์ Skill Gap: ชุดเดียวกับที่สร้างผลอันดับ — ยังไม่เคยประเมินใช้คำตอบผู้ใช้ตัวอย่าง */
export function useResultAnswers() {
  const { result, resultAnswers } = useApp()
  return result && Object.keys(resultAnswers).length ? resultAnswers : SAMPLE_ANSWERS
}

export function useSkillGap(code: string | null) {
  const answers = useResultAnswers()
  return useQuery({
    queryKey: ['skill-gap', code, ansKey(answers)],
    queryFn: () => skillGap(answers, code!),
    enabled: !!code,
    staleTime: Infinity,
  })
}

/** Skill Gap ของทุกอาชีพใน Top 5 — ใช้เทียบ "ทักษะนี้สำคัญกับอาชีพไหน" และ Career × Skill Matrix */
export function useAllSkillGaps(codes: string[]) {
  const answers = useResultAnswers()
  return useQueries({
    queries: codes.map((code) => ({
      queryKey: ['skill-gap', code, ansKey(answers)],
      queryFn: () => skillGap(answers, code),
      staleTime: Infinity,
    })),
  })
}

export function useSimilar(code: string | null) {
  return useQuery({
    queryKey: ['similar', code],
    queryFn: () => similarCareers(code!),
    enabled: !!code,
    staleTime: Infinity,
    placeholderData: keepPreviousData, // เปลี่ยนอาชีพ: แสดงของเดิมจาง ๆ ระหว่างโหลด ไม่ให้หน้ายืดหด
  })
}

export function useExplain(code: string | null) {
  const answers = useResultAnswers()
  return useQuery({
    queryKey: ['explain', code, ansKey(answers)],
    queryFn: () => explainCareer(answers, code!),
    enabled: !!code,
    staleTime: Infinity,
    placeholderData: keepPreviousData, // เปลี่ยนอาชีพ: แสดงของเดิมจาง ๆ ระหว่างโหลด ไม่ให้หน้ายืดหด
  })
}

/** explain ของทุกอาชีพใน Top 5 — ใช้แสดงเหตุผลหลักใต้ชื่ออาชีพ (queryKey เดียวกับ useExplain จึงใช้ cache ร่วมกัน) */
export function useAllExplains(codes: string[]) {
  const answers = useResultAnswers()
  return useQueries({
    queries: codes.map((code) => ({
      queryKey: ['explain', code, ansKey(answers)],
      queryFn: () => explainCareer(answers, code),
      staleTime: Infinity,
    })),
  })
}

export function useTarget(code: string | null) {
  const answers = useResultAnswers()
  return useQuery({
    queryKey: ['target', code, ansKey(answers)],
    queryFn: () => targetCareer(answers, code!),
    enabled: !!code,
    staleTime: Infinity,
    retry: false,
  })
}

export function useMajor(major: string | null) {
  const answers = useResultAnswers()
  return useQuery({
    queryKey: ['major', major, ansKey(answers)],
    queryFn: () => majorView(answers, major!),
    enabled: !!major,
    staleTime: Infinity,
  })
}

/** รายละเอียดอาชีพ (ไม่ขึ้นกับคำตอบ) */
export function useCareerDetail(code: string | null) {
  return useQuery({
    queryKey: ['career', code],
    queryFn: () => careerDetail(code!),
    enabled: !!code,
    staleTime: Infinity,
  })
}
