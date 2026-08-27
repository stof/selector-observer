# selector-observer

Tell it a CSS selector, and it tells you when a matching element **appears** in the page — including content
injected later by AJAX, a router, or a third-party widget — and when that element **disappears** again, so you
can undo whatever you did to it.

It is a thin, correctness-focused layer over the browser's `MutationObserver`. No polling, no dependencies,
~1 kB gzipped.

```js
import { observe } from 'selector-observer';

observe('.price-tag', (element) => {
    element.style.outline = '2px solid red';          // your customization
    return () => element.style.outline = '';          // undone when it disappears
});
```

## Install

```sh
npm install selector-observer
```

Or drop it in a page / userscript:

```html
<script src="https://unpkg.com/selector-observer"></script>
<script>
    SelectorObserver.observe('.card', el => { /* ... */ });
</script>
```

## How it works

A single `MutationObserver` per root watches `childList`, `attributes` and `subtree`. Any mutation schedules
one micro-task flush; on flush each watcher re-runs `root.querySelectorAll(selector)` and diffs the result
against the elements it is currently holding.

Diffing rather than inspecting individual mutation records is what makes **any** selector work. `.row:nth-child(2)`
can start matching because a *sibling* was removed, and `.parent.open .child` because an *ancestor's* class
changed — record-level matching misses both. A burst of DOM changes (a whole AJAX fragment) collapses into
one scan, so a fragment with 100 new nodes costs one `querySelectorAll`, not 100.

## API

### `observe(selector, onAppear, options?)` → `SelectorWatcher`
### `observe(selector, options)` → `SelectorWatcher`

`onAppear(element, watcher)` is called once for every element that starts matching. **If it returns a function,
that function is the undo step** for that element and runs when the element stops matching — the cleanest way
to keep appear/disappear paired without bookkeeping of your own.

| option | default | meaning |
| --- | --- | --- |
| `onAppear` | – | called with each element that starts matching; may return a teardown function |
| `onDisappear` | – | called with each element that stops matching, after its teardown ran |
| `onError` | `console.error` | called as `(error, element, watcher)` when one of your callbacks throws |
| `root` | `document` | where to query; accepts an `Element`, a `DocumentFragment` or a `ShadowRoot` |
| `initial` | `true` | report elements that already match. `false` adopts them silently — they will never be reported, appearing or disappearing |
| `signal` | – | an `AbortSignal`; aborting stops the watcher and runs the teardowns |

The returned watcher:

| member | meaning |
| --- | --- |
| `watcher.stop({ cleanup = true })` | stop watching. By default every element still matching is treated as disappearing, so your teardowns run and the page is left clean. `cleanup: false` leaves your changes in place |
| `watcher.scan()` | re-query now instead of waiting for the next mutation. Useful for state the DOM does not report (`:hover`, `:checked` via property, a selector depending on a canvas) |
| `watcher.adopt()` | record current matches without reporting them |
| `watcher.elements` | the elements currently reported as present, in document order |
| `watcher.active` | `false` once stopped |
| `watcher.selector` / `watcher.root` | what it was created with |

### `waitFor(selector, options?)` → `Promise<Element>`

Resolves with the first matching element, now or whenever it shows up. Accepts the same `root` and `signal`,
plus `timeout` in milliseconds. Rejects with an `AbortError` on timeout or abort.

```js
const dialog = await waitFor('#checkout-dialog', { timeout: 5000 });
```

### `new SelectorWatcher(root, selector, { onAppear, onDisappear, onError })`

The class behind `observe`, if you want to own the lifecycle yourself. It starts inert: call `scan()` or
`adopt()` to seed it.

## Behaviour worth knowing

- **Elements are identified by identity, not by selector match.** Remove an element and put the same node back
  and you get a fresh `appear` — which is what you want, since a re-inserted node may have lost your changes.
- **Disappear covers every way out**: the element removed, an ancestor removed, its class or attribute changed,
  a sibling change that breaks a positional selector, or `stop()`.
- **Teardown runs before `onDisappear`**, and both receive the element even though it may already be detached.
- **One throwing callback cannot break another watcher.** Errors go to `onError` (or `console.error`) and the
  scan continues.
- **Watchers on the same root share one `MutationObserver`**, created with the first watcher and disconnected
  when the last one stops.
- **Shadow DOM is not crossed automatically.** Pass `root: someShadowRoot` for a shadow tree — one watcher per
  root, by design.
- **Mutating the DOM from inside `onAppear` is safe.** It schedules another scan, and because the diff is
  idempotent it settles instead of looping. A callback that toggles its *own* selector on and off is a genuine
  infinite loop, though — that one is on you.
- **SSR-safe to import**: `document` is only touched when you call `observe`.

## Development

```sh
npm install
npm test      # node:test + jsdom
npm run build # dist/: esm, cjs, iife, minified iife, .d.ts
```

Open `example/index.html` after a build for a live playground.

## License

MIT
