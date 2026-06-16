import { expect, test } from "@playwright/test"
import { parseMarkdownSegments } from "../src/libs/markdown/renderingSegmentModel"

test.describe("markdown custom card URL safety", () => {
  test("custom card directives strip unsafe URL fields before rendering", () => {
    const segments = parseMarkdownSegments(`<!-- aq-bookmark {"thumbnailUrl":"javascript:alert(1)"} -->
:::bookmark javascript:alert(document.domain)
Unsafe bookmark
description
:::

<!-- aq-embed {"embedUrl":"data:text/html,<script>alert(1)</script>","thumbnailUrl":"vbscript:msgbox(1)"} -->
:::embed https://example.com/watch
Safe embed
caption
:::

:::file javascript:alert(2)
payload.pdf
download
:::`)

    const bookmark = segments.find((segment) => segment.type === "bookmark")
    const embed = segments.find((segment) => segment.type === "embed")
    const file = segments.find((segment) => segment.type === "file")

    expect(bookmark).toMatchObject({ type: "bookmark", url: "" })
    expect(bookmark).not.toHaveProperty("thumbnailUrl")
    expect(embed).toMatchObject({ type: "embed", url: "https://example.com/watch" })
    expect(embed).not.toHaveProperty("embedUrl")
    expect(embed).not.toHaveProperty("thumbnailUrl")
    expect(file).toMatchObject({ type: "file", url: "" })
  })

  test("custom card directives keep http, https, and relative URLs", () => {
    const segments = parseMarkdownSegments(`<!-- aq-bookmark {"thumbnailUrl":"https://cdn.example.com/card.png"} -->
:::bookmark /posts/1
Internal bookmark
description
:::

<!-- aq-embed {"embedUrl":"https://www.youtube.com/embed/example"} -->
:::embed https://www.youtube.com/watch?v=example
Video
caption
:::

:::file ./files/spec.pdf
spec.pdf
download
:::`)

    const bookmark = segments.find((segment) => segment.type === "bookmark")
    const embed = segments.find((segment) => segment.type === "embed")
    const file = segments.find((segment) => segment.type === "file")

    expect(bookmark).toMatchObject({
      type: "bookmark",
      url: "/posts/1",
      thumbnailUrl: "https://cdn.example.com/card.png",
    })
    expect(embed).toMatchObject({
      type: "embed",
      url: "https://www.youtube.com/watch?v=example",
      embedUrl: "https://www.youtube.com/embed/example",
    })
    expect(file).toMatchObject({ type: "file", url: "./files/spec.pdf" })
  })
})
