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
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.text !== undefined) node.textContent = props.text;
  if (props.className) node.className = props.className;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export type MessageKind = 'ok' | 'error' | 'info';

/** Muestra un aviso en línea; con texto vacío el aviso se oculta (.alert:empty). */
export function showMessage(target: HTMLElement, text: string, kind: MessageKind = 'info') {
  target.textContent = text;
  target.className = `alert ${kind}`;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Aviso flotante que desaparece solo. */
export function toast(text: string, kind: MessageKind = 'ok', ms = 4000) {
  const node = $('toast');
  showMessage(node, text, kind);
  node.classList.add('toast');
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), ms);
}
