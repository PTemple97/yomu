import type { NavItem } from 'epubjs/types/navigation'

// Pure DOM-building: takes a selection callback instead of touching
// rendition/tocPanel directly, so it doesn't need epub.js or a live book to
// test.
export function renderTocList(items: NavItem[], onSelect: (href: string) => void): HTMLUListElement {
  const list = document.createElement('ul')
  for (const item of items) {
    const entry = document.createElement('li')
    const link = document.createElement('a')
    link.textContent = item.label.trim()
    link.addEventListener('click', () => {
      onSelect(item.href)
    })
    entry.appendChild(link)
    if (item.subitems && item.subitems.length > 0) {
      entry.appendChild(renderTocList(item.subitems, onSelect))
    }
    list.appendChild(entry)
  }
  return list
}
