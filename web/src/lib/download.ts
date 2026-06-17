/** Скачать текстовый файл (XML / CSV / TXT) из браузера. */
export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Скачать таблицу в CSV (открывается в Excel). Разделитель «;», UTF-8 с BOM для кириллицы. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [headers, ...rows].map((r) => r.map(esc).join(';'))
  const content = '﻿' + lines.join('\r\n')
  downloadText(filename, content, 'text/csv;charset=utf-8')
}
