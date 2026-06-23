/** Tiny safe DOM builder — uses textContent / append, never innerHTML, so no
 *  dynamic value is ever parsed as HTML. */

type Child = Node | string | null | undefined | false
type Attrs = Record<
  string,
  string | number | boolean | EventListenerOrEventListenerObject | undefined
>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue
      if (k === 'class') node.className = String(v)
      else if (k === 'text') node.textContent = String(v)
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v as EventListenerOrEventListenerObject)
      } else if (v === true) node.setAttribute(k, '')
      else node.setAttribute(k, String(v))
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    node.append(c)
  }
  return node
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}
