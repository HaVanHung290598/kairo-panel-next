'use client'

import type { MountStatus } from '@/kairo/v2/useKairoMount'

type Props = {
  hostRef: React.RefObject<HTMLDivElement | null>
  status: MountStatus
  error: string | null
  retry: () => void
  /** Câu hiện khi chưa đủ điều kiện mount (vd chưa chọn hội thoại). */
  idleText?: string
  loadingText?: string
  className?: string
  label: string
}

/**
 * Vùng chứa một bề mặt Kairo + lớp phủ trạng thái của TRANG (không phải của Kairo).
 *
 * Thẻ host LUÔN nằm trong DOM — hook cần ref trỏ vào nó đúng lúc mount — và phải có chiều cao
 * thật: bundle không tự đẩy chiều cao thẻ cha, cha cao 0 là màn trắng.
 */
export function SurfaceHost({ hostRef, status, error, retry, idleText, loadingText, className, label }: Props) {
  return (
    <div className={`v2-surface ${className ?? ''}`} aria-label={label}>
      <div className="v2-surface-host" ref={hostRef} />
      {status !== 'ready' && (
        <div className="v2-surface-overlay">
          {status === 'idle' && idleText && <p className="v2-muted">{idleText}</p>}
          {status === 'loading' && <p className="v2-muted">{loadingText ?? 'Đang mở…'}</p>}
          {(status === 'error' || status === 'ended') && (
            <div className="v2-surface-error" role="alert">
              <p>{error}</p>
              <button type="button" className="v2-btn" onClick={retry}>
                {status === 'ended' ? 'Xin phiên mới' : 'Thử lại'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
