import './site.css'

/*
  Nhánh website công khai của tenant — người xem là khách vãng lai, chưa đăng nhập
  và không có token. Chỉ nạp site.css, không đụng globals.css của phần mềm nghiệp vụ.
*/
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
