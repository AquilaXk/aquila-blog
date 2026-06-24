import Link from "next/link"
import type {
  AdminHubContentItem,
  AdminHubMetricItem,
  AdminHubPrimaryAction,
  AdminHubRecentWorkItem,
  AdminHubStatusItem,
} from "./AdminHubSurface"
import {
  ActivityList,
  ContentList,
  ContentRow,
  EmptyPanel,
  HeroActions,
  HeroCopy,
  HeroHeader,
  HeroHeading,
  HeroKicker,
  LandingLayout,
  Main,
  MetricCard,
  MetricGrid,
  Panel,
  PanelDots,
  PanelHeader,
  SecondaryActionLink,
  StatusList,
  StatusRow,
} from "./AdminHubSurface.styles"

type AdminHubSurfaceSectionsProps = {
  displayName: string
  recentWorkSummary: string
  primaryAction: AdminHubPrimaryAction
  metrics: AdminHubMetricItem[]
  contentItems: AdminHubContentItem[]
  serviceStatusItems: AdminHubStatusItem[]
  activityItems: AdminHubRecentWorkItem[]
}

export const AdminHubSurfaceSections = ({
  displayName,
  recentWorkSummary,
  primaryAction,
  metrics,
  contentItems,
  serviceStatusItems,
  activityItems,
}: AdminHubSurfaceSectionsProps) => (
  <Main>
    <HeroHeader>
      <HeroCopy>
        <HeroKicker>WORKSPACE</HeroKicker>
        <HeroHeading>좋은 아침이에요, {displayName}.</HeroHeading>
        <p>{recentWorkSummary}</p>
      </HeroCopy>
      <HeroActions>
        <Link href={primaryAction.secondaryHref} passHref legacyBehavior>
          <SecondaryActionLink>글 전체 보기 →</SecondaryActionLink>
        </Link>
      </HeroActions>
    </HeroHeader>

    <MetricGrid aria-label="관리자 핵심 지표">
      {metrics.map((item) => (
        <MetricCard key={item.label} data-tone={item.tone || "neutral"}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </MetricCard>
      ))}
    </MetricGrid>

    <LandingLayout>
      <Panel>
        <PanelHeader>
          <h2>최근 콘텐츠</h2>
          <PanelDots aria-hidden="true">•••</PanelDots>
        </PanelHeader>
        {contentItems.length > 0 ? (
          <ContentList aria-label="최근 콘텐츠">
            {contentItems.map((item) => (
              <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                <ContentRow data-tone={item.tone || "neutral"}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.meta}</span>
                  </div>
                  <small>{item.status}</small>
                </ContentRow>
              </Link>
            ))}
          </ContentList>
        ) : (
          <EmptyPanel>표시할 최근 콘텐츠가 없습니다.</EmptyPanel>
        )}
      </Panel>

      <aside>
        <Panel>
          <PanelHeader>
            <h2>서비스 상태</h2>
          </PanelHeader>
          <StatusList aria-label="서비스 상태">
            {serviceStatusItems.map((item) => (
              <StatusRow key={`${item.label}-${item.value}`} data-kind="service" data-tone={item.tone || "neutral"}>
                <span>
                  <i aria-hidden="true" />
                  <b>{item.label}</b>
                </span>
                <strong>{item.value}</strong>
              </StatusRow>
            ))}
          </StatusList>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2>최근 활동</h2>
          </PanelHeader>
          <ActivityList aria-label="최근 활동">
            {activityItems.map((item) => (
              <StatusRow key={`${item.label}-${item.value}`} data-kind="activity" data-tone={item.tone || "neutral"}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </StatusRow>
            ))}
          </ActivityList>
        </Panel>
      </aside>
    </LandingLayout>
  </Main>
)
