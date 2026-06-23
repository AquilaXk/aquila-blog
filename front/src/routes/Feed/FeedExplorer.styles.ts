import styled from "@emotion/styled"
const FEED_POST_COLUMN_MAX_WIDTH_REM = 100

export const ExplorerCard = styled.section`
  --feed-post-column-max-width: ${FEED_POST_COLUMN_MAX_WIDTH_REM}rem;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 0;
  min-width: 0;
  min-height: 0;
  height: auto;
  overflow: visible;
  margin: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.gray12};
  padding-bottom: 18px;

  .feedTitle {
    min-width: 0;
    display: grid;
    gap: 0;
  }

  .feedTitle span {
    color: ${({ theme }) => theme.publicDesign.accent};
    font-size: 0.6875rem;
    line-height: 1.2;
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .feedTitle h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    margin: 4px 0 0;
    font-size: 28px;
    line-height: 1.2;
    letter-spacing: -0.04em;
    font-weight: 820;
  }

  .feedDescription {
    margin: 8px 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    max-width: 560px;
    font-size: 0.875rem;
    line-height: 1.55;
  }

  .searchSlot {
    min-width: 0;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .sortSelect {
    height: 36px;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 10px;
    border-radius: ${({ theme }) => theme.variables.ui.button.radius}px;
    font-size: 0.8125rem;
    font-weight: 650;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: start;
    gap: 20px;
    padding-bottom: 18px;

    .searchSlot {
      width: 100%;
    }
  }
`

export const FeedBody = styled.section`
  --feed-post-column-max-width: ${FEED_POST_COLUMN_MAX_WIDTH_REM}rem;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 48px;
  min-width: 0;
  overflow: visible;
  padding: 54px 0 86px;

  .tagColumn {
    min-width: 0;
    display: block;
  }

  .postColumn {
    min-width: 0;
    width: 100%;
  }

  @media (max-width: 1200px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }

  @media (max-width: 768px) {
    padding: 34px 0 60px;
  }
`

export const FilterContextBar = styled.div`
  min-height: 1.8rem;
  margin: 12px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: ${({ theme }) => theme.colors.gray10};

  .contextMain {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.38rem;
  }

  .contextActions {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    flex: 0 0 auto;
  }

  .contextCount {
    font-size: 0.88rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 740;
    letter-spacing: -0.015em;
  }

  .filterSummary {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    line-height: 1.35;
    font-weight: 600;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .statusBadge {
    display: none;
    align-items: center;
    gap: 0.28rem;
    min-height: 1.7rem;
    padding: 0 0.58rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: ${({ theme }) => theme.publicDesign.operationSurfaceElevated};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .resetButton {
    flex: 0 0 auto;
    min-height: 1.7rem;
    padding: 0 0.52rem;
    border-radius: 4px;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.125s ease-in, color 0.125s ease-in, background-color 0.125s ease-in;

    &:hover {
      border-color: ${({ theme }) => theme.publicDesign.accent};
      background: ${({ theme }) => theme.publicDesign.accentMuted};
      color: ${({ theme }) => theme.colors.gray12};
    }
  }

  @media (max-width: 768px) {
    margin-top: 0.5rem;
    margin-bottom: 0;

    .contextCount {
      font-size: 0.84rem;
    }

    .filterSummary {
      font-size: 0.71rem;
      max-width: 100%;
    }

    .statusBadge {
      max-width: 100%;
      white-space: normal;
      line-height: 1.35;
    }
  }
`
