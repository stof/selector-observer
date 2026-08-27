import { SelectorWatcher } from './watcher.js';

export { SelectorWatcher };

/**
 * Watch a CSS selector and get told when elements start and stop matching it.
 *
 *     const watcher = observe('.price', element => {
 *         element.dataset.mine = '1';
 *         return () => delete element.dataset.mine;   // undo on disappear
 *     });
 *
 * @param {string} selector CSS selector to watch.
 * @param {Function|object} [handler] `onAppear` callback, or an options object.
 * @param {object} [options] Options, when `handler` is a callback.
 * @param {Function} [options.onAppear] Called with each element that starts matching.
 *        Returning a function registers it as the undo step for that element.
 * @param {Function} [options.onDisappear] Called with each element that stops matching.
 * @param {Function} [options.onError] Called with `(error, element, watcher)` when a
 *        callback throws. Defaults to `console.error`.
 * @param {Document|DocumentFragment|Element} [options.root] Where to query. Defaults to
 *        `document`. Pass a `ShadowRoot` to watch inside a shadow tree.
 * @param {boolean} [options.initial] Report elements that already match, immediately.
 *        Defaults to `true`.
 * @param {AbortSignal} [options.signal] Aborting it stops the watcher.
 * @returns {SelectorWatcher}
 */
export function observe(selector, handler, options) {
    const config = normalize(handler, options);
    const root = config.root ?? defaultRoot();
    const watcher = new SelectorWatcher(root, selector, config);

    const { signal } = config;
    if (signal) {
        if (signal.aborted) {
            watcher.stop();
            return watcher;
        }
        signal.addEventListener('abort', () => watcher.stop(), { once: true });
    }
    if (config.initial === false) {
        watcher.adopt();
    } else {
        watcher.scan();
    }
    return watcher;
}

/**
 * Resolve with the first element matching `selector`, now or later.
 *
 * @param {string} selector CSS selector to wait for.
 * @param {object} [options] `root`, `signal` and `timeout` (ms) are honoured.
 * @returns {Promise<Element>}
 */
export function waitFor(selector, options = {}) {
    const { timeout, ...rest } = options;
    return new Promise((resolve, reject) => {
        const { signal } = rest;
        if (signal?.aborted) {
            reject(signal.reason ?? abortError('waitFor was aborted'));
            return;
        }
        let watcher = null;
        let timer = null;
        let settled = false;

        const finish = (settle) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            // May still be null when the very first scan matches synchronously;
            // the tail of this function stops it as soon as observe() returns.
            watcher?.stop({ cleanup: false });
            settle();
        };

        if (signal) {
            signal.addEventListener('abort', () => {
                finish(() => reject(signal.reason ?? abortError('waitFor was aborted')));
            }, { once: true });
        }
        if (timeout != null) {
            timer = setTimeout(() => {
                finish(() => reject(abortError(`waitFor timed out after ${timeout}ms: ${selector}`)));
            }, timeout);
        }
        if (settled) {
            return;
        }

        watcher = observe(selector, {
            ...rest,
            onDisappear: undefined,
            onAppear: (element) => finish(() => resolve(element)),
        });
        if (settled) {
            watcher.stop({ cleanup: false });
        }
    });
}

function normalize(handler, options) {
    if (typeof handler === 'function') {
        return { ...options, onAppear: handler };
    }
    return { ...handler, ...options };
}

function defaultRoot() {
    if (typeof document === 'undefined') {
        throw new Error('[selector-observer] no document available; pass options.root');
    }
    return document;
}

function abortError(message) {
    return typeof DOMException === 'function'
        ? new DOMException(message, 'AbortError')
        : Object.assign(new Error(message), { name: 'AbortError' });
}

export default { observe, waitFor, SelectorWatcher };
