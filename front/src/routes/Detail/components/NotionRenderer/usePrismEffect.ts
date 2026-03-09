import { RefObject, useEffect } from "react"
import { ExtendedRecordMap } from "notion-types"

type PrismLike = {
  highlightAllUnder: (container: Element) => void
}

let prismLoader: Promise<PrismLike> | null = null

const loadPrism = async () => {
  if (!prismLoader) {
    prismLoader = (async () => {
      const prismModule = await import("prismjs")
      await Promise.all([
        import("prismjs/components/prism-markup-templating.js"),
        import("prismjs/components/prism-markup.js"),
        import("prismjs/components/prism-bash.js"),
        import("prismjs/components/prism-c.js"),
        import("prismjs/components/prism-cpp.js"),
        import("prismjs/components/prism-csharp.js"),
        import("prismjs/components/prism-docker.js"),
        import("prismjs/components/prism-java.js"),
        import("prismjs/components/prism-js-templates.js"),
        import("prismjs/components/prism-coffeescript.js"),
        import("prismjs/components/prism-diff.js"),
        import("prismjs/components/prism-git.js"),
        import("prismjs/components/prism-go.js"),
        import("prismjs/components/prism-kotlin.js"),
        import("prismjs/components/prism-graphql.js"),
        import("prismjs/components/prism-handlebars.js"),
        import("prismjs/components/prism-less.js"),
        import("prismjs/components/prism-makefile.js"),
        import("prismjs/components/prism-markdown.js"),
        import("prismjs/components/prism-objectivec.js"),
        import("prismjs/components/prism-ocaml.js"),
        import("prismjs/components/prism-python.js"),
        import("prismjs/components/prism-reason.js"),
        import("prismjs/components/prism-rust.js"),
        import("prismjs/components/prism-sass.js"),
        import("prismjs/components/prism-scss.js"),
        import("prismjs/components/prism-solidity.js"),
        import("prismjs/components/prism-sql.js"),
        import("prismjs/components/prism-stylus.js"),
        import("prismjs/components/prism-swift.js"),
        import("prismjs/components/prism-wasm.js"),
        import("prismjs/components/prism-yaml.js"),
      ])
      return prismModule.default as PrismLike
    })()
  }
  return prismLoader
}

const usePrismEffect = (
  rootRef: RefObject<HTMLElement>,
  recordMap: ExtendedRecordMap
) => {
  useEffect(() => {
    let disposed = false
    const root = rootRef.current
    if (!root) return

    loadPrism()
      .then((Prism) => {
        if (disposed) return
        Prism.highlightAllUnder(root)
      })
      .catch((error) => console.warn(error))

    return () => {
      disposed = true
    }
  }, [recordMap, rootRef])
}

export default usePrismEffect
