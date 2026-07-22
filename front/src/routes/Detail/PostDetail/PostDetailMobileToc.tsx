import type { TocItem } from "./PostDetailTocModel"

type PostDetailMobileTocProps = {
  items: TocItem[]
  activeTocId: string
  onNavigate: (id: string) => void
}

const PostDetailMobileToc = ({ items, activeTocId, onNavigate }: PostDetailMobileTocProps) => {
  if (items.length === 0) return null

  return (
    <details className="mobileToc" aria-label="접이식 목차">
      <summary className="mobileTocSummary">목차</summary>
      <nav aria-label="목차">
        <ol className="mobileTocList">
          {items.map((item) => (
            <li key={item.id} data-level={item.level}>
              <button
                type="button"
                data-active={activeTocId === item.id}
                title={item.text}
                aria-label={item.text}
                onClick={() => onNavigate(item.id)}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  )
}

export default PostDetailMobileToc
