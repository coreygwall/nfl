import type { Player } from "../../shared/types.ts";

const KEY = "nflpool.players.v1";
const LEGACY_KEY = "nflpool.player.v1";

/** A name this device can pick as, and the token that proves it. */
export interface Identity extends Player {
  /** Absent on devices that signed in before tokens existed, or when only the cookie holds it. */
  token?: string;
  /** True when the commissioner put this person on this device (a parent picking for the family). */
  managed?: boolean;
}

interface Store {
  activeId: string | null;
  people: Identity[];
}

const EMPTY: Store = { activeId: null, people: [] };

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Store>;
      const people = Array.isArray(s.people) ? s.people.filter(isIdentity) : [];
      return { activeId: typeof s.activeId === "string" ? s.activeId : (people[0]?.id ?? null), people };
    }
    // One identity per device was the old shape; carry it over.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const p = JSON.parse(legacy) as Partial<Identity>;
      if (isIdentity(p)) return { activeId: p.id, people: [p] };
    }
  } catch {
    /* private mode, corrupt JSON */
  }
  return EMPTY;
}

function isIdentity(p: unknown): p is Identity {
  const v = p as Partial<Identity> | null;
  return !!v && typeof v.id === "string" && typeof v.name === "string";
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode etc. */
  }
}

export const loadStore = read;

/** Who this device is picking as right now. The API client reads this on every request. */
export function loadPlayer(): Identity | null {
  const { activeId, people } = read();
  return people.find((p) => p.id === activeId) ?? people[0] ?? null;
}

/** Adds or refreshes an identity and makes it the active one. */
export function savePlayer(p: Identity): Store {
  const { people } = read();
  const next = [...people.filter((x) => x.id !== p.id), { ...people.find((x) => x.id === p.id), ...p }];
  const store = { activeId: p.id, people: next };
  write(store);
  return store;
}

export function setActivePlayer(id: string): Store {
  const { people } = read();
  const store = { activeId: people.some((p) => p.id === id) ? id : (people[0]?.id ?? null), people };
  write(store);
  return store;
}

/** Signs this device out of one name, or all of them. */
export function clearPlayer(id?: string): Store {
  const { activeId, people } = read();
  if (!id) {
    write(EMPTY);
    return EMPTY;
  }
  const left = people.filter((p) => p.id !== id);
  const store = { activeId: activeId === id ? (left[0]?.id ?? null) : activeId, people: left };
  write(store);
  return store;
}
