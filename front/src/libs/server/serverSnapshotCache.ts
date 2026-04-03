type SnapshotEntry = {
  value: unknown
  expiresAt: number
}

type SnapshotReadResult<T> = {
  value: T | null
  source: "snapshot" | "live"
}

const snapshotCache = new Map<string, SnapshotEntry>()
const inflightLoads = new Map<string, Promise<unknown>>()

const readSnapshot = <T>(key: string): T | null => {
  const entry = snapshotCache.get(key)
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    snapshotCache.delete(key)
    return null
  }

  return entry.value as T
}

const writeSnapshot = <T>(key: string, ttlMs: number, value: T | null) => {
  if (value === null) return
  snapshotCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(ttlMs, 0),
  })
}

export async function readServerSnapshot<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T | null>
): Promise<SnapshotReadResult<T>> {
  const cached = readSnapshot<T>(key)
  if (cached !== null) {
    return {
      value: cached,
      source: "snapshot",
    }
  }

  const pending = inflightLoads.get(key)
  if (pending) {
    const value = (await pending) as T | null
    return {
      value,
      source: value === null ? "live" : "snapshot",
    }
  }

  const loadPromise = loader()
  inflightLoads.set(key, loadPromise)

  try {
    const value = await loadPromise
    writeSnapshot(key, ttlMs, value)
    return {
      value,
      source: "live",
    }
  } finally {
    inflightLoads.delete(key)
  }
}
