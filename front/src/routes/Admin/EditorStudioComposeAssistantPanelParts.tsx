import styled from "@emotion/styled"

export const ComposeAssistantPanel = styled.div`
  display: grid;
  gap: 0.85rem;

  @media (min-width: 1180px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 1rem);
  }
`

export const ComposeAssistantGroup = styled.section`
  display: grid;
  gap: 0.72rem;
  padding: 0.9rem 0.95rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
`

export const ComposeAssistantGroupHeader = styled.div`
  display: grid;
  gap: 0.16rem;

  > div {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 760;
    line-height: 1.28;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

export const ComposeAssistantActionBar = styled.div`
  display: grid;
  gap: 0.56rem;

  > button {
    width: 100%;
  }
`

export const VisibilityOptionGrid = styled.div`
  display: grid;
  gap: 0.5rem;
`

export const VisibilityOptionButton = styled.button`
  display: grid;
  gap: 0.16rem;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    line-height: 1.45;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.blue6} inset;
  }
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
    background:
      radial-gradient(circle at top left, rgba(96, 165, 250, 0.08), transparent 48%),
      ${({ theme }) => theme.colors.gray3};
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

export const PreviewEditorGrid = styled.div`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 840px) {
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
    align-items: start;
  }
`

export const ComposeStatusBoard = styled.div`
  display: grid;
  gap: 0.56rem;
`

export const ComposeStatusRow = styled.div`
  display: grid;
  gap: 0.16rem;
  padding: 0.68rem 0.76rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.79rem;
    line-height: 1.48;
  }

  /* 패밀리룩(1222): 파스텔 상태 알림 면 → 헤어라인 보더 + 상태 텍스트 */
  &[data-tone="loading"] {
    border-color: ${({ theme }) => theme.colors.blue7};

    span {
      color: ${({ theme }) => theme.colors.blue11};
    }
  }

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green7};

    span {
      color: ${({ theme }) => theme.colors.green11};
    }
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red7};

    span {
      color: ${({ theme }) => theme.colors.red11};
    }
  }
`

export const PublishSettingsSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
`

export const SummaryPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 6px;
  padding: 0 0.48rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 600;
`

export const ComposeSidebarSummaryText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  line-height: 1.65;
  white-space: pre-line;
`

export const AssistantDisclosure = styled.details`
  margin-top: 0.68rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};
  padding-top: 0.68rem;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.72rem;
    list-style: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    line-height: 1.45;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
  }

  summary > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  .body {
    display: grid;
    gap: 0.62rem;
    margin-top: 0.72rem;
  }
`
