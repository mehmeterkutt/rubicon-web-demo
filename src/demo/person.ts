// What this host's pages told the SDK about the user: the SDK has no getter for the user id or the
// super properties (Public API 8), so the demo keeps its own record of its calls, as the Android
// demo does. It is per host (`localStorage` `demo.person`), as the SDK's super properties are; the
// user id travels across subdomains in the SDK's cookie, which the Identity tab shows through the
// last queued event instead.
export interface Person {
  readonly userId: string | null;
  readonly superProperties: Readonly<Record<string, string>>;
}

const KEY = 'demo.person';
const ANONYMOUS: Person = { userId: null, superProperties: {} };

type Listener = () => void;

export class PersonRecord {
  private person: Person = load();
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Person => this.person;

  identified(userId: string): void {
    // Another id while identified starts a new user: the SDK clears the super properties (Identity 3).
    this.set(
      this.person.userId !== null && this.person.userId !== userId
        ? { userId, superProperties: {} }
        : { ...this.person, userId },
    );
  }

  registered(key: string, value: unknown): void {
    this.set({ ...this.person, superProperties: { ...this.person.superProperties, [key]: describe(value) } });
  }

  unregistered(key: string): void {
    const rest = { ...this.person.superProperties };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- a record keyed by the developer's names.
    delete rest[key];
    this.set({ ...this.person, superProperties: rest });
  }

  cleared(): void {
    this.set(ANONYMOUS);
  }

  private set(person: Person): void {
    this.person = person;
    try {
      localStorage.setItem(KEY, JSON.stringify(person));
    } catch {
      // Blocked storage: the record lives for this page only.
    }
    for (const listener of this.listeners) listener();
  }
}

function load(): Person {
  try {
    const text = localStorage.getItem(KEY);
    if (text === null) return ANONYMOUS;
    const saved = JSON.parse(text) as Record<string, unknown>;
    const props = saved['superProperties'];
    return {
      userId: typeof saved['userId'] === 'string' ? saved['userId'] : null,
      superProperties:
        typeof props === 'object' && props !== null ? (props as Record<string, string>) : ANONYMOUS.superProperties,
    };
  } catch {
    return ANONYMOUS;
  }
}

function describe(value: unknown): string {
  try {
    // JSON.stringify gives undefined for a function or undefined, whatever its declared type says.
    const text = JSON.stringify(value) as string | undefined;
    return text ?? typeof value;
  } catch {
    return typeof value;
  }
}
