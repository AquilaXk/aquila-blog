import styled from "@emotion/styled"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminPlainCard,
  AdminSectionTitleStack,
  AdminTextActionLink,
} from "src/routes/Admin/AdminSurfacePrimitives"

export const SectionHeader = styled(AdminSectionTitleStack)`
  h2 {
    font-size: 0.98rem;
  }
`

export const PrioritySection = styled(AdminPlainCard)`
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;

  @media (max-width: 720px) {
    gap: 8px;
    padding: 12px;
  }
`

export const ContextGrid = styled.section`
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

export const ContextSection = styled(AdminPlainCard)`
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 12px;
`

export const ContextLinkGrid = styled(AdminInfoList)`
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
`

export const ContextMonitoringLinkCard = styled(AdminInfoLinkCard)`
  min-height: 100%;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.94rem 0.98rem;

  .copy {
    gap: 0.22rem;
  }

  .copy strong {
    font-size: 1rem;
    line-height: 1.18;
    overflow-wrap: normal;
    word-break: keep-all;
  }

  .copy span {
    line-height: 1.38;
    overflow-wrap: normal;
    word-break: keep-all;
  }
`

export const AdditionalPanelsSection = styled(AdminPlainCard)`
  padding: 14px 16px;
  border-radius: 12px;
`

export const AdditionalPanelsDisclosure = styled.details`
  display: grid;
  gap: 14px;
`

export const AdditionalPanelsSummary = styled.summary`
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  div {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 820;
  }

  span,
  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }
`

export const AdditionalPanelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

export const PriorityTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 14px 10px;
    border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    text-align: left;
    vertical-align: middle;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  thead th {
    border-top: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 780;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  @media (max-width: 720px) {
    thead {
      display: none;
    }

    tbody,
    tr,
    td {
      display: block;
      width: 100%;
    }

    tr {
      padding: 12px 0;
      border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    }

    tbody tr:first-of-type {
      border-top: 0;
    }

    td {
      border-top: 0;
      padding: 6px 0;
    }
  }
`

export const PriorityCellCopy = styled.div`
  display: grid;
  gap: 2px;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 800;
  }
`

export const PrioritySummary = styled.div`
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0.32rem 0.72rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.78rem;
  font-weight: 760;
  line-height: 1.4;
  white-space: normal;

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    background: ${({ theme }) => theme.colors.orange2};
  }
`

export const PriorityLink = styled(AdminTextActionLink)`
  min-height: 30px;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.8rem;
  font-weight: 780;
`

export const InsightLink = styled(AdminTextActionLink)`
  font-size: 0.82rem;
  font-weight: 780;
`
