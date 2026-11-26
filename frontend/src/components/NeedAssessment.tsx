import { Link } from 'react-router-dom'
import { ArrowRight } from './icons'
import { Main } from './Layout'
import { btn, Card } from './ui'

/** ยังไม่มีผลประเมิน → ไม่แสดงผลของผู้ใช้ตัวอย่าง ชวนไปทำแบบประเมินแทน */
export function NeedAssessment({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <Main>
      <Card className="!p-8 sm:!p-12 flex flex-col items-center text-center gap-5">
        <span className="text-[60px] leading-none" aria-hidden="true">
          {icon}
        </span>
        <div className="flex flex-col gap-2 max-w-[540px]">
          <h1 className="m-0 text-[26px]">{title}</h1>
          <p className="m-0 text-muted leading-relaxed">{desc}</p>
          <p className="m-0 text-muted text-sm">ทำแบบประเมิน 76 ข้อก่อน (ไม่มีจำกัดเวลา ทำต่อทีหลังได้) แล้วหน้านี้จะแสดงผลของคุณเอง</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/assessment" className={btn.primary}>
            เริ่มทำแบบประเมิน <ArrowRight />
          </Link>
          <Link to="/explore" className={btn.secondary}>
            สำรวจอาชีพทั้งหมดก่อน
          </Link>
        </div>
      </Card>
    </Main>
  )
}
