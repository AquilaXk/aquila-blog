import styled from "@emotion/styled"

export {
  PublishDialog,
  PublishModalBackdrop,
  PublishModalBody,
  PublishModalFooter,
  PublishModalHeader,
} from "./EditorStudioPublishModalShellStyles"

export const PublishOverviewGrid = styled.div`
  display: grid;
  gap: 1rem;

  @media (min-width: 1080px) {
    grid-template-columns: minmax(520px, 1fr) minmax(240px, 288px);
    align-items: start;
  }
`

export const VisibilityCard = styled.section`
  display: grid;
  gap: 0.72rem;
  align-content: start;
  border-left: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  padding: 0.1rem 0 0.1rem 1rem;

  > strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.35;
  }

  @media (max-width: 1079px) {
    border-left: 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.9rem 0 0;
  }
`

export const SectionKicker = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
`

export const VisibilityOptionGrid = styled.div`
  display: grid;
  gap: 0.28rem;
`

export const VisibilityOptionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  min-height: 48px;
  padding: 0.5rem 0.58rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    flex: 0 0 auto;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    min-width: 0;
    font-size: 0.72rem;
    line-height: 1.35;
    text-align: right;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.gray3};
    box-shadow: 3px 0 0 ${({ theme }) => theme.colors.blue8} inset;
  }

  &:hover:not([data-active="true"]) {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
  }
`

export const FieldHelp = styled.span`
  display: block;
  width: 100%;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;

  @media (max-width: 720px) {
    display: none;
  }
`

export const PreviewResultPanel = styled.div`
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
`

export const PreviewResultHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  > div:first-of-type {
    display: grid;
    gap: 0.16rem;
    min-width: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  @media (max-width: 1079px) {
    flex-direction: column;
  }
`

export const PreviewViewportTabs = styled.div`
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 0.4rem;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 0.1rem;
`

export const PreviewViewportButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  padding: 0 0.78rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.gray5} inset;
  }

  &:hover:not([data-active="true"]) {
    border-color: ${({ theme }) => theme.colors.gray8};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

export const PreviewResultFrame = styled.div`
  width: 100%;
  margin: 0 auto;
`

export const PreviewVisibilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.34);
  background: rgba(20, 184, 166, 0.12);
  color: #99f6e4;
  padding: 0 0.56rem;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
`

export const PreviewResultCard = styled.article`
  overflow: hidden;
  width: 100%;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.22);

  .thumbnail {
    position: relative;
    aspect-ratio: 1.94 / 1;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.gray3};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  .thumbnail img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-content: center;
    gap: 0.28rem;
    padding: 1rem;
    text-align: center;
  }

  .thumbnail-placeholder em {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    font-style: normal;
    font-weight: 700;
  }

  .thumbnail-placeholder span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    line-height: 1.45;
  }

  .content {
    display: grid;
    gap: 0.72rem;
    padding: 1rem;
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 760;
    line-height: 1.33;
    letter-spacing: -0.015em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .summary {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
    min-height: calc(1.55em * 3);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta,
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    flex-wrap: wrap;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
  }

  .meta {
    padding-top: 0.05rem;
  }

  .meta .dot {
    opacity: 0.7;
  }

  .comment,
  .like,
  .author {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
  }

  .author {
    min-width: 0;
  }

  .author strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
  }

  .author .by {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 600;
  }

  .avatar {
    position: relative;
    flex: 0 0 1.85rem;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 999px;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.gray4};
    border: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .initial {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.72rem;
    font-weight: 800;
  }

  .like {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }
`

export const PostPreviewSetup = styled.section`
  display: grid;
  gap: 0.78rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0;
  background: transparent;
  padding: 0.95rem 0 0;
`

export const PostPreviewHeader = styled.div`
  display: grid;
  gap: 0.18rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

export const PreviewEditorGrid = styled.div`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 840px) {
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
    align-items: start;
  }
`

export const CompactPublishEditorStack = styled.div`
  display: grid;
  gap: 0.7rem;
`

export const CompactPublishEditorCard = styled.div`
  display: grid;
  gap: 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.72rem;
`

export const CompactPublishEditorToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;

  > div {
    display: grid;
    gap: 0.14rem;
    min-width: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-weight: 700;
  }
`

export const PublishModalNotice = styled.div`
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.83rem;
  line-height: 1.4;
  width: 100%;
  box-sizing: border-box;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
  }

  /* 패밀리룩(1222): 파스텔 상태 알림 면 → 헤어라인 보더 + 상태 텍스트 */
  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
  }

  @media (max-width: 720px) {
    width: 100%;
  }
`

export const PublishButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const PublishPrimaryButton = styled(PublishButton)`
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`
