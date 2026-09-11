import { describe, expect, it } from 'vitest'
import { buildNormalizedText, domToNorm, normToDom, type Run } from './domAlign'

function roundTripEveryOffset(text: string, runs: Run[]): void {
  const length = Array.from(text).length
  for (let i = 0; i <= length; i++) {
    const { node, domOffset } = normToDom(runs, i)
    expect(domToNorm(runs, node, domOffset)).toBe(i)
  }
}

describe('buildNormalizedText', () => {
  it('handles plain text with no markup', () => {
    const div = document.createElement('div')
    div.textContent = 'hello world'

    const { text, runs } = buildNormalizedText(div)

    expect(text).toBe('hello world')
    expect(runs).toHaveLength(1)
    expect(runs[0].normStart).toBe(0)
    expect(runs[0].normEnd).toBe(11)
    roundTripEveryOffset(text, runs)
  })

  it('excludes ruby furigana (<rt>/<rp>) and aligns offsets to the base text', () => {
    const div = document.createElement('div')
    div.innerHTML = '<ruby>漢字<rt>かんじ</rt></ruby>'

    const { text, runs } = buildNormalizedText(div)

    expect(text).toBe('漢字')
    expect(runs).toHaveLength(1)
    expect(runs[0].node.data).toBe('漢字')

    const start = normToDom(runs, 0)
    expect(start.node.data).toBe('漢字')
    expect(start.domOffset).toBe(0)

    const afterFirstChar = normToDom(runs, 1)
    expect(afterFirstChar.domOffset).toBe(1)
    expect(domToNorm(runs, afterFirstChar.node, afterFirstChar.domOffset)).toBe(1)

    const end = normToDom(runs, 2)
    expect(end.domOffset).toBe(2)

    roundTripEveryOffset(text, runs)
  })

  it('handles <rp> fallback parens alongside <rt>', () => {
    const div = document.createElement('div')
    div.innerHTML = '<ruby>漢字<rp>（</rp><rt>かんじ</rt><rp>）</rp></ruby>と読む'

    const { text, runs } = buildNormalizedText(div)

    expect(text).toBe('漢字と読む')
    roundTripEveryOffset(text, runs)
  })

  it('round-trips a supplementary-plane character (U+20B9F, 2 UTF-16 units / 1 code point)', () => {
    const supplementary = '\u{20B9F}' // 𠮟
    expect(supplementary.length).toBe(2) // UTF-16 units
    expect(Array.from(supplementary).length).toBe(1) // code points

    const div = document.createElement('div')
    div.textContent = `a${supplementary}b`

    const { text, runs } = buildNormalizedText(div)

    expect(text).toBe(`a${supplementary}b`)
    expect(Array.from(text).length).toBe(3) // a, 𠮟, b
    expect(text.length).toBe(4) // UTF-16 units, would silently desync naive code

    // norm offset 1 sits between 'a' and '𠮟': 'a' is 1 UTF-16 unit.
    const beforeSupplementary = normToDom(runs, 1)
    expect(beforeSupplementary.domOffset).toBe(1)

    // norm offset 2 sits between '𠮟' and 'b': 'a' + '𠮟' is 1 + 2 = 3 UTF-16 units.
    const afterSupplementary = normToDom(runs, 2)
    expect(afterSupplementary.domOffset).toBe(3)

    // norm offset 3 is the end: 4 UTF-16 units total.
    const end = normToDom(runs, 3)
    expect(end.domOffset).toBe(4)

    roundTripEveryOffset(text, runs)
  })

  it('catches the UTF-16-vs-code-point bug across a run boundary', () => {
    // Two adjacent text nodes, the first a lone supplementary-plane character.
    // A naive `.length`-based implementation would put the second run's
    // normStart at 2 (UTF-16 units) instead of 1 (code points).
    const div = document.createElement('div')
    const span1 = document.createElement('span')
    span1.textContent = '\u{20B9F}' // 𠮟, 1 code point / 2 UTF-16 units
    const span2 = document.createElement('span')
    span2.textContent = '字'
    div.append(span1, span2)

    const { text, runs } = buildNormalizedText(div)

    expect(text).toBe('\u{20B9F}字')
    expect(runs).toHaveLength(2)
    expect(runs[0].normStart).toBe(0)
    expect(runs[0].normEnd).toBe(1)
    expect(runs[1].normStart).toBe(1)
    expect(runs[1].normEnd).toBe(2)

    roundTripEveryOffset(text, runs)
  })

  it('handles nested spans / mixed inline markup', () => {
    const div = document.createElement('div')
    div.innerHTML = '<p>先生は<span>「<b>元気</b>？」</span>と聞いた。</p>'

    const { text, runs } = buildNormalizedText(div)

    expect(text).toBe('先生は「元気？」と聞いた。')

    const genkiRun = runs.find((r) => r.node.data === '元気')
    expect(genkiRun).toBeDefined()
    // "先生は「" is 4 code points, so the run starting the nested <b> text
    // must begin at normalized offset 4, not wherever a flat DOM-offset
    // scan across siblings might land.
    expect(genkiRun!.normStart).toBe(4)
    expect(genkiRun!.normEnd).toBe(6)

    // Clicking between 元 and 気 inside the nested <b> resolves to the
    // correct position in the overall normalized string.
    const globalOffset = domToNorm(runs, genkiRun!.node, 1)
    expect(globalOffset).toBe(5)

    const back = normToDom(runs, 5)
    expect(back.node).toBe(genkiRun!.node)
    expect(back.domOffset).toBe(1)

    roundTripEveryOffset(text, runs)
  })
})
