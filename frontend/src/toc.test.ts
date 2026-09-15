import type { NavItem } from 'epubjs/types/navigation'
import { describe, expect, it, vi } from 'vitest'
import { renderTocList } from './toc'

function item(label: string, href: string, subitems?: NavItem[]): NavItem {
  return { id: href, href, label, subitems }
}

describe('renderTocList', () => {
  it('renders all levels of a nested TOC', () => {
    const toc: NavItem[] = [
      item('Chapter 1', 'ch1.xhtml'),
      item('Chapter 2', 'ch2.xhtml', [
        item('Section 2.1', 'ch2.xhtml#s1'),
        item('Section 2.2', 'ch2.xhtml#s2'),
      ]),
    ]

    const list = renderTocList(toc, () => {})

    const topLevelItems = [...list.children]
    expect(topLevelItems).toHaveLength(2)

    const allLinks = [...list.querySelectorAll('a')]
    expect(allLinks.map((a) => a.textContent)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Section 2.1',
      'Section 2.2',
    ])

    // The nested <ul> lives under Chapter 2's <li> only.
    expect(topLevelItems[0].querySelector('ul')).toBeNull()
    expect(topLevelItems[1].querySelector('ul')).not.toBeNull()
  })

  it('calls onSelect with the nested entry\'s own href when clicked', () => {
    const toc: NavItem[] = [
      item('Chapter 1', 'ch1.xhtml', [
        item('Section 1.1', 'ch1.xhtml#s1'),
        item('Section 1.2', 'ch1.xhtml#s2'),
      ]),
    ]

    const onSelect = vi.fn()
    const list = renderTocList(toc, onSelect)

    const links = [...list.querySelectorAll('a')]
    expect(links.map((a) => a.textContent)).toEqual(['Chapter 1', 'Section 1.1', 'Section 1.2'])

    links[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('ch1.xhtml#s2')
  })

  it('does not call onSelect for a sibling entry', () => {
    const toc: NavItem[] = [item('Chapter 1', 'ch1.xhtml'), item('Chapter 2', 'ch2.xhtml')]

    const onSelect = vi.fn()
    const list = renderTocList(toc, onSelect)

    const links = [...list.querySelectorAll('a')]
    links[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelect).toHaveBeenCalledWith('ch1.xhtml')
    expect(onSelect).not.toHaveBeenCalledWith('ch2.xhtml')
  })
})
