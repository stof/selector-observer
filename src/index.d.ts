export type Teardown = () => void;

export type AppearCallback = (element: Element, watcher: SelectorWatcher) => void | Teardown;
export type DisappearCallback = (element: Element, watcher: SelectorWatcher) => void;
export type ErrorCallback = (error: unknown, element: Element, watcher: SelectorWatcher) => void;

export type ObserveRoot = Document | DocumentFragment | Element;

export interface ObserveOptions {
    /** Called with each element that starts matching. Return a function to undo it later. */
    onAppear?: AppearCallback;
    /** Called with each element that stops matching, after its teardown ran. */
    onDisappear?: DisappearCallback;
    /** Called when a callback throws. Defaults to `console.error`. */
    onError?: ErrorCallback;
    /** Where to query. Defaults to `document`. A `ShadowRoot` works too. */
    root?: ObserveRoot;
    /** Report already-matching elements immediately. Defaults to `true`. */
    initial?: boolean;
    /** Aborting stops the watcher (running teardowns). */
    signal?: AbortSignal;
}

export interface StopOptions {
    /** Run teardown/onDisappear for elements still matching. Defaults to `true`. */
    cleanup?: boolean;
}

export declare class SelectorWatcher {
    constructor(root: ObserveRoot, selector: string, options?: Omit<ObserveOptions, 'root' | 'initial' | 'signal'>);
    readonly selector: string;
    readonly root: ObserveRoot;
    readonly active: boolean;
    readonly elements: Element[];
    scan(): void;
    adopt(): void;
    stop(options?: StopOptions): void;
}

export declare function observe(selector: string, handler?: AppearCallback, options?: ObserveOptions): SelectorWatcher;
export declare function observe(selector: string, options?: ObserveOptions): SelectorWatcher;

export interface WaitForOptions extends Omit<ObserveOptions, 'onAppear' | 'onDisappear'> {
    /** Reject with an `AbortError` after this many milliseconds. */
    timeout?: number;
}

export declare function waitFor(selector: string, options?: WaitForOptions): Promise<Element>;

declare const _default: {
    observe: typeof observe;
    waitFor: typeof waitFor;
    SelectorWatcher: typeof SelectorWatcher;
};
export default _default;
