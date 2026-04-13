export type HeaderAuthShellSnapshot = {
  authenticated: boolean
  admin: boolean
}

type HeaderAuthShellWindow = Window & {
  __AQ_HEADER_AUTH_SHELL__?: HeaderAuthShellSnapshot | null
}

export const HEADER_AUTH_SHELL_STORAGE_KEY = "header.auth-shell.v1"
export const HEADER_AUTH_SHELL_ATTR = "data-header-auth-shell"
export const HEADER_AUTH_ADMIN_ATTR = "data-header-auth-admin"

const normalizeHeaderAuthShellSnapshot = (
  value: Partial<HeaderAuthShellSnapshot> | null | undefined
): HeaderAuthShellSnapshot | null => {
  if (!value) return null
  if (typeof value.authenticated !== "boolean" || typeof value.admin !== "boolean") {
    return null
  }

  return {
    authenticated: value.authenticated,
    admin: value.admin,
  }
}

export const readHeaderAuthShellSnapshot = (): HeaderAuthShellSnapshot | null => {
  if (typeof window === "undefined") return null

  const bootstrappedSnapshot = normalizeHeaderAuthShellSnapshot(
    (window as HeaderAuthShellWindow).__AQ_HEADER_AUTH_SHELL__
  )
  if (bootstrappedSnapshot) return bootstrappedSnapshot

  try {
    const raw = window.sessionStorage.getItem(HEADER_AUTH_SHELL_STORAGE_KEY)
    if (!raw) return null
    return normalizeHeaderAuthShellSnapshot(JSON.parse(raw) as Partial<HeaderAuthShellSnapshot>)
  } catch {
    return null
  }
}

const applyHeaderAuthShellSnapshotToWindow = (snapshot: HeaderAuthShellSnapshot | null) => {
  if (typeof window === "undefined") return
  ;(window as HeaderAuthShellWindow).__AQ_HEADER_AUTH_SHELL__ = snapshot
}

export const applyHeaderAuthShellSnapshotToDocument = (snapshot: HeaderAuthShellSnapshot | null) => {
  if (typeof document === "undefined") return

  const shell = snapshot?.authenticated ? "authenticated" : "anonymous"
  const admin = snapshot?.authenticated && snapshot.admin ? "true" : "false"
  document.documentElement.setAttribute(HEADER_AUTH_SHELL_ATTR, shell)
  document.documentElement.setAttribute(HEADER_AUTH_ADMIN_ATTR, admin)
}

export const syncHeaderAuthShellSnapshot = (snapshot: HeaderAuthShellSnapshot | null) => {
  applyHeaderAuthShellSnapshotToWindow(snapshot)
  applyHeaderAuthShellSnapshotToDocument(snapshot)
}

export const persistHeaderAuthShellSnapshot = (snapshot: HeaderAuthShellSnapshot) => {
  syncHeaderAuthShellSnapshot(snapshot)

  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(HEADER_AUTH_SHELL_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // ignore storage failures
  }
}

export const HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT = `
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  var storageKey = "${HEADER_AUTH_SHELL_STORAGE_KEY}";
  var shellAttr = "${HEADER_AUTH_SHELL_ATTR}";
  var adminAttr = "${HEADER_AUTH_ADMIN_ATTR}";
  var normalize = function (value) {
    if (!value || typeof value.authenticated !== "boolean" || typeof value.admin !== "boolean") {
      return null;
    }
    return {
      authenticated: value.authenticated,
      admin: value.admin
    };
  };
  var apply = function (snapshot) {
    var normalized = normalize(snapshot);
    var shell = normalized && normalized.authenticated ? "authenticated" : "anonymous";
    var admin = normalized && normalized.authenticated && normalized.admin ? "true" : "false";
    document.documentElement.setAttribute(shellAttr, shell);
    document.documentElement.setAttribute(adminAttr, admin);
    window.__AQ_HEADER_AUTH_SHELL__ = normalized;
  };
  try {
    var raw = window.sessionStorage.getItem(storageKey);
    apply(raw ? JSON.parse(raw) : null);
  } catch (_) {
    apply(null);
  }
})();
`
