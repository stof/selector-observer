/**
 * One MutationObserver per observed root, shared by every watcher on that root.
 *
 * Watchers do not react to individual mutation records: any mutation just marks
 * the root dirty and schedules a flush. On flush each watcher re-queries its
 * selector and diffs the result against the elements it currently holds. That is
 * what makes arbitrary selectors work -- `.a .b:nth-child(2)` can start or stop
 * matching because of a change several nodes away, which record-level matching
 * would miss.
 */

const roots = new WeakMap();

const MUTATION_INIT = {
    subtree: true,
    childList: true,
    attributes: true,
};

class RootObserver {

    constructor(root) {
        this.root = root;
        this.watchers = new Set();
        this.scheduled = false;
        this.flush = this.flush.bind(this);
        this.observer = new MutationObserver(() => this.schedule());
    }

    add(watcher) {
        const first = this.watchers.size === 0;
        this.watchers.add(watcher);
        if (first) {
            this.observer.observe(this.root, MUTATION_INIT);
        }
    }

    remove(watcher) {
        this.watchers.delete(watcher);
        if (this.watchers.size === 0) {
            this.observer.disconnect();
            roots.delete(this.root);
        }
    }

    schedule() {
        if (this.scheduled || this.watchers.size === 0) {
            return;
        }
        this.scheduled = true;
        queueMicrotask(this.flush);
    }

    flush() {
        this.scheduled = false;
        // Copy: a callback may stop its own watcher, or start a new one.
        for (const watcher of [...this.watchers]) {
            if (this.watchers.has(watcher)) {
                watcher.scan();
            }
        }
    }
}

export function rootObserverFor(root) {
    let rootObserver = roots.get(root);
    if (!rootObserver) {
        rootObserver = new RootObserver(root);
        roots.set(root, rootObserver);
    }
    return rootObserver;
}
