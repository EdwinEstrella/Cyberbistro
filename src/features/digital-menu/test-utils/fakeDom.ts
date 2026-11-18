import type React from "react";
import { createRoot } from "react-dom/client";
// @ts-ignore react-dom types are not installed in devDependencies
import { flushSync } from "react-dom";

export type FakeDomRoot = ReturnType<typeof createRoot>;

export class MockTextNode {
  nodeType = 3;
  nodeValue: string;
  data: string;
  ownerDocument: any;
  parentNode: any = null;

  constructor(text: string, doc: any) {
    this.nodeValue = text;
    this.data = text;
    this.ownerDocument = doc;
  }
}

export class MockElement {
  tagName: string;
  nodeType = 1;
  childNodes: any[] = [];
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, Function[]> = {};
  ownerDocument: any;
  parentNode: any = null;
  value = "";

  constructor(tag: string, doc: any) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
  }

  appendChild(child: any) {
    this.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child: any) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(newChild: any, refChild: any) {
    this.removeChild(newChild);
    const idx = this.childNodes.indexOf(refChild);
    if (idx !== -1) this.childNodes.splice(idx, 0, newChild);
    else this.childNodes.push(newChild);
    newChild.parentNode = this;
    return newChild;
  }

  setAttribute(k: string, v: any) {
    this.attributes[k] = String(v);
  }

  setAttributeNS(_ns: string, k: string, v: any) {
    this.attributes[k] = String(v);
  }

  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }

  removeAttribute(k: string) {
    delete this.attributes[k];
  }

  addEventListener(type: string, listener: Function) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: Function) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: any) {
    event.target = event.target || this;
    event.currentTarget = this;
    let curr: any = this;
    while (curr) {
      const list = curr.listeners?.[event.type] || [];
      for (const l of list) l(event);
      if (event._stop) break;
      curr = curr.parentNode || (curr === this.ownerDocument ? null : this.ownerDocument);
    }
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  get textContent(): string {
    return this.childNodes
      .map((c: any) => (c.nodeType === 3 ? (c.nodeValue ?? c.data ?? "") : c.textContent || ""))
      .join("");
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new MockTextNode(val, this.ownerDocument));
    }
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `<${this.tagName}${this.attributes.placeholder ? ` placeholder="${this.attributes.placeholder}"` : ""}${this.attributes["aria-label"] ? ` aria-label="${this.attributes["aria-label"]}"` : ""}${this.attributes["data-testid"] ? ` data-testid="${this.attributes["data-testid"]}"` : ""}>`;
  }
}

export function findElement(
  node: any,
  predicate: (el: MockElement) => boolean,
  visited = new Set<any>()
): MockElement | null {
  if (!node || visited.has(node)) return null;
  visited.add(node);
  if (node instanceof MockElement && predicate(node)) {
    return node;
  }
  for (const child of node.childNodes || []) {
    const found = findElement(child, predicate, visited);
    if (found) return found;
  }
  return null;
}

export interface FakeDomEnvironment {
  doc: any;
  container: MockElement;
  root: FakeDomRoot;
  findElement: (predicate: (el: MockElement) => boolean) => MockElement | null;
  cleanup: () => void;
  prevWindow: any;
  prevDoc: any;
}

export function setupFakeDom(): FakeDomEnvironment {
  const prevWindow = (global as any).window;
  const prevDoc = (global as any).document;
  const prevHTMLIFrameElement = (global as any).HTMLIFrameElement;

  const doc: any = {
    nodeType: 9,
    ownerDocument: null,
    listeners: {} as Record<string, Function[]>,
    createElement(tag: string) {
      return new MockElement(tag, this);
    },
    createElementNS(_ns: string, tag: string) {
      return new MockElement(tag, this);
    },
    createTextNode(text: string) {
      return new MockTextNode(text, this);
    },
    createComment(text: string) {
      return { nodeType: 8, nodeValue: text, ownerDocument: this };
    },
    addEventListener(type: string, listener: Function) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(listener);
    },
    removeEventListener(type: string, listener: Function) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter((l: Function) => l !== listener);
    },
    dispatchEvent(event: any) {
      const list = this.listeners[event.type] || [];
      for (const l of list) l(event);
    },
    activeElement: null,
  };

  doc.body = new MockElement("body", doc);
  doc.documentElement = new MockElement("html", doc);

  (global as any).window = {
    document: doc,
    addEventListener: doc.addEventListener.bind(doc),
    removeEventListener: doc.removeEventListener.bind(doc),
    dispatchEvent: doc.dispatchEvent.bind(doc),
    matchMedia() {
      return { matches: false, addListener: () => {}, removeListener: () => {} };
    },
    HTMLIFrameElement: class HTMLIFrameElement {},
  };
  (global as any).HTMLIFrameElement = class HTMLIFrameElement {};
  (global as any).document = doc;

  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);

  const cleanup = () => {
    try {
      flushSync(() => {
        root.unmount();
      });
    } catch {
      // ignore
    }
    delete (global as any).HTMLIFrameElement;
    if (prevHTMLIFrameElement !== undefined) {
      (global as any).HTMLIFrameElement = prevHTMLIFrameElement;
    }
    (global as any).window = prevWindow;
    (global as any).document = prevDoc;
  };

  return {
    doc,
    container,
    root,
    findElement: (predicate: (el: MockElement) => boolean) => findElement(container, predicate),
    cleanup,
    prevWindow,
    prevDoc,
  };
}

export function renderInFakeDom(element: React.ReactElement): FakeDomEnvironment {
  const env = setupFakeDom();
  flushSync(() => {
    env.root.render(element);
  });
  return env;
}

export function dispatchClick(element: MockElement, eventInit?: Record<string, any>) {
  element.dispatchEvent({
    type: "click",
    bubbles: true,
    ...eventInit,
  });
}

export function dispatchKeydown(target: any, key: string, eventInit?: Record<string, any>) {
  target.dispatchEvent({
    type: "keydown",
    key,
    bubbles: true,
    ...eventInit,
  });
}
