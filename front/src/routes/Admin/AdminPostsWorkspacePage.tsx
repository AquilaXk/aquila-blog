import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { useCallback, useEffect, useRef, useState } from "react"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { apiFetch } from "src/apis/backend/client"
import useAuthSession from "src/hooks/useAuthSession"
import { pushRoute } from "src/libs/router"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import { isServerTempDraftPost } from "./editorTempDraft"

type PostListScope = "active" | "deleted"

type AdminPostListItem = {
  id: number
  title: string
  authorName: string
  published: boolean
  listed: boolean
  tempDraft?: boolean
  createdAt: string
  modifiedAt: string
  deletedAt?: string
}

type PageDto<T> = {
  content: T[]
  pageable?: {
    pageNumber?: number
    pageSize?: number
    totalElements?: number
    totalPages?: number
  }
}

type PostWriteResult = {
  id: number
}

type LocalDraftPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  tags: string[]
  category: string
  visibility: "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"
  savedAt: string
}

type LocalDraftSummary = {
  title: string
  summary: string
  savedAt: string
  tagCount: number
  visibility: LocalDraftPayload["visibility"]
}

type ListSort = "CREATED_AT" | "CREATED_AT_ASC"

type ListState = {
  rows: AdminPostListItem[]
  total: number
  loadedAt: string
}

const LOCAL_DRAFT_STORAGE_KEY = "admin.editor.localDraft.v1"
const EDITOR_NEW_ROUTE_PATH = "/editor/new"
const DEFAULT_PAGE = "1"
const DEFAULT_PAGE_SIZE = "20"
const DEFAULT_SORT: ListSort = "CREATED_AT"

const toEditorRoute = (query?: Record<string, string>) => {
  if (query?.postId) {
    return `/editor/${encodeURIComponent(query.postId)}`
  }

  const search = query ? new URLSearchParams(query).toString() : ""
  return search ? `${EDITOR_NEW_ROUTE_PATH}?${search}` : EDITOR_NEW_ROUTE_PATH
}

const sanitizeNumberInput = (value: string, fallback: string) => {
  const digits = value.replace(/[^0-9]/g, "")
  return digits.length > 0 ? digits : fallback
}

const readLocalDraft = (): LocalDraftSummary | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraftPayload>
    if (!parsed || typeof parsed !== "object") return null

    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const content = typeof parsed.content === "string" ? parsed.content.trim() : ""
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : ""
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : []
    const visibility =
      parsed.visibility === "PRIVATE" || parsed.visibility === "PUBLIC_UNLISTED" || parsed.visibility === "PUBLIC_LISTED"
        ? parsed.visibility
        : "PUBLIC_LISTED"

    if (!title && !summary && !content) return null

    return {
      title: title || "제목 없는 임시저장",
      summary: summary || content.slice(0, 120),
      savedAt,
      tagCount: tags.length,
      visibility,
    }
  } catch {
    return null
  }
}

const formatDateTime = (value?: string) => {
  if (!value) return "-"
  return value.slice(0, 16).replace("T", " ")
}

const toVisibility = (published: boolean, listed: boolean) => {
  if (!published) return "PRIVATE" as const
  if (listed) return "PUBLIC_LISTED" as const
  return "PUBLIC_UNLISTED" as const
}

const visibilityLabel = (published: boolean, listed: boolean) => {
  const visibility = toVisibility(published, listed)
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "상세 공개"
  return "전체 공개"
}

const isWorkspaceTempDraft = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isServerTempDraftPost(row)

const getWorkspaceRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isWorkspaceTempDraft(row) ? "임시 저장" : row.title

const visibilityLabelFromValue = (visibility: LocalDraftPayload["visibility"]) => {
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "상세 공개"
  return "전체 공개"
}

const buildListEndpoint = (scope: PostListScope, options: { page: string; pageSize: string; kw: string; sort: ListSort }) => {
  const query = new URLSearchParams({
    page: options.page,
    pageSize: options.pageSize,
    kw: options.kw,
  })

  const endpoint = scope === "deleted" ? "/post/api/v1/adm/posts/deleted" : "/post/api/v1/adm/posts"
  if (scope === "active") {
    query.set("sort", options.sort)
  }

  return `${endpoint}?${query.toString()}`
}

export const getAdminPostsWorkspacePageProps: GetServerSideProps<AdminPageProps> = async (context) => {
  return await getAdminPageProps(context.req)
}

export const AdminPostWorkspacePage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" ? initialMember : me || initialMember

  const [localDraft, setLocalDraft] = useState<LocalDraftSummary | null>(null)
  const [recentPosts, setRecentPosts] = useState<AdminPostListItem[]>([])
  const [isRecentLoading, setIsRecentLoading] = useState(true)
  const [recentError, setRecentError] = useState("")

  const [listScope, setListScope] = useState<PostListScope>("active")
  const [listKw, setListKw] = useState("")
  const [listPage, setListPage] = useState(DEFAULT_PAGE)
  const [listPageSize, setListPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [listSort, setListSort] = useState<ListSort>(DEFAULT_SORT)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [listState, setListState] = useState<ListState>({ rows: [], total: 0, loadedAt: "" })
  const [isListLoading, setIsListLoading] = useState(true)
  const [listError, setListError] = useState("")
  const [actionNotice, setActionNotice] = useState("")

  const continueSectionRef = useRef<HTMLDivElement | null>(null)
  const listSectionRef = useRef<HTMLElement | null>(null)
  const listRequestIdRef = useRef(0)
  const recentRequestIdRef = useRef(0)

  const loadRecentPosts = useCallback(async () => {
    const requestId = recentRequestIdRef.current + 1
    recentRequestIdRef.current = requestId
    setIsRecentLoading(true)
    setRecentError("")

    try {
      const data = await apiFetch<PageDto<AdminPostListItem>>(buildListEndpoint("active", {
        page: "1",
        pageSize: "8",
        kw: "",
        sort: DEFAULT_SORT,
      }))

      if (recentRequestIdRef.current !== requestId) return

      const rows = [...(data.content || [])]
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .slice(0, 5)
      setRecentPosts(rows)
    } catch (error) {
      if (recentRequestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setRecentError(`최근 글을 불러오지 못했습니다: ${message}`)
      setRecentPosts([])
    } finally {
      if (recentRequestIdRef.current === requestId) {
        setIsRecentLoading(false)
      }
    }
  }, [])

  const loadList = useCallback(async () => {
    const requestId = listRequestIdRef.current + 1
    listRequestIdRef.current = requestId
    setIsListLoading(true)
    setListError("")

    try {
      const data = await apiFetch<PageDto<AdminPostListItem>>(
        buildListEndpoint(listScope, {
          page: sanitizeNumberInput(listPage, DEFAULT_PAGE),
          pageSize: sanitizeNumberInput(listPageSize, DEFAULT_PAGE_SIZE),
          kw: listKw.trim(),
          sort: listSort,
        })
      )

      if (listRequestIdRef.current !== requestId) return

      setListState({
        rows: data.content || [],
        total: data.pageable?.totalElements ?? data.content?.length ?? 0,
        loadedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (listRequestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setListError(`글 목록을 불러오지 못했습니다: ${message}`)
      setListState({ rows: [], total: 0, loadedAt: "" })
    } finally {
      if (listRequestIdRef.current === requestId) {
        setIsListLoading(false)
      }
    }
  }, [listKw, listPage, listPageSize, listScope, listSort])

  useEffect(() => {
    setLocalDraft(readLocalDraft())
    void loadRecentPosts()
  }, [loadRecentPosts])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList()
    }, 140)
    return () => window.clearTimeout(timer)
  }, [loadList])

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.surface !== "manage") return
    const timer = window.setTimeout(() => {
      listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [router.isReady, router.query.surface])

  const openWriteRoute = useCallback(
    async (query?: Record<string, string>) => {
      await pushRoute(router, toEditorRoute(query))
    },
    [router]
  )

  const handleDeletePost = useCallback(
    async (row: AdminPostListItem) => {
      const confirmed = window.confirm(`정말 \"${row.title}\" 글을 삭제할까요?`)
      if (!confirmed) return

      try {
        setActionNotice(`#${row.id} 글을 삭제하는 중입니다...`)
        await apiFetch(`/post/api/v1/posts/${row.id}`, { method: "DELETE" })
        await invalidatePublicPostReadCaches(queryClient, row.id)
        setActionNotice(`#${row.id} 글을 삭제했습니다.`)
        await Promise.all([loadList(), loadRecentPosts()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setActionNotice(`삭제 실패: ${message}`)
      }
    },
    [loadList, loadRecentPosts, queryClient]
  )

  const handleRestorePost = useCallback(
    async (row: AdminPostListItem) => {
      try {
        setActionNotice(`#${row.id} 글을 복구하는 중입니다...`)
        await apiFetch<PostWriteResult>(`/post/api/v1/adm/posts/${row.id}/restore`, { method: "POST" })
        await invalidatePublicPostReadCaches(queryClient, row.id)
        setActionNotice(`#${row.id} 글을 복구했습니다.`)
        await Promise.all([loadList(), loadRecentPosts()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setActionNotice(`복구 실패: ${message}`)
      }
    },
    [loadList, loadRecentPosts, queryClient]
  )

  const handleHardDeletePost = useCallback(
    async (row: AdminPostListItem) => {
      const confirmed = window.confirm(`#${row.id} 글을 영구삭제할까요?\n영구삭제 후에는 복구할 수 없습니다.`)
      if (!confirmed) return

      try {
        setActionNotice(`#${row.id} 글을 영구삭제하는 중입니다...`)
        await apiFetch(`/post/api/v1/adm/posts/${row.id}/hard`, { method: "DELETE" })
        await invalidatePublicPostReadCaches(queryClient, row.id)
        setActionNotice(`#${row.id} 글을 영구삭제했습니다.`)
        await Promise.all([loadList(), loadRecentPosts()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setActionNotice(`영구삭제 실패: ${message}`)
      }
    },
    [loadList, loadRecentPosts, queryClient]
  )

  const handleContinueRecent = useCallback(
    async (row: AdminPostListItem) => {
      await openWriteRoute({ postId: String(row.id) })
    },
    [openWriteRoute]
  )

  const renderRecentEdited = () => {
    if (isRecentLoading) {
      return (
        <RecentListSkeleton aria-hidden="true">
          <span />
          <span />
          <span />
        </RecentListSkeleton>
      )
    }

    if (recentError) {
      return <MutedText>{recentError}</MutedText>
    }

    if (recentPosts.length === 0) {
      return <MutedText>이어 쓸 원고 없음</MutedText>
    }

    return (
      <RecentPostList>
        {recentPosts.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => void handleContinueRecent(row)}>
              <div>
                <strong>{getWorkspaceRowTitle(row)}</strong>
                <span>{formatDateTime(row.modifiedAt)}</span>
              </div>
              <RecentMeta>
                <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                  {visibilityLabel(row.published, row.listed)}
                </VisibilityBadge>
                <span>이어서 쓰기</span>
              </RecentMeta>
            </button>
          </li>
        ))}
      </RecentPostList>
    )
  }

  const hasAnyResumeTarget = Boolean(localDraft) || recentPosts.length > 0
  const shouldRenderResumeGrid = isRecentLoading || Boolean(recentError) || hasAnyResumeTarget

  if (!sessionMember) return null

  return (
    <Main>
      <PageHeader>
        <ContextLine aria-label="현재 위치" />
      </PageHeader>

      <HeroSection>
        <HeroLabel>지금 할 일</HeroLabel>
        <HeroLayout>
          <HeroCopy>
            <h1>글 작성</h1>
          </HeroCopy>
          <HeroActions>
            <PrimaryCta type="button" onClick={() => void openWriteRoute()}>
              새 글 작성
            </PrimaryCta>
            <SecondaryLinkButton
              type="button"
              onClick={() => continueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              최근 작업 이어쓰기
            </SecondaryLinkButton>
            <SecondaryLinkButton
              type="button"
              onClick={() => listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              글 관리
            </SecondaryLinkButton>
          </HeroActions>
        </HeroLayout>
      </HeroSection>

      <ResumeSection ref={continueSectionRef}>
        <SectionHeading>
          <div>
            <h2>이어서 쓰기</h2>
          </div>
        </SectionHeading>
        {shouldRenderResumeGrid ? (
          <ResumeGrid>
            <ResumeCard data-emphasis={localDraft ? "strong" : "soft"}>
              <ResumeHeader>
                <strong>브라우저 임시저장</strong>
                {localDraft?.savedAt ? <span>{formatDateTime(localDraft.savedAt)}</span> : null}
              </ResumeHeader>
              {localDraft ? (
                <>
                  <ResumeTitle>{localDraft.title}</ResumeTitle>
                  <ResumeDescription>{localDraft.summary || "저장된 본문을 이어서 쓸 수 있습니다."}</ResumeDescription>
                  <ResumeMeta>
                    <VisibilityBadge data-tone={localDraft.visibility}>
                      {visibilityLabelFromValue(localDraft.visibility)}
                    </VisibilityBadge>
                    <span>{localDraft.tagCount > 0 ? `태그 ${localDraft.tagCount}개` : "태그 없음"}</span>
                  </ResumeMeta>
                  <ActionRow>
                    <PrimaryInlineButton type="button" onClick={() => void openWriteRoute({ source: "local-draft" })}>
                      이어서 쓰기
                    </PrimaryInlineButton>
                  </ActionRow>
                </>
              ) : (
                <EmptyInlineState>
                  <strong>저장된 임시 저장 없음</strong>
                </EmptyInlineState>
              )}
            </ResumeCard>

            <ResumeCard data-emphasis="soft">
              <ResumeHeader>
                <strong>최근 수정한 글</strong>
                {isRecentLoading ? <span>불러오는 중</span> : null}
              </ResumeHeader>
              {renderRecentEdited()}
            </ResumeCard>
          </ResumeGrid>
        ) : (
          <WorkspaceEmpty>
            <strong>이어 쓸 원고 없음</strong>
            <PrimaryInlineButton type="button" onClick={() => void openWriteRoute()}>
              새 글 작성
            </PrimaryInlineButton>
          </WorkspaceEmpty>
        )}
      </ResumeSection>

      <ListSection ref={listSectionRef}>
        <SectionHeading>
          <div>
            <h2>글 목록</h2>
          </div>
          <ListMeta>
            <GhostButton type="button" onClick={() => void Promise.all([loadList(), loadRecentPosts()])}>
              새로고침
            </GhostButton>
          </ListMeta>
        </SectionHeading>

        <FilterRail>
          <ScopeTabs role="tablist" aria-label="글 범위 선택">
            <ScopeTabButton type="button" data-active={listScope === "active"} onClick={() => setListScope("active")}>
              활성 글
            </ScopeTabButton>
            <ScopeTabButton type="button" data-active={listScope === "deleted"} onClick={() => setListScope("deleted")}>
              삭제 글
            </ScopeTabButton>
          </ScopeTabs>
          <SearchField>
            <label htmlFor="workspace-post-search">검색어</label>
            <input
              id="workspace-post-search"
              placeholder={listScope === "active" ? "제목이나 본문 검색" : "삭제된 글 검색"}
              value={listKw}
              onChange={(event) => {
                setListPage(DEFAULT_PAGE)
                setListKw(event.target.value)
              }}
            />
          </SearchField>
        </FilterRail>

        <AdvancedDisclosure open={isAdvancedOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault()
              setIsAdvancedOpen((prev) => !prev)
            }}
          >
            <strong>고급 검색</strong>
            <span>{isAdvancedOpen ? "닫기" : "열기"}</span>
          </summary>
          {isAdvancedOpen && (
            <div className="body">
              <AdvancedGrid>
                <FieldBox>
                  <label htmlFor="workspace-page">페이지</label>
                  <input
                    id="workspace-page"
                    type="number"
                    min={1}
                    value={listPage}
                    onChange={(event) => setListPage(sanitizeNumberInput(event.target.value, DEFAULT_PAGE))}
                  />
                </FieldBox>
                <FieldBox>
                  <label htmlFor="workspace-page-size">페이지 크기</label>
                  <input
                    id="workspace-page-size"
                    type="number"
                    min={1}
                    max={30}
                    value={listPageSize}
                    onChange={(event) => setListPageSize(sanitizeNumberInput(event.target.value, DEFAULT_PAGE_SIZE))}
                  />
                </FieldBox>
                {listScope === "active" && (
                  <FieldBox>
                    <label htmlFor="workspace-sort">정렬</label>
                    <select
                      id="workspace-sort"
                      value={listSort}
                      onChange={(event) => setListSort(event.target.value as ListSort)}
                    >
                      <option value="CREATED_AT">최신순</option>
                      <option value="CREATED_AT_ASC">오래된순</option>
                    </select>
                  </FieldBox>
                )}
              </AdvancedGrid>
            </div>
          )}
        </AdvancedDisclosure>

        {actionNotice ? <InlineNotice>{actionNotice}</InlineNotice> : null}

        {isListLoading ? (
          <ListSkeleton aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </ListSkeleton>
        ) : listError ? (
          <ListEmptyState>
            <strong>목록을 불러오지 못했습니다.</strong>
            <p>{listError}</p>
            <ActionRow>
              <PrimaryInlineButton type="button" onClick={() => void loadList()}>
                다시 시도
              </PrimaryInlineButton>
            </ActionRow>
          </ListEmptyState>
        ) : listState.rows.length === 0 ? (
          <ListEmptyState>
            <strong>{listScope === "active" ? "아직 글이 없습니다." : "삭제된 글이 없습니다."}</strong>
            <p>
              {listScope === "active"
                ? "바로 새 글을 시작하거나, 검색 조건을 조정해 다른 결과를 확인하세요."
                : "복구할 글이 없다면 활성 글 범위로 돌아가 새 작업을 시작하세요."}
            </p>
            <ActionRow>
              <PrimaryInlineButton type="button" onClick={() => void openWriteRoute()}>
                새 글 작성
              </PrimaryInlineButton>
              {listKw.trim() ? (
                <GhostButton
                  type="button"
                  onClick={() => {
                    setListKw("")
                    setListPage(DEFAULT_PAGE)
                  }}
                >
                  검색 초기화
                </GhostButton>
              ) : null}
            </ActionRow>
          </ListEmptyState>
        ) : (
          <ListCard>
            <DesktopListTable>
              <thead>
                <tr>
                  <th className="idCell">ID</th>
                  <th>제목</th>
                  <th className="dateCell">{listScope === "active" ? "수정일" : "삭제일"}</th>
                  <th className="actionCell">작업</th>
                </tr>
              </thead>
              <tbody>
                {listState.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="idCell">#{row.id}</td>
                    <td>
                      <TitleCell>
                        <div className="titleRow">
                          <strong>{getWorkspaceRowTitle(row)}</strong>
                          <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                            {visibilityLabel(row.published, row.listed)}
                          </VisibilityBadge>
                        </div>
                        <span>{row.authorName || "작성자 미상"}</span>
                      </TitleCell>
                    </td>
                    <td className="dateCell">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</td>
                    <td className="actionCell">
                      <RowActions>
                        {listScope === "active" ? (
                          <>
                            <RowPrimaryButton type="button" onClick={() => void handleContinueRecent(row)}>
                              수정
                            </RowPrimaryButton>
                            <DangerTextButton type="button" onClick={() => void handleDeletePost(row)}>
                              삭제
                            </DangerTextButton>
                          </>
                        ) : (
                          <>
                            <RowPrimaryButton type="button" onClick={() => void handleRestorePost(row)}>
                              복구
                            </RowPrimaryButton>
                            <DangerTextButton type="button" onClick={() => void handleHardDeletePost(row)}>
                              영구삭제
                            </DangerTextButton>
                          </>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DesktopListTable>

            <MobileCardList>
              {listState.rows.map((row) => (
                <article key={`mobile-${row.id}`}>
                  <header>
                    <span className="id">#{row.id}</span>
                    <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                      {visibilityLabel(row.published, row.listed)}
                    </VisibilityBadge>
                  </header>
                  <strong>{getWorkspaceRowTitle(row)}</strong>
                  <p>{row.authorName || "작성자 미상"}</p>
                  <span className="date">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</span>
                  <div className="actions">
                    {listScope === "active" ? (
                      <>
                        <RowPrimaryButton type="button" onClick={() => void handleContinueRecent(row)}>
                          수정
                        </RowPrimaryButton>
                        <DangerTextButton type="button" onClick={() => void handleDeletePost(row)}>
                          삭제
                        </DangerTextButton>
                      </>
                    ) : (
                      <>
                        <RowPrimaryButton type="button" onClick={() => void handleRestorePost(row)}>
                          복구
                        </RowPrimaryButton>
                        <DangerTextButton type="button" onClick={() => void handleHardDeletePost(row)}>
                          영구삭제
                        </DangerTextButton>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </MobileCardList>
          </ListCard>
        )}
      </ListSection>

      <SupportSection>
        <SectionHeading>
          <div>
            <h2>지원 도구</h2>
          </div>
        </SectionHeading>
        <SupportList>
          <Link href="/admin/profile" passHref legacyBehavior>
            <SupportLink>
              <SupportCopy>
                <strong>프로필 정리</strong>
              </SupportCopy>
              <SupportMeta>프로필 열기</SupportMeta>
            </SupportLink>
          </Link>
          <Link href="/admin/tools" passHref legacyBehavior>
            <SupportLink>
              <SupportCopy>
                <strong>운영 진단</strong>
              </SupportCopy>
              <SupportMeta>진단 열기</SupportMeta>
            </SupportLink>
          </Link>
        </SupportList>
      </SupportSection>
    </Main>
  )
}

export default AdminPostWorkspacePage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2.8rem;
  display: grid;
  gap: 1.2rem;

  @media (max-width: 767px) {
    gap: 0.9rem;
    padding: 1rem 0.85rem 2rem;
  }
`

const PageHeader = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
`

const ContextLine = styled.div`
  display: none;
`

const HeroSection = styled.section`
  display: grid;
  gap: 0.8rem;
  padding: 1.25rem 1.15rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: linear-gradient(180deg, rgba(29, 78, 216, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%);
`

const HeroLabel = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  padding: 0 0.7rem;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.14);
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.74rem;
  font-weight: 800;
`

const HeroLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const HeroCopy = styled.div`
  display: grid;
  gap: 0.42rem;

  h1 {
    margin: 0;
    font-size: clamp(1.65rem, 3vw, 2.1rem);
    letter-spacing: -0.04em;
  }

  p {
    margin: 0;
    max-width: 34rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.55;
  }
`

const HeroActions = styled.div`
  display: grid;
  gap: 0.7rem;
  justify-items: end;

  @media (max-width: 900px) {
    justify-items: stretch;
  }
`

const baseButton = ({ theme }: { theme: any }) => `
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid ${theme.colors.gray5};
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
`

const PrimaryCta = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
`

const SecondaryLinkButton = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
`

const ResumeSection = styled.section`
  display: grid;
  gap: 0.85rem;
`

const SectionHeading = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1.22rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  p {
    margin: 0.15rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const SupportSection = styled.section`
  display: grid;
  gap: 0.8rem;

  h2 {
    font-weight: 800;
  }
`

const SupportList = styled.div`
  display: grid;
  gap: 0.75rem;
`

const SupportLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  text-decoration: none;

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const SupportCopy = styled.div`
  display: grid;
  gap: 0.2rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.88rem;
    line-height: 1.45;
  }
`

const SupportMeta = styled.span`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
`

const ResumeGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.9rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const ResumeCard = styled.article<{ "data-emphasis"?: "strong" | "soft" }>`
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme, "data-emphasis": emphasis }) =>
    emphasis === "strong" ? "rgba(29, 78, 216, 0.08)" : theme.colors.gray2};
`

const ResumeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;

  strong {
    font-size: 0.94rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    white-space: nowrap;
  }
`

const ResumeTitle = styled.strong`
  font-size: 1.02rem;
  line-height: 1.4;
`

const ResumeDescription = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.55;
`

const EmptyInlineState = styled.div`
  display: grid;
  gap: 0.22rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const ResumeMeta = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }
`

const VisibilityBadge = styled.span<{ "data-tone": string }>`
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 0.72rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  border: 1px solid
    ${({ theme, "data-tone": tone }) =>
      tone === "PRIVATE"
        ? theme.colors.gray7
        : tone === "PUBLIC_UNLISTED"
          ? theme.colors.blue8
          : theme.colors.green8};
  color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray11
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.blue9
        : theme.colors.green9};
  background: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray2
      : tone === "PUBLIC_UNLISTED"
        ? "rgba(59, 130, 246, 0.12)"
        : "rgba(34, 197, 94, 0.12)"};
`

const ActionRow = styled.div`
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
`

const PrimaryInlineButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
`

const GhostButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
`

const WorkspaceEmpty = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const MutedText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.55;
`

const RecentListSkeleton = styled.div`
  display: grid;
  gap: 0.55rem;

  span {
    display: block;
    height: 56px;
    border-radius: 14px;
    background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.1), rgba(255,255,255,0.06));
  }
`

const RecentPostList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;

  li button {
    width: 100%;
    padding: 0.85rem 0.9rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    text-align: left;
    cursor: pointer;
  }

  li button > div {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }
`

const RecentMeta = styled.div`
  display: grid;
  justify-items: end;
  gap: 0.28rem;

  span:last-of-type {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }
`

const ListSection = styled.section`
  display: grid;
  gap: 0.8rem;
`

const ListMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }
`

const FilterRail = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: end;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ScopeTabs = styled.div`
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
`

const ScopeTabButton = styled.button<{ "data-active"?: boolean }>`
  ${({ theme }) => baseButton({ theme })};
  min-height: 42px;
  padding: 0 0.85rem;
  background: ${({ theme, "data-active": active }) => (active ? theme.colors.blue8 : theme.colors.gray2)};
  color: ${({ theme, "data-active": active }) => (active ? theme.colors.gray12 : theme.colors.gray12)};
  border-color: ${({ theme, "data-active": active }) => (active ? theme.colors.blue8 : theme.colors.gray5)};
`

const SearchField = styled.div`
  display: grid;
  gap: 0.3rem;

  label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }

  input {
    min-height: 46px;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.95rem;
    font-size: 0.95rem;
  }
`

const AdvancedDisclosure = styled.details`
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  strong {
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .body {
    display: grid;
    gap: 0.75rem;
  }
`

const AdvancedGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.3rem;

  label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }

  input,
  select {
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.85rem;
  }
`

const InlineNotice = styled.div`
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
`

const ListSkeleton = styled.div`
  display: grid;
  gap: 0.6rem;

  span {
    display: block;
    height: 64px;
    border-radius: 14px;
    background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.1), rgba(255,255,255,0.06));
  }
`

const ListEmptyState = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const ListCard = styled.div`
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  overflow: hidden;
`

const DesktopListTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 0.95rem 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    vertical-align: top;
  }

  th {
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .idCell {
    width: 88px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .dateCell {
    width: 144px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .actionCell {
    width: 220px;
    vertical-align: middle;
  }

  tbody tr:last-of-type td {
    border-bottom: none;
  }

  @media (max-width: 900px) {
    display: none;
  }
`

const TitleCell = styled.div`
  display: grid;
  gap: 0.28rem;

  .titleRow {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  strong {
    font-size: 0.96rem;
    line-height: 1.45;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
  }
`

const RowActions = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;
`

const RowPrimaryButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
`

const DangerTextButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.red11};
  padding: 0;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
`

const MobileCardList = styled.div`
  display: none;

  @media (max-width: 900px) {
    display: grid;
    gap: 0.75rem;
    padding: 0.95rem;
  }

  article {
    display: grid;
    gap: 0.55rem;
    padding: 0.95rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .id {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.98rem;
    line-height: 1.45;
  }

  p,
  .date {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
`
