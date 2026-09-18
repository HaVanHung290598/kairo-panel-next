'use client'

import type { KairoConfig } from '@/lib/config'
import type { ConversationRecord } from '@/lib/records'
import { useKairoPanel } from '@/kairo/useKairoPanel'

type Props = {
  record: ConversationRecord | null
  config: KairoConfig | null
}

export function PanelStage({ record, config }: Props) {
  const { hostRef, status, error, retry } = useKairoPanel({
    conversationId: record?.kairoConversationId ?? null,
    config,
  })

  if (!record) {
    return (
      <section className="stage">
        <p className="stage-hint">
          Chọn một hồ sơ bên trái để mở kênh trao đổi ngay trong phần mềm.
          <br />
          Panel chạy trong Shadow DOM nên giao diện chat không đụng vào CSS của trang này.
        </p>
      </section>
    )
  }

  return (
    <section className="stage">
      <header className="stage-head">
        <h2>{record.title}</h2>
        {record.partnerTenantNames.length > 0 && (
          <p className="stage-sub">Có đối tác ngoài công ty: {record.partnerTenantNames.join(', ')}</p>
        )}
      </header>

      <div className="stage-body">
        {/*
          Thẻ này phải LUÔN nằm trong DOM khi đã chọn hồ sơ, kể cả lúc đang tải —
          hook cần ref trỏ vào nó tại thời điểm mount. Chiều cao thật là bắt buộc:
          panel không tự đẩy chiều cao thẻ cha, cha cao 0 thì màn hình trắng trơn.
        */}
        <div className="panel-host" ref={hostRef} />

        {status !== 'ready' && (
          <div className="stage-overlay">
            {status === 'loading' && <p className="stage-status">Đang mở kênh trao đổi…</p>}
            {status === 'error' && (
              <div className="stage-error">
                <p>{error}</p>
                <button type="button" className="btn" onClick={retry}>
                  Thử lại
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
