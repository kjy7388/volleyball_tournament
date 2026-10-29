// One original snapshot per document, shared by every open modal. A token makes
// cleanup idempotent and independent of parent/child unmount order (StrictMode too).
const locks = new WeakMap();
const overflowProperties = ["overflow", "overflow-x", "overflow-y"];

function capture(element) {
  const style = element.style;
  const declarations = Array.from(style)
    .filter((property) => overflowProperties.includes(property))
    .map((property) => ({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
    }));
  return { element, declarations };
}

function restore({ element, declarations }) {
  // Do not replace cssText: unrelated inline changes made while open must survive.
  for (const property of overflowProperties)
    element.style.removeProperty(property);
  for (const { property, value, priority } of declarations)
    element.style.setProperty(property, value, priority);
}

export function acquireScrollLock(doc = globalThis.document) {
  if (!doc?.body || !doc.documentElement) return () => {};
  let state = locks.get(doc);
  if (!state) {
    state = {
      tokens: new Set(),
      snapshots: [doc.documentElement, doc.body].map(capture),
    };
    locks.set(doc, state);
    for (const { element } of state.snapshots)
      element.style.setProperty("overflow", "hidden", "important");
  }
  const token = Symbol("modal-scroll-lock");
  state.tokens.add(token);
  return () => {
    if (!state.tokens.delete(token) || state.tokens.size) return;
    for (const snapshot of state.snapshots) restore(snapshot);
    locks.delete(doc);
  };
}
