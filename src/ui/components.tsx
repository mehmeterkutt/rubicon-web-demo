// The demo's few building blocks, the counterparts of the Android demo's Components.kt.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export function SectionCard(props: { title: string; subtitle?: string; children?: ReactNode; testId?: string }) {
  return (
    <section className="card" data-testid={props.testId}>
      <h2>{props.title}</h2>
      {props.subtitle ? <p className="subtitle">{props.subtitle}</p> : null}
      <div className="card-body">{props.children}</div>
    </section>
  );
}

/** What should happen, under a button or a group. */
export function Expect(props: { children: ReactNode }) {
  return <p className="expect">{props.children}</p>;
}

export function Flow(props: { children: ReactNode }) {
  return <div className="flow">{props.children}</div>;
}

export function Btn(props: {
  children: ReactNode;
  onClick: () => void;
  kind?: 'primary' | 'tonal' | 'outline';
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${props.kind ?? 'outline'}`}
      onClick={props.onClick}
      data-testid={props.testId}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  supporting?: string;
  testId?: string;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.multiline ? (
        <textarea
          value={props.value}
          rows={3}
          spellCheck={false}
          onChange={(e) => {
            props.onChange(e.target.value);
          }}
          data-testid={props.testId}
        />
      ) : (
        <input
          value={props.value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            props.onChange(e.target.value);
          }}
          data-testid={props.testId}
        />
      )}
      {props.supporting ? <span className="field-supporting">{props.supporting}</span> : null}
    </label>
  );
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  supporting?: string;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => {
          props.onChange(e.target.checked);
        }}
      />
      <span>
        <span className="toggle-label">{props.label}</span>
        {props.supporting ? <span className="field-supporting">{props.supporting}</span> : null}
      </span>
    </label>
  );
}

export function Chips<T>(props: {
  options: readonly T[];
  selected: T;
  label: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  return (
    <div className="chips">
      {props.options.map((option) => (
        <button
          type="button"
          key={props.label(option)}
          className={option === props.selected ? 'chip chip-on' : 'chip'}
          onClick={() => {
            props.onSelect(option);
          }}
        >
          {props.label(option)}
        </button>
      ))}
    </div>
  );
}

export function MultiChips<T>(props: {
  options: readonly T[];
  selected: readonly T[];
  label: (option: T) => string;
  onChange: (selected: T[]) => void;
}) {
  return (
    <div className="chips">
      {props.options.map((option) => {
        const on = props.selected.includes(option);
        return (
          <button
            type="button"
            key={props.label(option)}
            className={on ? 'chip chip-on' : 'chip'}
            onClick={() => {
              props.onChange(on ? props.selected.filter((o) => o !== option) : [...props.selected, option]);
            }}
          >
            {props.label(option)}
          </button>
        );
      })}
    </div>
  );
}

export function KeyValue(props: { k: string; v: ReactNode; testId?: string }) {
  return (
    <div className="kv">
      <span className="kv-key">{props.k}</span>
      <span className="kv-value" data-testid={props.testId}>
        {props.v}
      </span>
    </div>
  );
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

export function Pill(props: { text: string; tone: Tone; testId?: string }) {
  return (
    <span className={`pill pill-${props.tone}`} data-testid={props.testId}>
      {props.text}
    </span>
  );
}

export function Mono(props: { children: ReactNode; testId?: string }) {
  return (
    <pre className="mono" data-testid={props.testId}>
      {props.children}
    </pre>
  );
}

/** Reads `read()` now and every `ms`, for the SDK's getters, which have no change event. */
export function usePoll<T>(read: () => T, ms = 500): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => {
      setValue(read());
    }, ms);
    return () => {
      clearInterval(timer);
    };
  }, [read, ms]);
  return value;
}

export interface Store<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
