import './style.css'
import Epub from 'epubjs'
import type Section from 'epubjs/types/section'
import type Contents from 'epubjs/types/contents'
import { buildNormalizedText, domToNorm, type Run } from './domAlign'

const API_BASE = 'http://localhost:8000'

interface SentenceOut {
  id: number
  start: number
  end: number
  text: string
}

interface TokenOut {
  sentence_id: number
  start: number
  end: number
  surface: string
  lemma: string
  reading: string | null
  pos: string
}

interface AnalyzeResponse {
  sentences: SentenceOut[]
  tokens: TokenOut[]
}

interface SectionData {
  text: string
  runs: Run[]
  sentences: SentenceOut[]
  tokens: TokenOut[]
}

// Keyed by section href. Populated as each section is rendered, so lookups
// (step 3+) only need to touch the section currently on screen.
const sectionData = new Map<string, SectionData>()

const viewer = document.querySelector<HTMLDivElement>('#app')!

const book = Epub('/sample.epub')
const rendition = book.renderTo(viewer, {
  width: '100%',
  height: '100%',
  // Force one logical page per screen instead of epub.js's default
  // two-page book-style spread.
  spread: 'none',
})

rendition.display()

function findTokenAt(tokens: TokenOut[], offset: number): TokenOut | undefined {
  return tokens.find((t) => offset >= t.start && offset < t.end)
}

// epub.js's "rendered" event can fire more than once for what turns out to
// be the same iframe document (observed during initial layout settling). A
// WeakSet keyed on the document -- rather than on section href -- attaches
// the click listener at most once per actual document instance, whether
// that's because of a duplicate event or a genuinely new iframe.
const clickListenersAttached = new WeakSet<Document>()

function attachClickHandler(section: Section, doc: Document): void {
  if (clickListenersAttached.has(doc)) return
  clickListenersAttached.add(doc)

  // caretRangeFromPoint is the WebKit/Safari spelling (no standard
  // cross-browser equivalent) -- fine here since this targets a Mac webview,
  // per the project's click-resolution design.
  doc.addEventListener('click', (event: MouseEvent) => {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY)
    if (!range) {
      console.log('[click] no caret position at click point')
      return
    }

    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) {
      console.log('[click] click did not land on a text node')
      return
    }

    const data = sectionData.get(section.href)
    if (!data) {
      console.log('[click] no analysis for this section yet')
      return
    }

    let offset: number
    try {
      offset = domToNorm(data.runs, node as Text, range.startOffset)
    } catch {
      // e.g. a click on furigana (<rt>/<rp>), which buildNormalizedText
      // deliberately excludes from the run array.
      console.log('[click] clicked position is not tracked text')
      return
    }

    const token = findTokenAt(data.tokens, offset)
    if (!token) {
      console.log(`[click] no token at normalized offset ${offset}`)
      return
    }

    console.log(`[click] token surface="${token.surface}" lemma="${token.lemma}"`)
  })
}

rendition.on('rendered', async (section: Section, view: { contents: Contents }) => {
  const doc = view.contents.document
  attachClickHandler(section, doc)

  const { text, runs } = buildNormalizedText(doc.body)

  if (text.trim().length === 0) return

  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const analysis: AnalyzeResponse = await response.json()

  sectionData.set(section.href, { text, runs, sentences: analysis.sentences, tokens: analysis.tokens })

  console.log(`[analyze] ${section.href}`, analysis)
})
