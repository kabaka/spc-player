import '@testing-library/jest-dom/vitest';

// jsdom may not fully implement localStorage; provide a minimal stub if needed.
if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.getItem !== 'function'
) {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage;
}

// jsdom does not implement window.matchMedia; provide a minimal stub.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      addListener: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      removeListener: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      addEventListener: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
