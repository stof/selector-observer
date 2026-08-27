import { JSDOM } from 'jsdom';

/** Fresh document per test, wired into the globals the library reads. */
export function freshDom(html = '<body></body>') {
    const dom = new JSDOM(`<!doctype html><html>${html}</html>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.DOMException = dom.window.DOMException;
    return dom;
}

/** Let the MutationObserver batch land and the resulting scan run. */
export function settle() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

export function el(tag, attrs = {}) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, value);
    }
    return node;
}
