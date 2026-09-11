import './style.css'
import Epub from 'epubjs'
import type Section from 'epubjs/types/section'
import type Contents from 'epubjs/types/contents'
import { buildNormalizedText, type Run } from './domAlign'

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

rendition.on('rendered', async (section: Section, view: { contents: Contents }) => {
  const doc = view.contents.document
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
