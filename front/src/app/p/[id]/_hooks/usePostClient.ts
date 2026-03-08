import { MutableRefObject, useEffect, useRef, useState } from "react";

import type { components } from "@/global/backend/apiV1/schema";
import client from "@/global/backend/client";
import {
  onReconnect,
  subscribe as stompSubscribe,
} from "@/global/websocket/stompClient";
import { toast } from "sonner";

import {
  convertCodeBlocksToDiagramSyntax,
  processMarkdownContent,
} from "@/lib/business/markdownUtils";

type PostWithContentDto = components["schemas"]["PostWithContentDto"];
type RsDataVoid = components["schemas"]["RsDataVoid"];

const VIEWED_POSTS_KEY = "viewedPosts";
const VIEWED_POSTS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24시간
const MAX_VIEWED_POSTS = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorRef = MutableRefObject<any>;

interface ViewedPostsData {
  posts: Record<string, number>; // postId -> timestamp
}

function getViewedPostsData(): ViewedPostsData {
  if (typeof window === "undefined") return { posts: {} };

  try {
    const data = localStorage.getItem(VIEWED_POSTS_KEY);
    if (!data) return { posts: {} };
    return JSON.parse(data) as ViewedPostsData;
  } catch {
    return { posts: {} };
  }
}

function hasViewedPost(postId: number): boolean {
  const data = getViewedPostsData();
  const viewedAt = data.posts[postId.toString()];
  if (!viewedAt) return false;

  // 24시간 이내에 조회했는지 체크
  return Date.now() - viewedAt < VIEWED_POSTS_EXPIRY_MS;
}

function markPostAsViewed(postId: number): void {
  if (typeof window === "undefined") return;

  const data = getViewedPostsData();
  const now = Date.now();

  // 만료된 항목 제거
  const validPosts: Record<string, number> = {};
  for (const [id, timestamp] of Object.entries(data.posts)) {
    if (now - timestamp < VIEWED_POSTS_EXPIRY_MS) {
      validPosts[id] = timestamp;
    }
  }

  // 새 항목 추가
  validPosts[postId.toString()] = now;

  // 최대 개수 제한 (가장 오래된 것부터 제거)
  const entries = Object.entries(validPosts).sort((a, b) => a[1] - b[1]);
  while (entries.length > MAX_VIEWED_POSTS) {
    const oldest = entries.shift();
    if (oldest) delete validPosts[oldest[0]];
  }

  localStorage.setItem(VIEWED_POSTS_KEY, JSON.stringify({ posts: validPosts }));
}

export default function usePostClient(initialPost: PostWithContentDto) {
  const [post, setPost] = useState<PostWithContentDto | null>(initialPost);
  const lastModifyDateAfterRef = useRef(initialPost.modifiedAt);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const hitCalledRef = useRef(false);

  // 조회수 증가: 클라이언트 사이드에서 한 번만 호출 (로컬 스토리지로 중복 체크)
  useEffect(() => {
    if (hitCalledRef.current) return;
    hitCalledRef.current = true;

    // 이미 24시간 내에 조회한 글이면 API 호출하지 않음
    if (hasViewedPost(initialPost.id)) {
      return;
    }

    client
      .POST("/post/api/v1/posts/{id}/hit", {
        params: {
          path: { id: initialPost.id },
        },
      })
      .then((res) => {
        const hitCount = res.data?.data?.hitCount;
        if (hitCount !== undefined) {
          setPost((prev) => (prev ? { ...prev, hitCount } : prev));
          // API 호출 성공 시 로컬 스토리지에 기록
          markPostAsViewed(initialPost.id);
        }
      })
      .catch(() => {
        // 조회수 증가 실패 무시
      });
  }, [initialPost.id]);

  // 라이브 리로드: STOMP 구독 + 복귀 시 HTTP fetch로 놓친 변경사항 보정
  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    // STOMP 메시지 수신 시 UI 업데이트
    const applyUpdate = (data: PostWithContentDto) => {
      if (data.modifiedAt === lastModifyDateAfterRef.current) return;

      lastModifyDateAfterRef.current = data.modifiedAt;

      if (editorRef.current?.getInstance) {
        let processedContent = convertCodeBlocksToDiagramSyntax(data.content);
        processedContent = processMarkdownContent(processedContent, data.id);
        editorRef.current.getInstance().setMarkdown(processedContent);
      }

      setPost((prev) =>
        prev
          ? {
              ...prev,
              title: data.title,
              content: data.content,
              modifiedAt: data.modifiedAt,
              likesCount: data.likesCount,
              commentsCount: data.commentsCount,
              hitCount: data.hitCount,
            }
          : prev,
      );

      toast("문서 업데이트", {
        description: "새로운 내용으로 업데이트되었습니다.",
      });
    };

    const onMessage = (message: { body: string }) => {
      applyUpdate(JSON.parse(message.body) as PostWithContentDto);
    };

    // HTTP로 최신 상태 fetch (탭 복귀, 온라인 복구, WebSocket reconnect 시)
    const fetchLatest = async () => {
      if (cancelled) return;

      try {
        const res = await client.GET("/post/api/v1/posts/{id}", {
          params: {
            path: { id: initialPost.id },
            query: { lastModifiedAt: lastModifyDateAfterRef.current },
          },
        });

        if (!cancelled && res.response.ok && res.data) {
          applyUpdate(res.data as PostWithContentDto);
        }
      } catch {
        // 네트워크 오류 무시
      }
    };

    // 탭 복귀 시 fetch
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchLatest();
    };

    // 온라인 복구 시 fetch
    const handleOnline = () => fetchLatest();

    // STOMP 구독
    stompSubscribe(`/topic/posts/${initialPost.id}/modified`, onMessage).then(
      (sub) => {
        if (cancelled) {
          sub.unsubscribe();
        } else {
          subscription = sub;
        }
      },
    );

    // WebSocket reconnect 시 놓친 변경사항 fetch
    const unsubscribeReconnect = onReconnect(fetchLatest);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      unsubscribeReconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [initialPost.id]);

  const deletePost = (
    id: number,
    onSuccess: () => void,
    onError?: () => void,
  ) => {
    client
      .DELETE("/post/api/v1/posts/{id}", {
        params: {
          path: {
            id,
          },
        },
      })
      .then((res) => {
        if (res.error) {
          toast.error(res.error.msg);
          onError?.();
          return;
        }

        toast.success(res.data.msg);
        onSuccess();
      });
  };

  const modifyPost = (
    id: number,
    title: string,
    content: string,
    onSuccess: (res: RsDataVoid) => void,
    published?: boolean,
    listed?: boolean,
  ) => {
    client
      .PUT("/post/api/v1/posts/{id}", {
        params: {
          path: {
            id,
          },
        },
        body: {
          title,
          content,
          published: published ?? post?.published ?? false,
          listed: listed ?? post?.listed ?? false,
        },
      })
      .then((res) => {
        if (res.error) {
          toast.error(res.error.msg);
          return;
        }

        onSuccess(res.data);
      });
  };

  const toggleLike = (id: number) => {
    client
      .POST("/post/api/v1/posts/{id}/like", {
        params: {
          path: {
            id,
          },
        },
      })
      .then((res) => {
        if (res.error) {
          toast.error(res.error.msg);
          return;
        }

        if (post) {
          setPost({
            ...post,
            actorHasLiked: res.data.data.liked,
            likesCount: res.data.data.likesCount,
          });
        }

        toast.success(res.data.msg);
      });
  };

  return {
    post,
    setPost,
    editorRef: editorRef as EditorRef,
    deletePost,
    modifyPost,
    toggleLike,
  };
}
