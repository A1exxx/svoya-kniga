import qrcode from 'qrcode-generator'
import type { Org } from '../state/orgStore'

/**
 * Платёжный QR-код по ГОСТ Р 56042-2014 (формат ST00012, UTF-8) — как в счёте
 * Эльбы. Банковское приложение сканирует код и подставляет реквизиты оплаты.
 */
export function paymentQrPayload(org: Org, opts: { sum?: number; purpose?: string }): string {
  const parts: string[] = ['ST00012']
  const add = (k: string, v?: string | number) => {
    const s = v == null ? '' : String(v).trim()
    if (s) parts.push(`${k}=${s}`)
  }
  add('Name', org.fio || org.name)
  add('PersonalAcc', org.bankAccount)
  add('BankName', org.bankName)
  add('BIC', org.bik)
  add('CorrespAcc', org.corrAccount)
  add('PayeeINN', org.inn)
  if (opts.sum != null && opts.sum > 0) add('Sum', Math.round(opts.sum * 100)) // в копейках
  add('Purpose', opts.purpose)
  return parts.join('|')
}

/** UTF-8 строку → «бинарная» строка (1 символ = 1 байт) для корректной кириллицы в QR. */
function toUtf8Bytes(s: string): string {
  const utf8 = new TextEncoder().encode(s)
  let out = ''
  for (const b of utf8) out += String.fromCharCode(b)
  return out
}

/** SVG-разметка QR (строка) для встраивания в печатную форму. null — если данных мало. */
export function paymentQrSvg(payload: string, cellSize = 3): string | null {
  try {
    const qr = qrcode(0, 'M')
    qr.addData(toUtf8Bytes(payload), 'Byte')
    qr.make()
    return qr.createSvgTag({ cellSize, margin: 0, scalable: true })
  } catch {
    return null
  }
}
