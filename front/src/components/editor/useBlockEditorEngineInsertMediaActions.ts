import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback } from "react"
import type { ChangeEvent, MutableRefObject } from "react"
import { inferCardKindFromUrl, inferLinkProvider, resolveEmbedPreviewUrl } from "src/libs/unfurl/extractMeta"
import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"
import {
  createBookmarkNode,
  createEmbedNode,
  createFileBlockNode,
  type BlockEditorDoc,
} from "./serialization"

type UseBlockEditorEngineInsertMediaActionsArgs = {
  editor: TiptapEditor | null
  insertBlocksAtCursor: (blocks: BlockEditorDoc[], replaceCurrentEmptyParagraph?: boolean) => void
  insertBlocksAtIndex: (
    insertionIndex: number,
    blocks: NonNullable<BlockEditorDoc["content"]>,
    focusIndex?: number
  ) => void
  insertDocContent: (doc: BlockEditorDoc, replaceCurrentEmptyParagraph?: boolean) => boolean
  isSelectionInEmptyParagraph: () => boolean
  onUploadFile: BlockEditorEngineProps["onUploadFile"]
  onUploadImage: BlockEditorEngineProps["onUploadImage"]
  pendingAttachmentInsertIndexRef: MutableRefObject<number | null>
  pendingImageInsertIndexRef: MutableRefObject<number | null>
}

export const useBlockEditorEngineInsertMediaActions = ({
  editor,
  insertBlocksAtCursor,
  insertBlocksAtIndex,
  insertDocContent,
  isSelectionInEmptyParagraph,
  onUploadFile,
  onUploadImage,
  pendingAttachmentInsertIndexRef,
  pendingImageInsertIndexRef,
}: UseBlockEditorEngineInsertMediaActionsArgs) => {
  const isHttpUrl = useCallback((value: string) => {
    try {
      const parsed = new URL(value.trim())
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }, [])

  const fetchUnfurlMetadata = useCallback(async (url: string) => {
    try {
      const response = await fetch(`/api/editor/unfurl?url=${encodeURIComponent(url)}`)
      const payload = await response.json()
      if (!response.ok || !payload?.ok || !payload?.data) return null
      return payload.data as {
        title?: string
        description?: string
        siteName?: string
        provider?: string
        thumbnailUrl?: string
        embedUrl?: string
      }
    } catch {
      return null
    }
  }, [])

  const createCardNodeFromUrl = useCallback(
    async (url: string) => {
      const trimmedUrl = url.trim()
      const cardKind = inferCardKindFromUrl(trimmedUrl)
      const metadata = await fetchUnfurlMetadata(trimmedUrl)
      const fallbackProvider = inferLinkProvider(trimmedUrl)
      const fallbackTitle = (() => {
        try {
          const parsed = new URL(trimmedUrl)
          const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || ""
          return decodeURIComponent(lastSegment || parsed.hostname.replace(/^www\./i, "")) || trimmedUrl
        } catch {
          return trimmedUrl
        }
      })()

      if (cardKind === "file") {
        return createFileBlockNode({
          url: trimmedUrl,
          name: String(metadata?.title || fallbackTitle || "첨부 파일").trim(),
          description: String(metadata?.description || "").trim(),
        })
      }

      if (cardKind === "embed") {
        return createEmbedNode({
          url: trimmedUrl,
          title: String(metadata?.title || fallbackProvider || "임베드").trim(),
          caption: String(metadata?.description || "").trim(),
          siteName: String(metadata?.siteName || "").trim(),
          provider: String(metadata?.provider || fallbackProvider || "").trim(),
          thumbnailUrl: String(metadata?.thumbnailUrl || "").trim(),
          embedUrl: String(metadata?.embedUrl || resolveEmbedPreviewUrl(trimmedUrl) || "").trim(),
        })
      }

      return createBookmarkNode({
        url: trimmedUrl,
        title: String(metadata?.title || fallbackTitle || trimmedUrl).trim(),
        description: String(metadata?.description || "").trim(),
        siteName: String(metadata?.siteName || "").trim(),
        provider: String(metadata?.provider || fallbackProvider || "").trim(),
        thumbnailUrl: String(metadata?.thumbnailUrl || "").trim(),
      })
    },
    [fetchUnfurlMetadata]
  )

  const insertCardBlockFromUrl = useCallback(
    async (url: string) => {
      const nextNode = await createCardNodeFromUrl(url)
      return insertDocContent(
        {
          type: "doc",
          content: [nextNode, { type: "paragraph" }],
        },
        isSelectionInEmptyParagraph()
      )
    },
    [createCardNodeFromUrl, insertDocContent, isSelectionInEmptyParagraph]
  )

  const handleImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor) return

    const imageAttrs = await onUploadImage(file)
    const pendingInsertIndex = pendingImageInsertIndexRef.current
    pendingImageInsertIndexRef.current = null
    const imageBlocks: NonNullable<BlockEditorDoc["content"]> = [
      {
        type: "resizableImage",
        attrs: {
          src: imageAttrs.src,
          alt: imageAttrs.alt || "",
          title: imageAttrs.title || "",
          widthPx: imageAttrs.widthPx ?? null,
          align: imageAttrs.align || "center",
        },
      },
      { type: "paragraph" },
    ]

    if (typeof pendingInsertIndex === "number") {
      insertBlocksAtIndex(pendingInsertIndex, imageBlocks)
      return
    }

    editor.chain().focus().insertContent(imageBlocks).run()
  }

  const handleAttachmentInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor || !onUploadFile) return

    const fileAttrs = await onUploadFile(file)
    const pendingInsertIndex = pendingAttachmentInsertIndexRef.current
    pendingAttachmentInsertIndexRef.current = null

    if (typeof pendingInsertIndex === "number") {
      insertBlocksAtIndex(pendingInsertIndex, [createFileBlockNode(fileAttrs), { type: "paragraph" }])
      return
    }

    insertBlocksAtCursor([createFileBlockNode(fileAttrs)], true)
  }

  return {
    createCardNodeFromUrl,
    handleAttachmentInputChange,
    handleImageInputChange,
    insertCardBlockFromUrl,
    isHttpUrl,
  }
}
