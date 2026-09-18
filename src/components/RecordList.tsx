'use client'

import type { ConversationRecord } from '@/lib/records'

type Props = {
  records: ConversationRecord[] | null
  loading: boolean
  selectedId: string | null
  onSelect: (record: ConversationRecord) => void
}

function activity(record: ConversationRecord): string {
  if (!record.lastMessageAt) return 'Chưa có trao đổi'
  const at = new Date(record.lastMessageAt)
  if (Number.isNaN(at.getTime())) return 'Chưa có trao đổi'
  return `Hoạt động gần nhất: ${at.toLocaleString('vi-VN')}`
}

export function RecordList({ records, loading, selectedId, onSelect }: Props) {
  return (
    <nav className="records" aria-label="Danh sách hồ sơ">
      <h2>Hồ sơ đang xử lý</h2>

      {loading && records === null && <p className="records-note">Đang tải danh sách…</p>}

      {records !== null && records.length === 0 && (
        <p className="records-note">
          Chưa có kênh nghiệp vụ nào. Tạo một kênh trong Kairo trước, hoặc để backend tạo khi
          mở hồ sơ mới.
        </p>
      )}

      {records?.map((record) => {
        const on = record.id === selectedId
        return (
          <button
            key={record.id}
            type="button"
            className={on ? 'rec on' : 'rec'}
            aria-pressed={on}
            onClick={() => onSelect(record)}
          >
            <span className="rec-title">{record.title}</span>
            <span className="rec-meta">{activity(record)}</span>
            {record.partnerTenantNames.length > 0 && (
              <span className="rec-partner">Đối tác: {record.partnerTenantNames.join(', ')}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
