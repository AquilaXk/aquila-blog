import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import { NextPage } from "next"
import { useRouter } from "next/router"
import { useEffect, useMemo, useState } from "react"
import AppIcon from "src/components/icons/AppIcon"
import { AdminPageProps } from "src/libs/server/adminPage"
import { formatDate } from "src/libs/utils"
import type { TPost } from "src/types"
import PostHeader from "src/routes/Detail/PostDetail/PostHeader"
import {
  readEditorActualPreviewSnapshot,
  toEditorActualPreviewRoute,
  toPreviewPostStatus,
  type EditorActualPreviewSnapshot,
} from "./editorActualPreview"

const LazyMarkdownRenderer = dynamic(() => import("src/routes/Detail/components/MarkdownRenderer"), {
  ssr: false,
  loading: () => <div style={{ padding: "1rem 1.1rem", color: "var(--color-gray10)" }}>실제 보기 준비 중...</div>,
})

export const EditorActualPreviewPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const previewId = typeof router.query.id === "string" ? router.query.id : ""
  const [snapshot, setSnapshot] = useState<EditorActualPreviewSnapshot | null>(null)

  useEffect(() => {
    if (!previewId) return

    const sync = () => {
      setSnapshot(readEditorActualPreviewSnapshot(previewId))
    }

    sync()

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.endsWith(previewId)) return
      sync()
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [previewId])

  const previewPost = useMemo<TPost | null>(() => {
    if (!snapshot) return null

    return {
      id: snapshot.id,
      slug: snapshot.id,
      type: ["Post"],
      title: snapshot.title.trim() || "제목을 입력하세요",
      summary: snapshot.summary.trim() || undefined,
      tags: snapshot.tags,
      author: [
        {
          id: String(initialMember.id),
          name: snapshot.authorName || initialMember.nickname || initialMember.username || "관리자",
          profile_photo: snapshot.authorImageUrl || undefined,
        },
      ],
      date: { start_date: snapshot.createdAt },
      createdTime: snapshot.createdAt,
      modifiedTime: snapshot.createdAt,
      status: toPreviewPostStatus(snapshot.visibility),
      fullWidth: false,
      thumbnail: snapshot.thumbnailUrl || undefined,
      likesCount: 0,
      commentsCount: 0,
      hitCount: 0,
      actorHasLiked: false,
      actorCanModify: false,
      actorCanDelete: false,
    }
  }, [initialMember.id, initialMember.nickname, initialMember.username, snapshot])

  return (
    <PreviewRoot>
      <PreviewTopBar>
        <button type="button" onClick={() => void router.push(toEditorActualPreviewRoute(previewId).replace("/preview/", "/"))}>
          <AppIcon name="edit" />
          <span>편집기로 돌아가기</span>
        </button>
        <div>
          <strong>실제 보기</strong>
          <span>최종 검수는 이 화면 기준으로 확인합니다.</span>
        </div>
      </PreviewTopBar>

      {previewPost && snapshot ? (
        <PreviewLayout>
          <PreviewArticle>
            <PostHeader data={previewPost} interactiveTags={false} showEngagement={false} />
            <PreviewBody>
              <LazyMarkdownRenderer content={snapshot.content} />
            </PreviewBody>
          </PreviewArticle>
        </PreviewLayout>
      ) : (
        <PreviewEmptyState>
          <strong>실제 보기 데이터를 찾을 수 없습니다.</strong>
          <span>편집 화면에서 다시 열어 주세요.</span>
        </PreviewEmptyState>
      )}
    </PreviewRoot>
  )
}

const PreviewRoot = styled.div`
  min-height: 100vh;
  padding: calc(var(--app-header-height, 64px) + 1.5rem) 1.5rem 3rem;
  background: ${({ theme }) => theme.colors.gray1};
`

const PreviewTopBar = styled.div`
  width: min(100%, calc(var(--article-readable-width, 48rem) + 6rem));
  margin: 0 auto 1.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }

  div {
    display: grid;
    justify-items: end;
    gap: 0.18rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: flex-start;

    div {
      justify-items: start;
    }
  }
`

const PreviewLayout = styled.div`
  width: min(100%, 74rem);
  margin: 0 auto;
  min-width: 0;
`

const PreviewArticle = styled.article`
  width: min(100%, var(--article-readable-width, 48rem));
  margin: 0 auto;
  display: grid;
  gap: 1.15rem;
  min-width: 0;
`

const PreviewBody = styled.section`
  min-width: 0;
`

const PreviewEmptyState = styled.div`
  width: min(100%, var(--article-readable-width, 48rem));
  margin: 4rem auto 0;
  display: grid;
  gap: 0.5rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
  }
`
