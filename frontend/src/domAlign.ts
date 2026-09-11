// DOM <-> normalized-text alignment.
//
// `domStart`/`domEnd` on a Run are native DOM string offsets (UTF-16 code
// units), matching what the DOM itself hands back (e.g. from
// `caretRangeFromPoint`). `normStart`/`normEnd` are offsets into the
// normalized text counted in Unicode code points, not UTF-16 units, so a
// supplementary-plane character (two UTF-16 units, one code point) doesn't
// desync the two coordinate spaces. All conversions below go through
// `for...of` iteration (or `Array.from`), never raw `.length`/`.slice`
// indexing, when doing code-point math.

export interface Run {
  node: Text
  domStart: number
  domEnd: number
  normStart: number
  normEnd: number
}

const SKIP_TAGS = new Set(['RT', 'RP'])

function isInsideSkippedElement(node: Node, root: Node): boolean {
  let el = node.parentElement
  while (el && el !== root) {
    if (SKIP_TAGS.has(el.tagName)) return true
    el = el.parentElement
  }
  return false
}

export function buildNormalizedText(root: Node): { text: string; runs: Run[] } {
  const doc = (root.ownerDocument ?? root) as Document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, (node) =>
    isInsideSkippedElement(node, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  )

  const parts: string[] = []
  const runs: Run[] = []
  let normPos = 0

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text
    const data = textNode.data
    if (data.length === 0) continue

    const cpLength = Array.from(data).length
    runs.push({
      node: textNode,
      domStart: 0,
      domEnd: data.length,
      normStart: normPos,
      normEnd: normPos + cpLength,
    })
    parts.push(data)
    normPos += cpLength
  }

  return { text: parts.join(''), runs }
}

// Converts a code-point offset within `str` to the corresponding UTF-16 offset.
function codePointToUtf16(str: string, cpOffset: number): number {
  let utf16 = 0
  let cp = 0
  for (const ch of str) {
    if (cp === cpOffset) return utf16
    cp += 1
    utf16 += ch.length
  }
  if (cp === cpOffset) return utf16
  throw new RangeError(`code point offset ${cpOffset} out of range`)
}

// Converts a UTF-16 offset within `str` to the corresponding code-point offset.
function utf16ToCodePoint(str: string, utf16Offset: number): number {
  let utf16 = 0
  let cp = 0
  for (const ch of str) {
    if (utf16 === utf16Offset) return cp
    utf16 += ch.length
    cp += 1
  }
  if (utf16 === utf16Offset) return cp
  throw new RangeError(`UTF-16 offset ${utf16Offset} out of range`)
}

function findRunByNormOffset(runs: Run[], normOffset: number): Run {
  if (runs.length === 0) {
    throw new RangeError('normToDom: no runs to search')
  }

  let lo = 0
  let hi = runs.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (runs[mid].normEnd <= normOffset) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return runs[lo]
}

export function normToDom(runs: Run[], normOffset: number): { node: Text; domOffset: number } {
  const run = findRunByNormOffset(runs, normOffset)

  if (normOffset >= run.normEnd) {
    // Past the end of every run: clamp to the end of the last run's text.
    const last = runs[runs.length - 1]
    return { node: last.node, domOffset: last.domEnd }
  }

  const localCp = normOffset - run.normStart
  const localUtf16 = codePointToUtf16(run.node.data.slice(run.domStart, run.domEnd), localCp)
  return { node: run.node, domOffset: run.domStart + localUtf16 }
}

export function domToNorm(runs: Run[], node: Text, domOffset: number): number {
  const run = runs.find((r) => r.node === node)
  if (!run) {
    throw new RangeError('domToNorm: node not found in runs')
  }

  const localUtf16 = domOffset - run.domStart
  const localCp = utf16ToCodePoint(node.data.slice(run.domStart, run.domEnd), localUtf16)
  return run.normStart + localCp
}
