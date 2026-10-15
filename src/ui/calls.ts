// A demo action: runs the SDK call, notes it on the Logs tab and shows it in the status line, as
// the Android demo's Calls.run. The SDK never throws (Web Public API 4); a throw here is the demo's
// own and is shown as such.
import type { Journal } from '../demo/journal';

type Listener = () => void;

let status = '';
const listeners = new Set<Listener>();

export const statusLine = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): string {
    return status;
  },
};

export function announce(text: string): void {
  status = text;
  for (const listener of listeners) listener();
}

export function run(journal: Journal, label: string, block: () => void): void {
  try {
    block();
    journal.note(label);
    announce(label);
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    journal.note(`${label}: the demo's code threw ${name}`);
    announce(`${label}: threw ${name} (the demo's own code; the SDK never throws)`);
  }
}
