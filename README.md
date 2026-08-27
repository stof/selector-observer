# selector-observer

Tell it a CSS selector, and it tells you when a matching element **appears** in the page — including content
injected later by AJAX, a router, or a third-party widget — and when that element **disappears** again, so you
can undo whatever you did to it.

It is a thin, correctness-focused layer over the browser's `MutationObserver`. No polling, no dependencies,
~1 kB gzipped.

```js
import { observe } from '@hurelhuyag/selector-observer';

observe('.price-tag', (element) => {
    element.style.outline = '2px solid red';          // your customization
    return () => element.style.outline = '';          // undone when it disappears
});
```

## Install

```sh
npm install @hurelhuyag/selector-observer
```

Or drop it in a page / userscript:

```html
<script src="https://unpkg.com/@hurelhuyag/selector-observer"></script>
<script>
    SelectorObserver.observe('.card', el => { /* ... */ });
</script>
```

## Example: SlimSelect that survives AJAX

[SlimSelect](https://slimselectjs.com/) is constructed per `<select>` element and has to be destroyed when that
element goes away — it builds its own markup beside the original and registers document-level listeners. The
usual `document.querySelectorAll('select.fancy').forEach(...)` at page load therefore enhances what exists *at
that moment* and nothing more: a select arriving in a modal, an htmx swap or a page of search results stays a
plain dropdown, and every select removed afterwards leaves its instance behind.

That is an appear/disappear pair, which is exactly what this library reports:

```js
import { observe } from '@hurelhuyag/selector-observer';
import SlimSelect from 'slim-select';
import 'slim-select/styles';

observe('select.fancy', (select) => {
    const slim = new SlimSelect({ select });
    return () => slim.destroy();          // runs when that select leaves the DOM
});
```

One call, once, at startup. Every `select.fancy` — already on the page or arriving an hour from now — is
enhanced exactly once, and every one that is removed gets `destroy()`d, so SlimSelect's wrapper and listeners go
with it instead of accumulating.

The element is right there, so per-element configuration needs no registry or `data-` protocol of its own:

```js
observe('select.fancy', (select) => {
    const slim = new SlimSelect({
        select,
        settings: {
            showSearch: select.options.length > 8,
            placeholderText: select.dataset.placeholder ?? 'Select',
            closeOnSelect: !select.multiple,
        },
    });
    return () => slim.destroy();
});
```

In a userscript or a plain page, the same thing with both libraries from a CDN:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/slim-select@4/dist/slimselect.css">
<script src="https://cdn.jsdelivr.net/npm/slim-select@4/dist/slimselect.iife.js"></script>
<script src="https://unpkg.com/@hurelhuyag/selector-observer@0.1.0"></script>
<script>
    SelectorObserver.observe('select.fancy', (select) => {
        const slim = new SlimSelect({ select });
        return () => slim.destroy();
    });
</script>
```

Worth knowing for this pairing:

- **SlimSelect's own DOM insertions trigger a scan.** The nodes it adds do not match `select.fancy` and the diff
  is idempotent, so the scan settles immediately — no loop, no second instance on the same element.
- **The original `<select>` stays in the DOM** — SlimSelect hides it with inline positioning, `tabindex="-1"`
  and `aria-hidden`, not by removing it — so it keeps matching, and the teardown fires at the right moment:
  when the real select goes, the instance goes.
- **Do not put visibility or `style` in the selector.** `select.fancy:not([style])` would stop matching the
  moment SlimSelect writes its inline style, which reads as a disappearance and destroys the instance that was
  just created.
- **Frameworks that recycle nodes** (Turbo's cache, some virtual-DOM diffs) may reinsert the same select. It
  arrives as a fresh appearance and gets a fresh instance, which is correct — the old wrapper did not come back
  with it.

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
