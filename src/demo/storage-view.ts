// What the SDK holds in this browser for this host, by name and size, for the Identity tab: its
// cookies and `localStorage` keys, every one of which docs/storage-declaration.md of the SDK lists
// (Web Privacy 5). Values are not shown; the chunks are long and the ids are the SDK's to send.

export interface StoredItem {
  readonly where: 'cookie' | 'localStorage';
  readonly name: string;
  readonly size: number;
}

const SDK_PREFIXES = ['rubicon.', 'rubicon_', '__rubicon_'];

export function sdkStorage(): StoredItem[] {
  const items: StoredItem[] = [];
  try {
    for (const part of document.cookie.split(';')) {
      const index = part.indexOf('=');
      const name = (index < 0 ? part : part.slice(0, index)).trim();
      if (isSdk(name)) items.push({ where: 'cookie', name, size: part.trim().length });
    }
  } catch {
    // A sandboxed frame has no cookies.
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name !== null && isSdk(name)) {
        items.push({ where: 'localStorage', name, size: (localStorage.getItem(name) ?? '').length });
      }
    }
  } catch {
    // Blocked storage.
  }
  return items.sort((a, b) => a.where.localeCompare(b.where) || a.name.localeCompare(b.name));
}

function isSdk(name: string): boolean {
  return SDK_PREFIXES.some((p) => name.startsWith(p));
}
