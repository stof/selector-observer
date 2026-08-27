import { rootObserverFor } from './root-observer.js';

/**
 * Watches one selector inside one root and keeps track of every element that
 * currently matches it, so appear/disappear stay perfectly paired.
 */
export class SelectorWatcher {

    #root;
    #selector;
    #onAppear;
    #onDisappear;
    #onError;
    #owner;
    #live = new Map();
    #active = true;
    #scanning = false;

    constructor(root, selector, { onAppear, onDisappear, onError } = {}) {
        // Fail fast on a bad selector instead of on the first mutation.
        root.querySelector(selector);
        this.#root = root;
        this.#selector = selector;
        this.#onAppear = onAppear;
        this.#onDisappear = onDisappear;
        this.#onError = onError;
        this.#owner = rootObserverFor(root);
        this.#owner.add(this);
    }

    /** The selector being watched. */
    get selector() {
        return this.#selector;
    }

    /** The root the selector is queried against. */
    get root() {
        return this.#root;
    }

    /** False once {@link stop} has been called. */
    get active() {
        return this.#active;
    }

    /** Matching elements the watcher has announced, in document order. */
    get elements() {
        return [...this.#live].filter(([, entry]) => entry.announced).map(([element]) => element);
    }

    /**
     * Records the elements matching right now without announcing them, so they
     * are never reported as appearing or disappearing. This is what
     * `observe(..., { initial: false })` uses to skip the existing page.
     */
    adopt() {
        if (!this.#active) {
            return;
        }
        for (const element of this.#root.querySelectorAll(this.#selector)) {
            if (!this.#live.has(element)) {
                this.#live.set(element, { teardown: null, announced: false });
            }
        }
    }

    /**
     * Re-queries the selector and fires the callbacks for whatever changed.
     * Called automatically on DOM mutations; call it by hand after a change
     * the DOM cannot report (for example a `:hover`-dependent selector).
     */
    scan() {
        if (!this.#active || this.#scanning) {
            return;
        }
        this.#scanning = true;
        try {
            const matches = new Set(this.#root.querySelectorAll(this.#selector));
            for (const element of [...this.#live.keys()]) {
                if (!matches.has(element)) {
                    this.#drop(element);
                }
            }
            for (const element of matches) {
                if (!this.#live.has(element)) {
                    this.#add(element);
                }
            }
        } finally {
            this.#scanning = false;
        }
    }

    /**
     * Stops watching. By default every element still matching is treated as
     * disappearing, so teardown callbacks run and customizations are undone.
     */
    stop({ cleanup = true } = {}) {
        if (!this.#active) {
            return;
        }
        this.#active = false;
        this.#owner.remove(this);
        if (cleanup) {
            for (const element of [...this.#live.keys()]) {
                this.#drop(element);
            }
        }
        this.#live.clear();
    }

    #add(element) {
        const teardown = this.#call(this.#onAppear, element);
        this.#live.set(element, { teardown: typeof teardown === 'function' ? teardown : null, announced: true });
    }

    #drop(element) {
        const entry = this.#live.get(element);
        this.#live.delete(element);
        if (!entry.announced) {
            return;
        }
        if (entry.teardown) {
            this.#call(entry.teardown, element);
        }
        this.#call(this.#onDisappear, element);
    }

    #call(fn, element) {
        if (!fn) {
            return undefined;
        }
        try {
            return fn(element, this);
        } catch (error) {
            this.#report(error, element);
            return undefined;
        }
    }

    #report(error, element) {
        if (this.#onError) {
            try {
                this.#onError(error, element, this);
                return;
            } catch {
                // fall through to the default report
            }
        }
        // Never let one broken handler break the other watchers.
        console.error(`[selector-observer] "${this.#selector}"`, error);
    }
}
