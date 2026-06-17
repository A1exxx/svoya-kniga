import { describe, expect, it } from 'vitest'
import { validateInn, validateOktmo, validateKpp, validateSnils, validateOgrnip } from './validation'

describe('validateInn', () => {
  it('пусто → ок (null)', () => expect(validateInn('')).toBeNull())
  it('валидный 10-значный (Сбербанк) → ок', () => expect(validateInn('7707083893')).toBeNull())
  it('валидный 12-значный → ок', () => expect(validateInn('500100732259')).toBeNull())
  it('неверная контрольная (10) → ошибка', () => expect(validateInn('7707083890')).not.toBeNull())
  it('неверная контрольная (12) → ошибка', () => expect(validateInn('500100732250')).not.toBeNull())
  it('неверная длина → ошибка', () => expect(validateInn('12345')).not.toBeNull())
})

describe('validateOktmo', () => {
  it('8 цифр → ок', () => expect(validateOktmo('45000000')).toBeNull())
  it('11 цифр → ок', () => expect(validateOktmo('45379000000')).toBeNull())
  it('9 цифр → ошибка', () => expect(validateOktmo('450000000')).not.toBeNull())
  it('пусто → ок', () => expect(validateOktmo('')).toBeNull())
})

describe('validateKpp', () => {
  it('770401001 → ок', () => expect(validateKpp('770401001')).toBeNull())
  it('короткий → ошибка', () => expect(validateKpp('12345')).not.toBeNull())
})

describe('validateSnils', () => {
  it('валидный 112-233-445 95 → ок', () => expect(validateSnils('11223344595')).toBeNull())
  it('неверная контрольная → ошибка', () => expect(validateSnils('11223344500')).not.toBeNull())
  it('неверная длина → ошибка', () => expect(validateSnils('112233')).not.toBeNull())
  it('пусто → ок', () => expect(validateSnils('')).toBeNull())
})

describe('validateOgrnip', () => {
  it('неверная длина → ошибка', () => expect(validateOgrnip('123')).not.toBeNull())
  it('пусто → ок', () => expect(validateOgrnip('')).toBeNull())
})
