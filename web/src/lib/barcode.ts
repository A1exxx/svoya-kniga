/**
 * Минимальный генератор штрих-кода Code 39 (SVG, синхронно) — для верхнего штрих-кода
 * официальных бланков ФНС (под ним печатается номер страницы формы, напр. «2630 2010»).
 *
 * Машиночитаемый 2D-штрих-код всей формы создаётся официальной программой ФНС
 * «Налогоплательщик ЮЛ» из XML; здесь — визуально достоверный 1D-код номера страницы.
 */

// Code 39: каждый символ = 9 элементов (полоса/пробел, начиная с полосы), 3 из них широкие.
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', ' ': 'nwwnnnwnn', '-': 'nwnnnnwnw',
  '*': 'nwnnwnwnn',
}

/** SVG-разметка штрих-кода Code 39 для строки (цифры/пробел/дефис). */
export function code39Svg(text: string, opts: { height?: number; narrow?: number } = {}): string {
  const height = opts.height ?? 28
  const narrow = opts.narrow ?? 1.2
  const wide = narrow * 3
  const data = `*${text.toUpperCase().replace(/[^0-9 -]/g, '')}*`
  let x = 0
  const rects: string[] = []
  for (let c = 0; c < data.length; c++) {
    const pat = CODE39[data[c]] ?? CODE39['-']
    for (let i = 0; i < pat.length; i++) {
      const w = pat[i] === 'w' ? wide : narrow
      if (i % 2 === 0) rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`)
      x += w
    }
    x += narrow // межсимвольный пробел
  }
  const width = Math.ceil(x)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="#000">${rects.join('')}</svg>`
}
