export const clearSearchHighlights = (root: HTMLElement) => {
  root
    .querySelectorAll('mark[data-settings-search-highlight="true"]')
    .forEach((mark) => {
      const parent = mark.parentNode
      if (!parent) return

      parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
      parent.normalize()
    })
}

export const highlightSearchTerms = (
  root: HTMLElement,
  searchTerms: string[]
) => {
  const uniqueTerms = Array.from(
    new Set(searchTerms.map((term) => term.trim()).filter(Boolean))
  )
  if (uniqueTerms.length === 0) return

  const searchPattern = new RegExp(
    `(${uniqueTerms.map(escapeRegExp).join('|')})`,
    'gi'
  )
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  while (walker.nextNode()) {
    const node = walker.currentNode
    const parentElement = node.parentElement
    if (!parentElement || shouldSkipSearchHighlight(parentElement)) continue
    if (!node.textContent || !searchPattern.test(node.textContent)) continue

    textNodes.push(node as Text)
    searchPattern.lastIndex = 0
  }

  textNodes.forEach((node) => {
    const text = node.textContent ?? ''
    const fragment = document.createDocumentFragment()
    let lastIndex = 0

    text.replace(searchPattern, (match, _term, offset: number) => {
      if (offset > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, offset))
        )
      }

      const mark = document.createElement('mark')
      mark.dataset.settingsSearchHighlight = 'true'
      mark.className = 'settings-search-highlight'
      mark.textContent = match
      fragment.appendChild(mark)
      lastIndex = offset + match.length
      return match
    })

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
    }

    node.replaceWith(fragment)
    searchPattern.lastIndex = 0
  })
}

const shouldSkipSearchHighlight = (element: Element) =>
  Boolean(
    element.closest(
      'input, textarea, select, option, script, style, mark[data-settings-search-highlight="true"]'
    )
  )

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
