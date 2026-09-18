#!/usr/bin/env node
/*
  Chạy kairo-panel-next trên MÁY DEV (Mac) mà vẫn nói chuyện với cụm Kairo thật — `npm run dev:local`.

  Vì sao cần: trình duyệt mở http://localhost:<PORT>, nhưng CORS của bff-tenant ở cụm chỉ cho
  origin của cụm (TENANT_CORS_DOMAIN, vd *.tienloixanh.org) — origin localhost bị chặn, panel v2
  không gọi được GraphQL. Không sửa CORS của cụm dùng chung; thay vào đó trang chỉ gọi đường dẫn
  CÙNG ORIGIN `/kairo/...` và script này chuyển tiếp sang cụm:

      trình duyệt ──► :PORT (script này) ──┬─ /kairo/api/*      ─► bff-tenant   (HTTP + WebSocket)
                                           ├─ /kairo/cdn/*      ─► widget-embed (bundle v1/v2, kairo-call.js)
                                           ├─ /kairo/livekit/*  ─► LiveKit signaling (WebSocket)
                                           └─ mọi đường khác    ─► next dev ở :NEXT_PORT (kể cả HMR)

  Header `Origin` của request chuyển sang cụm được đổi thành KAIRO_DEV_PROXY_ORIGIN (một origin cụm
  cho phép) — trình duyệt thấy mọi thứ cùng origin nên không cần CORS nữa.

  Bảng tiền tố PHẢI khớp `DEV_PROXY_PREFIX` trong src/server/kairo.ts.

  Cấu hình: `.env.development.local` (Next chỉ nạp file này khi `next dev`; `.dockerignore` loại
  `.env*.local` nên không lọt vào ảnh deploy). Mẫu: `.env.development.example`.
*/
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Đọc KEY=VALUE của một file .env (không nội suy) — chỉ để lấy cấu hình proxy. */
function readEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

const fileEnv = readEnvFile(path.join(ROOT, '.env.development.local'))
const cfg = (k, d) => process.env[k] ?? fileEnv[k] ?? d

const PORT = Number(cfg('PORT', '3100'))
const HOST = cfg('KAIRO_DEV_HOST', '127.0.0.1')
const NEXT_PORT = Number(cfg('KAIRO_DEV_NEXT_PORT', '3190'))
const PROXY_ORIGIN = cfg('KAIRO_DEV_PROXY_ORIGIN', '')

const ROUTES = [
  { prefix: '/kairo/api', target: cfg('KAIRO_DEV_PROXY_API', ''), name: 'bff-tenant' },
  { prefix: '/kairo/cdn', target: cfg('KAIRO_DEV_PROXY_CDN', ''), name: 'widget-embed' },
  { prefix: '/kairo/livekit', target: cfg('KAIRO_DEV_PROXY_LIVEKIT', ''), name: 'livekit' },
]

if (cfg('KAIRO_RUNTIME', '') !== 'dev-machine') {
  console.error('[dev-local] .env.development.local phải có KAIRO_RUNTIME=dev-machine (xem .env.development.example).')
  process.exit(1)
}
for (const r of ROUTES) {
  if (!r.target) {
    console.error(`[dev-local] thiếu đích chuyển tiếp cho ${r.prefix} (${r.name}) trong .env.development.local.`)
    process.exit(1)
  }
}

const NEXT_TARGET = `http://127.0.0.1:${NEXT_PORT}`

/** Tìm tuyến cho một URL: trả đích + đường dẫn đã bỏ tiền tố, hoặc tuyến về Next. */
function route(url) {
  for (const r of ROUTES) {
    if (url === r.prefix || url.startsWith(`${r.prefix}/`) || url.startsWith(`${r.prefix}?`)) {
      const rest = url.slice(r.prefix.length) || '/'
      const base = new URL(r.target)
      const basePath = base.pathname.replace(/\/+$/, '')
      return { kairo: true, name: r.name, target: base, path: `${basePath}${rest.startsWith('/') ? rest : `/${rest}`}` }
    }
  }
  return { kairo: false, name: 'next', target: new URL(NEXT_TARGET), path: url }
}

const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'upgrade',
])

function outgoingHeaders(req, r) {
  const h = {}
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) h[k] = v
  if (r.kairo) {
    h.host = r.target.host
    if (h.origin && PROXY_ORIGIN) h.origin = PROXY_ORIGIN
    // Referer của trang localhost không có nghĩa gì với cụm; bỏ cho khỏi lộ đường dẫn nội bộ.
    delete h.referer
  }
  return h
}

const server = http.createServer((req, res) => {
  const r = route(req.url ?? '/')
  const lib = r.target.protocol === 'https:' ? https : http
  const preq = lib.request(
    {
      protocol: r.target.protocol,
      hostname: r.target.hostname,
      port: r.target.port || (r.target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: r.path,
      headers: outgoingHeaders(req, r),
    },
    (pres) => {
      const headers = {}
      for (const [k, v] of Object.entries(pres.headers)) if (!HOP.has(k)) headers[k] = v
      res.writeHead(pres.statusCode ?? 502, headers)
      pres.pipe(res)
    },
  )
  preq.on('error', (err) => {
    if (res.headersSent) return res.destroy()
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: `[dev-local] không nối được ${r.name} (${r.target.host}): ${err.message}` }))
  })
  req.pipe(preq)
})

// WebSocket (GraphQL không dùng, nhưng /ws, /ws/calls, /ws/guest, LiveKit /rtc và HMR của Next thì có).
server.on('upgrade', (req, socket, head) => {
  const r = route(req.url ?? '/')
  const secure = r.target.protocol === 'https:' || r.target.protocol === 'wss:'
  const port = Number(r.target.port || (secure ? 443 : 80))
  const connect = secure
    ? () => tls.connect({ host: r.target.hostname, port, servername: r.target.hostname })
    : () => net.connect({ host: r.target.hostname, port })
  const up = connect()

  const lines = [`${req.method} ${r.path} HTTP/1.1`]
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const k = req.rawHeaders[i]
    let v = req.rawHeaders[i + 1]
    const lk = k.toLowerCase()
    if (r.kairo && lk === 'host') v = r.target.host
    if (r.kairo && lk === 'origin' && PROXY_ORIGIN) v = PROXY_ORIGIN
    if (r.kairo && lk === 'referer') continue
    lines.push(`${k}: ${v}`)
  }

  const onReady = () => {
    up.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) up.write(head)
    socket.pipe(up).pipe(socket)
  }
  if (secure) up.once('secureConnect', onReady)
  else up.once('connect', onReady)

  const kill = () => {
    socket.destroy()
    up.destroy()
  }
  up.on('error', (err) => {
    if (r.kairo) console.warn(`[dev-local] WS ${r.name} ${r.path.split('?')[0]}: ${err.message}`)
    kill()
  })
  socket.on('error', kill)
  up.on('close', () => socket.destroy())
  socket.on('close', () => up.destroy())
})

// ───────── chạy next dev ở cổng nội bộ ─────────

const nextBin = path.join(ROOT, 'node_modules', '.bin', 'next')
const child = spawn(nextBin, ['dev', '-p', String(NEXT_PORT), '-H', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, KAIRO_RUNTIME: 'dev-machine' },
})
child.on('exit', (code) => {
  server.close()
  process.exit(code ?? 0)
})
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig)
    server.close()
  })
}

server.listen(PORT, HOST, () => {
  console.log(`\n[dev-local] mở trình duyệt: http://localhost:${PORT}  (next dev nội bộ ở :${NEXT_PORT})`)
  for (const r of ROUTES) console.log(`[dev-local]   ${r.prefix.padEnd(15)} → ${r.target}  (${r.name})`)
  console.log(`[dev-local]   Origin gửi sang cụm: ${PROXY_ORIGIN || '(giữ nguyên — cụm có thể chặn CORS/WS)'}\n`)
})
