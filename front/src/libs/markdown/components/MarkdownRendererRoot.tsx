import styled from "@emotion/styled"
import { markdownContentTypography } from "src/libs/markdown/contentTypography"
import { markdownRendererRootBaseStyles } from "src/libs/markdown/components/MarkdownRendererRootBaseStyles"
import { markdownRendererRootCardStyles } from "src/libs/markdown/components/MarkdownRendererRootCardStyles"
import { markdownRendererRootCodeStyles } from "src/libs/markdown/components/MarkdownRendererRootCodeStyles"
import { markdownRendererRootMermaidStyles } from "src/libs/markdown/components/MarkdownRendererRootMermaidStyles"
import { markdownRendererRootTableToggleStyles } from "src/libs/markdown/components/MarkdownRendererRootTableToggleStyles"
import { markdownRendererRootCalloutStyles } from "src/libs/markdown/components/MarkdownRendererRootCalloutStyles"

const MarkdownRendererRoot = styled.div`
  margin-top: 1.65rem;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: visible;
  overflow-wrap: anywhere;
  word-break: break-word;
  ${({ theme }) => markdownContentTypography("&", theme)}
  ${({ theme }) => markdownRendererRootBaseStyles(theme)}
  ${({ theme }) => markdownRendererRootCardStyles(theme)}
  ${({ theme }) => markdownRendererRootCodeStyles(theme)}
  ${({ theme }) => markdownRendererRootMermaidStyles(theme)}
  ${({ theme }) => markdownRendererRootTableToggleStyles(theme)}
  ${({ theme }) => markdownRendererRootCalloutStyles(theme)}
`

export default MarkdownRendererRoot
