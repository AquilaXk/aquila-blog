export const FEED_EXPLORER_RESTORE_KEY_PREFIX = "feed:explorer:state:v2"
export const FEED_EXPLORER_SNAPSHOT_SUFFIX = ":snapshot"

export const clearFeedExplorerRestoreCache = () => {
  if (typeof window === "undefined") return

  const keysToRemove: string[] = []
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index)
    if (!key) continue
    if (!key.startsWith(FEED_EXPLORER_RESTORE_KEY_PREFIX)) continue
    keysToRemove.push(key)
  }

  keysToRemove.forEach((key) => {
    window.sessionStorage.removeItem(key)
  })
}
