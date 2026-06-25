import AdminShell from "./AdminShell"
import { AdminPostsWorkspaceFeedbackLayer } from "./AdminPostsWorkspaceFeedbackLayer"
import { AdminPostsWorkspaceFilterToolbar } from "./AdminPostsWorkspaceFilterToolbar"
import { AdminPostsWorkspaceList } from "./AdminPostsWorkspaceList"
import { DEFAULT_PAGE } from "./AdminPostsWorkspaceModel"
import {
  HeroSection,
  ListSection,
  Main,
  PostsHeroCopy,
  PrimaryCta,
  WorkspaceBody,
  WorkspaceMain,
} from "./AdminPostsWorkspacePageSections"
import { AdminWorkspaceHeroActions, AdminWorkspaceHeroLayout } from "./AdminSurfacePrimitives"

export const AdminPostsWorkspacePageView = (props: Record<string, any>) => {
  const {
    confirmState,
    handleConfirmAction,
    handleToastAction,
    isListLoading,
    listError,
    listKw,
    listPage,
    listPageSize,
    listScope,
    listStatus,
    listSectionRef,
    listSort,
    listState,
    loadList,
    openWriteRoute,
    sessionMember,
    setConfirmState,
    setListKw,
    setListPage,
    setListStatus,
    setListSort,
    setToast,
    shouldRenderMobileList,
    toast,
  } = props

  return (
    <AdminShell currentSection="posts" member={sessionMember}>
      <Main>
        <HeroSection>
          <AdminWorkspaceHeroLayout>
            <PostsHeroCopy>
              <span>Content</span>
              <h1>글 관리</h1>
              <p>초안, 발행, 비공개, 삭제 상태를 같은 목록에서 관리합니다.</p>
            </PostsHeroCopy>
            <AdminWorkspaceHeroActions>
              <PrimaryCta type="button" onClick={() => void openWriteRoute()}>
                새 글 작성
              </PrimaryCta>
            </AdminWorkspaceHeroActions>
          </AdminWorkspaceHeroLayout>
        </HeroSection>

        <WorkspaceBody>
          <WorkspaceMain>
            <ListSection ref={listSectionRef}>
              <AdminPostsWorkspaceFilterToolbar
                listScope={listScope}
                listStatus={listStatus}
                listKw={listKw}
                listSort={listSort}
                onStatusChange={setListStatus}
                onKeywordChange={(value) => {
                  setListPage(DEFAULT_PAGE)
                  setListKw(value)
                }}
                onSortChange={setListSort}
              />

              <AdminPostsWorkspaceList
                listScope={listScope}
                listKw={listKw}
                listPage={listPage}
                listPageSize={listPageSize}
                listState={listState}
                isListLoading={isListLoading}
                listError={listError}
                shouldRenderMobileList={shouldRenderMobileList}
                onLoadList={() => void loadList()}
                onOpenWriteRoute={(query) => void openWriteRoute(query)}
                onPageChange={(page) => setListPage(String(page))}
                onResetSearch={() => {
                  setListKw("")
                  setListPage(DEFAULT_PAGE)
                }}
              />
            </ListSection>
          </WorkspaceMain>
        </WorkspaceBody>

        <AdminPostsWorkspaceFeedbackLayer
          toast={toast}
          confirmState={confirmState}
          onToastAction={() => void handleToastAction()}
          onToastDismiss={() => setToast(null)}
          onConfirmCancel={() => setConfirmState(null)}
          onConfirmAction={() => void handleConfirmAction()}
        />
      </Main>
    </AdminShell>
  )
}
