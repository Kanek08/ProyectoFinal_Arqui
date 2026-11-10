/** Utilidades mínimas de DOM (sin frameworks). */

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta el elemento #${id}`);
  return el as T;
}

/** Crea un elemento con texto y atributos. textContent evita inyectar HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { text?: string; className?: string; attrs?: Record<string, string> } = {},
  children: (HTMLElement | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.text !== undefined) node.textContent = props.text;
  if (props.className) node.className = props.className;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function showMessage(target: HTMLElement, text: string, kind: 'ok' | 'error' | 'info' = 'info') {
  target.textContent = text;
  target.className = `message ${kind}`;
}
