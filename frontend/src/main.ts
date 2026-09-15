import './style.css'
import Epub from 'epubjs'
import type Section from 'epubjs/types/section'
import type Contents from 'epubjs/types/contents'
import { renderTocList } from './toc'
// Shadows the global DOM `Location` (window.location) within this module --
// deliberate, this is epub.js's own Location (a {start, end} pair of
// DisplayedLocation), which is what "relocated" actually hands us.
import type { Location } from 'epubjs/types/rendition'
import { buildNormalizedText, domToNorm, normToDom, type Run } from './domAlign'

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

interface LexicalEntryOut {
  lemma: string
  readings: string[]
  glosses: string[]
}

async function lookupLemma(lemma: string, posHint: string): Promise<LexicalEntryOut | null> {
  const response = await fetch(`${API_BASE}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // TokenOut.pos is already UniDic-style Japanese (e.g. "助詞"), the exact
    // vocabulary dictionary.py's pos_hint expects (see its
    // _POS_HINT_PATTERNS table) -- no translation needed between the two.
    body: JSON.stringify({ lemma, pos_hint: posHint }),
  })
  if (response.status === 404) return null
  return response.json()
}

// Keyed by section href. Populated as each section is rendered, so lookups
// (step 3+) only need to touch the section currently on screen.
const sectionData = new Map<string, SectionData>()

let popupEl: HTMLDivElement | null = null

function removePopup(): void {
  popupEl?.remove()
  popupEl = null
}

// Click coordinates from inside the iframe are in the iframe's own viewport
// space, so the popup is built in the top-level document (able to overlay
// the whole page, not clipped by the iframe/container's own bounds) and
// positioned using clientX/clientY offset by the iframe element's own
// position in the top-level page.
function showPopup(pageX: number, pageY: number, entry: LexicalEntryOut): void {
  removePopup()

  const popup = document.createElement('div')
  popup.style.position = 'fixed'
  popup.style.left = `${pageX}px`
  popup.style.top = `${pageY}px`
  popup.style.maxWidth = '320px'
  popup.style.maxHeight = '40vh'
  popup.style.overflowY = 'auto'
  popup.style.background = 'white'
  popup.style.color = 'black'
  popup.style.border = '1px solid #333'
  popup.style.borderRadius = '4px'
  popup.style.padding = '8px 12px'
  popup.style.font = '14px sans-serif'
  popup.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)'
  popup.style.zIndex = '9999'

  const heading = document.createElement('div')
  heading.style.fontWeight = 'bold'
  heading.style.fontSize = '16px'
  heading.textContent =
    entry.readings.length > 0 ? `${entry.lemma} (${entry.readings.join('、')})` : entry.lemma
  popup.appendChild(heading)

  const list = document.createElement('ol')
  list.style.margin = '4px 0 0 18px'
  list.style.padding = '0'
  for (const gloss of entry.glosses) {
    const item = document.createElement('li')
    item.textContent = gloss
    list.appendChild(item)
  }
  popup.appendChild(list)

  // Stop clicks inside the popup from reaching the top-level dismiss
  // listener below and immediately closing it.
  popup.addEventListener('click', (e) => e.stopPropagation())

  document.body.appendChild(popup)
  popupEl = popup
}

// Dismiss on any click outside the popup. Clicks inside the epub.js iframe
// don't bubble up to this listener (each iframe is its own document), so
// dismissal for "clicked elsewhere in the book" is handled directly in the
// click handler below instead -- this covers clicks outside the iframe.
document.addEventListener('click', () => removePopup())

const viewer = document.querySelector<HTMLDivElement>('#app')!

const book = Epub('/sample.epub')
const rendition = book.renderTo(viewer, {
  width: '100%',
  height: '100%',
  // Force one logical page per screen instead of epub.js's default
  // two-page book-style spread.
  spread: 'none',
})

// Single fixed key: there's only ever one hardcoded book right now
// (/sample.epub). This will need a per-book key (e.g. derived from the
// book's identifier) once the library isn't just one file.
const LAST_POSITION_KEY = 'yomu:lastPosition'

const savedCfi = localStorage.getItem(LAST_POSITION_KEY)
rendition.display(savedCfi ?? undefined)

// "relocated" (not "rendered") is epub.js's purpose-built "the displayed
// location changed" event -- it fires once per actual navigation, unlike
// "rendered" which fires per view and can duplicate.
rendition.on('relocated', (location: Location) => {
  try {
    localStorage.setItem(LAST_POSITION_KEY, location.start.cfi)
  } catch {
    // localStorage can throw (private browsing, storage disabled, quota) --
    // losing the saved position isn't worth crashing the reader over.
  }
})

document.querySelector<HTMLButtonElement>('#prev-btn')!.addEventListener('click', () => {
  rendition.prev()
})
document.querySelector<HTMLButtonElement>('#next-btn')!.addEventListener('click', () => {
  rendition.next()
})

// Arrow keys work from the top-level document by default, but focus can
// shift into the epub.js iframe's own document once the user clicks inside
// the book -- a keydown listener only on the parent document would silently
// stop catching arrow keys after that. bindArrowKeyNavigation is called both
// here (once, for the top-level document) and per-iframe-document below
// (guarded by the same WeakSet as the click handler).
function bindArrowKeyNavigation(target: Document): void {
  target.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      rendition.next()
    } else if (event.key === 'ArrowLeft') {
      rendition.prev()
    }
  })
}

bindArrowKeyNavigation(document)

const tocPanel = document.querySelector<HTMLElement>('#toc-panel')!

document.querySelector<HTMLButtonElement>('#toc-btn')!.addEventListener('click', () => {
  tocPanel.hidden = !tocPanel.hidden
})

book.loaded.navigation.then((navigation) => {
  tocPanel.appendChild(
    renderTocList(navigation.toc, (href) => {
      rendition.display(href)
      tocPanel.hidden = true
    }),
  )
})

function findTokenAt(tokens: TokenOut[], offset: number): TokenOut | undefined {
  return tokens.find((t) => offset >= t.start && offset < t.end)
}

// epub.js's "rendered" event can fire more than once for what turns out to
// be the same iframe document (observed during initial layout settling). A
// WeakSet keyed on the document -- rather than on section href -- attaches
// these listeners at most once per actual document instance, whether that's
// because of a duplicate event or a genuinely new iframe.
const docListenersAttached = new WeakSet<Document>()

function attachDocumentListeners(section: Section, doc: Document): void {
  if (docListenersAttached.has(doc)) return
  docListenersAttached.add(doc)

  bindArrowKeyNavigation(doc)
  injectHighlightStyle(doc)

  // caretRangeFromPoint is the WebKit/Safari spelling (no standard
  // cross-browser equivalent) -- fine here since this targets a Mac webview,
  // per the project's click-resolution design.
  doc.addEventListener('click', async (event: MouseEvent) => {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY)
    if (!range) {
      console.log('[click] no caret position at click point')
      removePopup()
      return
    }

    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) {
      console.log('[click] click did not land on a text node')
      removePopup()
      return
    }

    const data = sectionData.get(section.href)
    if (!data) {
      console.log('[click] no analysis for this section yet')
      removePopup()
      return
    }

    let offset: number
    try {
      offset = domToNorm(data.runs, node as Text, range.startOffset)
    } catch {
      // e.g. a click on furigana (<rt>/<rp>), which buildNormalizedText
      // deliberately excludes from the run array.
      console.log('[click] clicked position is not tracked text')
      removePopup()
      return
    }

    const token = findTokenAt(data.tokens, offset)
    if (!token) {
      console.log(`[click] no token at normalized offset ${offset}`)
      removePopup()
      return
    }

    console.log(`[click] token surface="${token.surface}" lemma="${token.lemma}"`)

    const entry = await lookupLemma(token.lemma, token.pos)
    if (!entry) {
      console.log(`[lookup] no dictionary entry for "${token.lemma}"`)
      removePopup()
      return
    }

    // Translate the click's iframe-local coordinates into the top-level
    // page's coordinate space, since the popup lives in the parent document.
    const frameEl = doc.defaultView?.frameElement as HTMLElement | null
    const frameRect = frameEl?.getBoundingClientRect() ?? { left: 0, top: 0 }
    showPopup(frameRect.left + event.clientX, frameRect.top + event.clientY, entry)
  })
}

// --- TTS playback ---

const HIGHLIGHT_NAME = 'tts-sentence'

// The CSS Custom Highlight API's registry (CSS.highlights) and the
// ::highlight() pseudo-element are per-document, scoped to whichever
// document the styled content lives in -- so the rule has to be injected
// into each iframe document, not style.css (which only reaches the
// top-level document).
function injectHighlightStyle(doc: Document): void {
  const style = doc.createElement('style')
  style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: #ffe066; }`
  doc.head.appendChild(style)
}

function getCurrentSectionDoc(): { href: string; doc: Document } | null {
  // currentLocation()'s declared return type (DisplayedLocation) doesn't
  // match what it actually returns at runtime (a Location: {start, end}) --
  // same kind of inaccuracy as getContents() being typed as singular when it
  // returns an array. Cast to the type "relocated" already told us is real.
  const location = rendition.currentLocation() as unknown as Location
  const contents = (rendition.getContents() as unknown as Contents[]).find(
    (c) => c.sectionIndex === location.start.index,
  )
  if (!contents) return null
  return { href: location.start.href, doc: contents.document }
}

function highlightSentenceRange(doc: Document, runs: Run[], sentence: SentenceOut): void {
  const startPos = normToDom(runs, sentence.start)
  const endPos = normToDom(runs, sentence.end)

  const range = doc.createRange()
  range.setStart(startPos.node, startPos.domOffset)
  range.setEnd(endPos.node, endPos.domOffset)

  // Highlight/CSS are per-realm globals -- must come from the iframe's own
  // window, not the top-level one, same reasoning as caretRangeFromPoint
  // needing to run on the iframe's own document.
  const iframeWindow = doc.defaultView
  if (!iframeWindow) return
  iframeWindow.CSS.highlights.set(HIGHLIGHT_NAME, new iframeWindow.Highlight(range))
}

interface PlaybackState {
  sectionHref: string
  sentences: SentenceOut[]
  index: number
  // Sentence index -> its audio object URL, once fetched. Doubles as the
  // prefetch cache: the next sentence's fetch is kicked off while the
  // current one plays, so by the time "ended" fires the URL is usually
  // already sitting here.
  audioUrls: Map<number, Promise<string>>
}

let playback: PlaybackState | null = null
const ttsAudio = new Audio()

const playPauseBtn = document.querySelector<HTMLButtonElement>('#play-pause-btn')!

function updatePlayPauseLabel(): void {
  playPauseBtn.textContent = playback && !ttsAudio.paused ? 'Pause' : 'Play'
}

async function fetchTtsAudioUrl(sentence: SentenceOut): Promise<string> {
  const response = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence_id: String(sentence.id), text: sentence.text }),
  })
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

function ensurePrefetch(state: PlaybackState, index: number): void {
  if (index < 0 || index >= state.sentences.length) return
  if (state.audioUrls.has(index)) return
  state.audioUrls.set(index, fetchTtsAudioUrl(state.sentences[index]))
}

async function playSentenceAt(state: PlaybackState, index: number): Promise<void> {
  if (playback !== state) return // superseded by a stop/restart while awaiting

  // The sentence we just finished won't be replayed -- release its object URL.
  if (state.index >= 0) {
    const prevUrl = state.audioUrls.get(state.index)
    state.audioUrls.delete(state.index)
    prevUrl?.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  }

  if (index >= state.sentences.length) {
    stopPlayback()
    return
  }

  state.index = index
  const sentence = state.sentences[index]

  const sectionDoc = getCurrentSectionDoc()
  const data = sectionData.get(state.sectionHref)
  if (sectionDoc && sectionDoc.href === state.sectionHref && data) {
    highlightSentenceRange(sectionDoc.doc, data.runs, sentence)
  }

  let url: string
  try {
    ensurePrefetch(state, index)
    url = await state.audioUrls.get(index)!
  } catch (error) {
    console.log('[tts] failed to fetch audio for sentence', index, error)
    stopPlayback()
    return
  }
  if (playback !== state) return

  ttsAudio.src = url
  updatePlayPauseLabel()
  try {
    await ttsAudio.play()
  } catch (error) {
    // Autoplay can be blocked in some contexts; the play button click that
    // leads here should normally count as a user gesture, but don't let a
    // rejected play() promise go unhandled.
    console.log('[tts] audio.play() rejected', error)
  }

  ensurePrefetch(state, index + 1)
}

function startPlayback(): void {
  const sectionDoc = getCurrentSectionDoc()
  const data = sectionDoc ? sectionData.get(sectionDoc.href) : undefined
  if (!sectionDoc || !data || data.sentences.length === 0) {
    console.log('[tts] no analyzed section ready to play yet')
    return
  }

  playback = { sectionHref: sectionDoc.href, sentences: data.sentences, index: -1, audioUrls: new Map() }
  playSentenceAt(playback, 0)
}

function stopPlayback(): void {
  if (!playback) return

  ttsAudio.pause()
  ttsAudio.removeAttribute('src')
  for (const urlPromise of playback.audioUrls.values()) {
    urlPromise.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  }
  playback = null
  updatePlayPauseLabel()
}

ttsAudio.addEventListener('ended', () => {
  if (!playback) return
  playSentenceAt(playback, playback.index + 1)
})

playPauseBtn.addEventListener('click', () => {
  if (playback === null) {
    startPlayback()
  } else if (ttsAudio.paused) {
    ttsAudio.play()
  } else {
    ttsAudio.pause()
  }
  updatePlayPauseLabel()
})

// Stop playback on any manual navigation -- TOC click, prev/next buttons,
// and arrow keys all funnel through rendition.display()/.next()/.prev(),
// which all fire "relocated". Playback itself never calls those, so this
// can't misfire during normal sentence-to-sentence advancement.
rendition.on('relocated', () => {
  stopPlayback()
})

rendition.on('rendered', async (section: Section) => {
  // The "rendered" event's own (section, view) callback args are unreliable:
  // epub.js's internals (rendition.js afterDisplayed) explicitly emit
  // "rendered" even when view.contents isn't attached yet, so reading
  // view.contents directly crashed here intermittently. rendition.getContents()
  // is the manager's own list of views whose contents *are* attached
  // (it filters out exactly this case), so look up this section's Contents
  // there instead, matching by section index. If it's not ready yet, skip --
  // a later "rendered" firing for the same section covers it correctly.
  const contents = (rendition.getContents() as unknown as Contents[]).find(
    (c) => c.sectionIndex === section.index,
  )
  if (!contents) return

  const doc = contents.document
  attachDocumentListeners(section, doc)

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
