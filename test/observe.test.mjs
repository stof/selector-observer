import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDom, settle, el } from './setup.mjs';

const { observe, waitFor, SelectorWatcher } = await (async () => {
    freshDom();
    return import('../src/index.js');
})();

test('reports elements that already match', () => {
    freshDom('<body><div class="a"></div><div class="a"></div></body>');
    const seen = [];
    const watcher = observe('.a', (element) => seen.push(element));
    assert.equal(seen.length, 2);
    assert.deepEqual(watcher.elements, seen);
    watcher.stop();
});

test('initial: false skips existing elements', async () => {
    freshDom('<body><div class="a"></div></body>');
    const seen = [];
    const watcher = observe('.a', { initial: false, onAppear: (e) => seen.push(e) });
    assert.equal(seen.length, 0);

    document.body.append(el('div', { class: 'a' }));
    await settle();
    assert.equal(seen.length, 1, 'only the newly added element');
    watcher.stop();
});

test('notifies on append and on removal', async () => {
    freshDom();
    const events = [];
    const watcher = observe('.card', {
        onAppear: (e) => events.push(['appear', e.id]),
        onDisappear: (e) => events.push(['disappear', e.id]),
    });

    const card = el('div', { class: 'card', id: 'c1' });
    document.body.append(card);
    await settle();
    assert.deepEqual(events, [['appear', 'c1']]);

    card.remove();
    await settle();
    assert.deepEqual(events, [['appear', 'c1'], ['disappear', 'c1']]);
    watcher.stop();
});

test('an AJAX-style fragment insertion reports every element in one batch', async () => {
    freshDom('<body><div id="container"></div></body>');
    const seen = [];
    let scans = 0;
    const watcher = observe('#container .item', {
        onAppear: (e, w) => {
            seen.push(e.textContent);
            scans = w.elements.length;
        },
    });

    // What a fetch() + innerHTML render looks like to the observer.
    document.getElementById('container').innerHTML =
        '<ul><li class="item">a</li><li class="item">b</li><li class="item">c</li></ul>';
    await settle();
    assert.deepEqual(seen, ['a', 'b', 'c']);
    assert.equal(watcher.elements.length, 3);

    document.getElementById('container').innerHTML = '';
    await settle();
    assert.deepEqual(watcher.elements, [], 'replacing the fragment removes them all');
    watcher.stop();
});

test('removing an ancestor makes descendants disappear', async () => {
    freshDom('<body><section><div class="card"></div><div class="card"></div></section></body>');
    let gone = 0;
    const watcher = observe('.card', { onDisappear: () => gone++ });
    document.querySelector('section').remove();
    await settle();
    assert.equal(gone, 2);
    watcher.stop();
});

test('attribute changes toggle matching in both directions', async () => {
    freshDom('<body><div id="x"></div></body>');
    const events = [];
    const watcher = observe('.on', {
        onAppear: () => events.push('appear'),
        onDisappear: () => events.push('disappear'),
    });
    const node = document.getElementById('x');

    node.className = 'on';
    await settle();
    node.className = '';
    await settle();
    assert.deepEqual(events, ['appear', 'disappear']);
    watcher.stop();
});

test('selectors depending on siblings re-evaluate on unrelated mutations', async () => {
    freshDom('<body><ul><li class="row"></li></ul></body>');
    const events = [];
    const watcher = observe('.row:nth-child(2)', {
        onAppear: () => events.push('appear'),
        onDisappear: () => events.push('disappear'),
    });
    assert.deepEqual(events, []);

    const list = document.querySelector('ul');
    list.append(el('li', { class: 'row' }));
    await settle();
    assert.deepEqual(events, ['appear'], 'the second row now matches');

    list.firstElementChild.remove();
    await settle();
    assert.deepEqual(events, ['appear', 'disappear']);
    watcher.stop();
});

test('the function returned by onAppear undoes the customization', async () => {
    freshDom('<body><div class="card"></div></body>');
    const watcher = observe('.card', (element) => {
        element.dataset.styled = 'yes';
        return () => delete element.dataset.styled;
    });
    const card = document.querySelector('.card');
    assert.equal(card.dataset.styled, 'yes');

    card.classList.remove('card');
    await settle();
    assert.equal(card.dataset.styled, undefined);
    watcher.stop();
});

test('teardown runs before onDisappear', async () => {
    freshDom('<body><div class="card"></div></body>');
    const order = [];
    const watcher = observe('.card', {
        onAppear: () => () => order.push('teardown'),
        onDisappear: () => order.push('disappear'),
    });
    document.querySelector('.card').remove();
    await settle();
    assert.deepEqual(order, ['teardown', 'disappear']);
    watcher.stop();
});

test('an element is reported again when it comes back', async () => {
    freshDom('<body><div class="card"></div></body>');
    let appears = 0;
    const watcher = observe('.card', () => appears++);
    const card = document.querySelector('.card');

    card.remove();
    await settle();
    document.body.append(card);
    await settle();
    assert.equal(appears, 2);
    watcher.stop();
});

test('stop() undoes live customizations, stop({cleanup:false}) does not', async () => {
    freshDom('<body><div class="card"></div></body>');
    let undone = 0;
    const watcher = observe('.card', () => () => undone++);
    watcher.stop();
    assert.equal(undone, 1);
    assert.equal(watcher.active, false);
    assert.deepEqual(watcher.elements, []);

    freshDom('<body><div class="card"></div></body>');
    const kept = observe('.card', () => () => undone++);
    kept.stop({ cleanup: false });
    assert.equal(undone, 1);
});

test('a stopped watcher ignores later mutations', async () => {
    freshDom();
    let appears = 0;
    const watcher = observe('.card', () => appears++);
    watcher.stop();
    document.body.append(el('div', { class: 'card' }));
    await settle();
    assert.equal(appears, 0);
});

test('AbortSignal stops the watcher and undoes customizations', async () => {
    freshDom('<body><div class="card"></div></body>');
    const controller = new AbortController();
    let undone = 0;
    const watcher = observe('.card', () => () => undone++, { signal: controller.signal });
    controller.abort();
    assert.equal(undone, 1);
    assert.equal(watcher.active, false);
});

test('an already aborted signal never starts the watcher', () => {
    freshDom('<body><div class="card"></div></body>');
    let appears = 0;
    const watcher = observe('.card', () => appears++, { signal: AbortSignal.abort() });
    assert.equal(appears, 0);
    assert.equal(watcher.active, false);
});

test('watchers are independent and a throwing callback does not break others', async () => {
    freshDom();
    const errors = [];
    let otherSaw = 0;
    const bad = observe('.card', () => {
        throw new Error('boom');
    }, { onError: (error, element) => errors.push([error.message, element.id]) });
    const good = observe('.card', () => otherSaw++);

    document.body.append(el('div', { class: 'card', id: 'c1' }));
    await settle();
    assert.deepEqual(errors, [['boom', 'c1']]);
    assert.equal(otherSaw, 1);
    bad.stop();
    good.stop();
});

test('honours a custom root and ignores matches outside it', async () => {
    freshDom('<body><div id="scope"></div><div id="outside"></div></body>');
    const seen = [];
    const watcher = observe('.card', { root: document.getElementById('scope'), onAppear: (e) => seen.push(e.id) });

    document.getElementById('outside').append(el('div', { class: 'card', id: 'out' }));
    document.getElementById('scope').append(el('div', { class: 'card', id: 'in' }));
    await settle();
    assert.deepEqual(seen, ['in']);
    watcher.stop();
});

test('works inside a shadow root', async () => {
    freshDom('<body><div id="host"></div></body>');
    const shadow = document.getElementById('host').attachShadow({ mode: 'open' });
    const seen = [];
    const watcher = observe('.card', { root: shadow, onAppear: (e) => seen.push(e.className) });

    shadow.append(el('div', { class: 'card' }));
    await settle();
    assert.deepEqual(seen, ['card']);
    watcher.stop();
});

test('callbacks that mutate the DOM settle instead of looping', async () => {
    freshDom();
    let appears = 0;
    const watcher = observe('.card', (element) => {
        appears++;
        element.append(el('span'));
    });
    document.body.append(el('div', { class: 'card' }));
    await settle();
    assert.equal(appears, 1);
    watcher.stop();
});

test('scan() reports immediately instead of waiting for the microtask, without duplicating', async () => {
    freshDom();
    const seen = [];
    const watcher = observe('.card', (element) => seen.push(element));

    document.body.append(el('div', { class: 'card' }));
    watcher.scan();
    assert.equal(seen.length, 1, 'reported synchronously');
    await settle();
    assert.equal(seen.length, 1, 'the queued scan does not report it twice');
    watcher.stop();
});

test('adopt() silently takes ownership of what already matches', async () => {
    freshDom('<body><div class="card" id="old"></div></body>');
    const events = [];
    const watcher = observe('.card', {
        initial: false,
        onAppear: (e) => events.push(['appear', e.id]),
        onDisappear: (e) => events.push(['disappear', e.id]),
    });
    assert.deepEqual(watcher.elements, [], 'adopted elements are not managed');

    document.getElementById('old').remove();
    document.body.append(el('div', { class: 'card', id: 'new' }));
    await settle();
    assert.deepEqual(events, [['appear', 'new']], 'the adopted element leaves silently');
    watcher.stop();
});

test('an invalid selector throws right away', () => {
    freshDom();
    assert.throws(() => observe('::::', () => {}));
});

test('waitFor resolves with an element that appears later', async () => {
    freshDom();
    const pending = waitFor('.late');
    setTimeout(() => document.body.append(el('div', { class: 'late', id: 'l1' })), 5);
    const found = await pending;
    assert.equal(found.id, 'l1');
});

test('waitFor resolves synchronously-matching elements', async () => {
    freshDom('<body><div class="here" id="h1"></div></body>');
    const found = await waitFor('.here');
    assert.equal(found.id, 'h1');
});

test('waitFor rejects on timeout and on abort', async () => {
    freshDom();
    await assert.rejects(() => waitFor('.never', { timeout: 10 }), { name: 'AbortError' });

    const controller = new AbortController();
    const pending = waitFor('.never', { signal: controller.signal });
    controller.abort();
    await assert.rejects(() => pending, { name: 'AbortError' });

    await assert.rejects(() => waitFor('.never', { signal: AbortSignal.abort() }), { name: 'AbortError' });
});

test('SelectorWatcher can be used directly', async () => {
    freshDom();
    let appears = 0;
    const watcher = new SelectorWatcher(document, '.card', { onAppear: () => appears++ });
    document.body.append(el('div', { class: 'card' }));
    await settle();
    assert.equal(appears, 1);
    watcher.stop();
});
