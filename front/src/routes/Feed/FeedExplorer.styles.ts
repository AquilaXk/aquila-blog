import styled from "@emotion/styled"
import { FEED_TAG_RAIL_DESKTOP_MIN_PX, FEED_TAG_RAIL_WIDTH_PX } from "./feedUiTokens"

const FEED_TAG_RAIL_GAP_PX = 32
const FEED_POST_COLUMN_MAX_WIDTH_REM = 52

export const ExplorerCard = styled.section`
  --feed-tag-rail-width: ${FEED_TAG_RAIL_WIDTH_PX}px;
  --feed-tag-rail-gap: ${FEED_TAG_RAIL_GAP_PX}px;
  --feed-post-column-max-width: ${FEED_POST_COLUMN_MAX_WIDTH_REM}rem;
  display: grid;
  gap: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  height: auto;
  overflow: visible;
  margin-bottom: 0.52rem;

  .searchSlot {
    min-width: 0;
    width: min(100%, var(--feed-post-column-max-width));
    margin-inline: auto;
  }

  @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
    grid-template-columns: var(--feed-tag-rail-width) minmax(0, var(--feed-post-column-max-width));
    column-gap: var(--feed-tag-rail-gap);
    justify-content: center;
    align-items: start;

    .searchSlot {
      width: 100%;
      margin-inline: 0;
      grid-column: 2;
    }
  }

  @media (max-width: 768px) {
    margin-bottom: 0.38rem;
  }
`

export const FeedBody = styled.section`
  --feed-tag-rail-width: ${FEED_TAG_RAIL_WIDTH_PX}px;
  --feed-tag-rail-gap: ${FEED_TAG_RAIL_GAP_PX}px;
  --feed-post-column-max-width: ${FEED_POST_COLUMN_MAX_WIDTH_REM}rem;
  min-width: 0;
  overflow: visible;

  .tagColumn {
    min-width: 0;
    display: block;
  }

  .postColumn {
    min-width: 0;
    width: min(100%, var(--feed-post-column-max-width));
    margin-inline: auto;
  }

  @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
    display: grid;
    grid-template-columns: var(--feed-tag-rail-width) minmax(0, var(--feed-post-column-max-width));
    column-gap: var(--feed-tag-rail-gap);
    justify-content: center;
    align-items: start;

    .tagColumn {
      min-width: 0;
    }

    .postColumn {
      width: 100%;
      margin-inline: 0;
    }
  }
`

export const FilterContextBar = styled.div`
  min-height: 1.8rem;
  margin: 0.04rem 0 0.16rem;
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
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 740;
    letter-spacing: -0.015em;
  }

  .filterSummary {
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.74rem;
    line-height: 1.35;
    font-weight: 600;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .statusBadge {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-height: 1.7rem;
    padding: 0 0.58rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .resetButton {
    flex: 0 0 auto;
    min-height: 1.7rem;
    padding: 0 0.52rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.125s ease-in, color 0.125s ease-in, background-color 0.125s ease-in;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray12};
    }
  }

  @media (max-width: 768px) {
    margin-top: 0.14rem;
    margin-bottom: 0.18rem;

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
