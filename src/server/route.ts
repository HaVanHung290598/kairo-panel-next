import 'server-only'

import { NextResponse } from 'next/server'

import { V2Error } from './v2'

/**
 * Bọc một route handler: lỗi nghiệp vụ (`V2Error`) ra đúng status + câu cho người, lỗi khác ra
 * 500 kèm câu — trang luôn nhận `{error}` để hiện, không bao giờ nhận HTML lỗi trần của Next.
 */
export async function handle(run: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run())
  } catch (err) {
    if (err instanceof V2Error) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[kairo-panel-next] route lỗi:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Đọc JSON body; body hỏng là lỗi của người gọi (400), không phải 500. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new V2Error('Dữ liệu gửi lên không phải JSON hợp lệ.', 400)
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function requireEmail(value: unknown, field = 'Email'): string {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL.test(s)) throw new V2Error(`${field} không hợp lệ.`, 400)
  return s
}

export function requireText(value: unknown, field: string, max = 200): string {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) throw new V2Error(`Thiếu ${field}.`, 400)
  if (s.length > max) throw new V2Error(`${field} tối đa ${max} ký tự.`, 400)
  return s
}
