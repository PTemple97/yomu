import './style.css'
import Epub from 'epubjs'

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
