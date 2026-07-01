// Minimal hyperscript-style DOM builder. No framework, no virtual DOM —
// panels rebuild their subtree on each store tick (cheap at these sizes).
//
//   el('div.panel')(
//     el('div.panel-header')(el('span.panel-title')('Timing')),
//     el('div.panel-body')(...)
//   )
//
// String/number/array children are flattened; nulls/booleans are skipped.

function applyProps(node, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class' || k === 'className') {
      node.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    } else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (v === true) {
      node.setAttribute(k, '');
    } else if (v !== false && v != null) {
      node.setAttribute(k, v);
    }
  }
}

function appendChildren(node, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) { appendChildren(node, c); continue; }
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
}

export function el(tagSpec) {
  const [tag, ...classes] = tagSpec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  return (propsOrFirstChild, ...rest) => {
    let props = null;
    let children;
    if (propsOrFirstChild && typeof propsOrFirstChild === 'object' && !(propsOrFirstChild instanceof Node) && !Array.isArray(propsOrFirstChild)) {
      props = propsOrFirstChild;
      children = rest;
    } else {
      children = [propsOrFirstChild, ...rest];
    }
    applyProps(node, props);
    appendChildren(node, children);
    return node;
  };
}

// Replace the contents of a root element with a freshly-built node.
export function mount(root, node) {
  root.replaceChildren(node);
}

// Keep a DOM region in sync with a store subscription.
export function bindRegion(getRoot, build) {
  return (state) => {
    const root = getRoot();
    if (!root) return;
    const node = build(state);
    if (node) root.replaceChildren(node);
    else root.replaceChildren();
  };
}
