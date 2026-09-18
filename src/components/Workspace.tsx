'use client'

import { useEffect, useState } from 'react'

import { useAsync } from '@/hooks/useAsync'
import { fetchConfig } from '@/lib/config'
import { CurrentUser } from './CurrentUser'
import { fetchRecords, type ConversationRecord } from '@/lib/records'
import { PanelStage } from './PanelStage'
import { RecordList } from './RecordList'

/** Nhịp làm mới danh sách. Sản phẩm thật nên dùng webhook của Kairo thay polling. */
const POLL_MS = 5_000

export function Workspace() {
  const config = useAsync(fetchConfig)
  const records = useAsync(fetchRecords)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reloadRecords = records.reload
  useEffect(() => {
    const timer = window.setInterval(reloadRecords, POLL_MS)
    return () => window.clearInterval(timer)
  }, [reloadRecords])

  const selected: ConversationRecord | null = records.data?.find((r) => r.id === selectedId) ?? null
  const problem = config.error ?? records.error

  return (
    <div className="app">
      <header className="topbar">
        <h1>GaraSoft</h1>
        <span>Phần mềm điều hành gara — demo nhúng Kairo Panel (widget.js v1)</span>
        <CurrentUser />
        {/* <a> thường: trang v2 nạp bundle khác, phải tải lại trang (xem loadBundle.ts). */}
        <a className="topbar-v2" href="/v2">
          Bản v2 →
        </a>
      </header>

      {problem && (
        <p className="banner" role="alert">
          {problem}
        </p>
      )}

      <main className="workspace">
        <RecordList
          records={records.data}
          loading={records.loading}
          selectedId={selectedId}
          onSelect={(record) => setSelectedId(record.id)}
        />
        <PanelStage record={selected} config={config.data} />
      </main>
    </div>
  )
}
