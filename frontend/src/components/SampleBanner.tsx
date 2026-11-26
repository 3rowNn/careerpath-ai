import { Link } from 'react-router-dom'

export function SampleBanner() {
  return (
    <div className="bg-primary-soft border border-primary-line rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
      <span>
        คุณยังไม่ได้ทำแบบประเมิน — หน้านี้แสดง<b>ผลของผู้ใช้ตัวอย่าง</b> (คนจบใหม่ที่ยังไม่มีงาน ชอบคุยกับคนและงานจัดระเบียบ) ที่ได้จากโมเดลจริง
      </span>
      <Link to="/assessment" className="font-semibold">
        ทำแบบประเมินของคุณ →
      </Link>
    </div>
  )
}
