export type TocItem = {
  id: string
  text: string
  level: 2 | 3 | 4
}

const TOC_SELECTOR = ".aq-markdown h2, .aq-markdown h3, .aq-markdown h4"

const normalizeHeadingText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u200B/g, "")
    .trim()

const toHeadingSlug = (value: string): string => {
  const normalized = value.trim().toLowerCase()
  const stripped = normalized.replace(/[^\p{L}\p{N}\s-]/gu, "")
  const dashed = stripped.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "")
  return dashed || "section"
}

export const collectTocFromArticle = (article: HTMLElement): TocItem[] => {
  const headings = Array.from(article.querySelectorAll<HTMLElement>(TOC_SELECTOR))
  if (!headings.length) return []

  const slugCounts = new Map<string, number>()
  const toc: TocItem[] = []

  headings.forEach((heading) => {
    const text = normalizeHeadingText(heading.textContent || "")
    if (!text) return

    const level = Number(heading.tagName.replace("H", "")) as TocItem["level"]
    if (![2, 3, 4].includes(level)) return

    const existingId = heading.id?.trim()
    let id = existingId
    if (!id) {
      const base = toHeadingSlug(text)
      const count = slugCounts.get(base) ?? 0
      slugCounts.set(base, count + 1)
      id = count === 0 ? base : `${base}-${count + 1}`
      heading.id = id
    } else {
      const count = slugCounts.get(existingId) ?? 0
      slugCounts.set(existingId, count + 1)
      if (count > 0) {
        id = `${existingId}-${count + 1}`
        heading.id = id
      }
    }

    toc.push({ id, text, level })
  })

  return toc
}

export const isSameToc = (left: TocItem[], right: TocItem[]) =>
  left.length === right.length &&
  left.every((item, index) => {
    const target = right[index]
    return target && item.id === target.id && item.text === target.text && item.level === target.level
  })

export const createRafScheduler = (callback: () => void) => {
  let rafId: number | null = null

  const schedule = () => {
    if (rafId !== null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      callback()
    })
  }

  const cancel = () => {
    if (rafId === null) return
    window.cancelAnimationFrame(rafId)
    rafId = null
  }

  return { schedule, cancel }
}

export const createObserverRegistry = () => {
  const cleanups: Array<() => void> = []

  const add = (cleanup: () => void) => {
    cleanups.push(cleanup)
  }

  const addWindowEvent = (
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ) => {
    window.addEventListener(type, handler, options)
    add(() => window.removeEventListener(type, handler, options))
  }

  const addIntersectionObserver = (
    targets: HTMLElement[],
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) => {
    if (!targets.length || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(callback, options)
    targets.forEach((target) => observer.observe(target))
    add(() => observer.disconnect())
  }

  const addResizeObserver = (targets: HTMLElement[], callback: ResizeObserverCallback) => {
    if (!targets.length || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(callback)
    targets.forEach((target) => observer.observe(target))
    add(() => observer.disconnect())
  }

  const cleanup = () => {
    for (const clear of cleanups.splice(0, cleanups.length)) {
      clear()
    }
  }

  return {
    add,
    addWindowEvent,
    addIntersectionObserver,
    addResizeObserver,
    cleanup,
  }
}
