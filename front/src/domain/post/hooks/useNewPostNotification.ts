"use client";

import { useEffect, useRef, useState } from "react";

import { useAuthContext } from "@/global/auth/hooks/useAuth";
import { subscribe } from "@/global/websocket/stompClient";

export interface PostNotification {
  id: number;
  title: string;
  authorId: number;
  authorName: string;
  authorProfileImgUrl: string;
  createdAt: string;
}

export function useNewPostNotification(
  onNewPost?: (post: PostNotification) => void,
) {
  const [latestPost, setLatestPost] = useState<PostNotification | null>(null);
  const { loginMember } = useAuthContext();
  const callbackRef = useRef(onNewPost);
  const loginMemberRef = useRef(loginMember);

  useEffect(() => {
    callbackRef.current = onNewPost;
  }, [onNewPost]);

  useEffect(() => {
    loginMemberRef.current = loginMember;
  }, [loginMember]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    subscribe("/topic/posts/new", (message) => {
      const post: PostNotification = JSON.parse(message.body);

      // 작성자 본인이면 무시
      if (loginMemberRef.current?.id === post.authorId) return;

      setLatestPost(post);
      callbackRef.current?.(post);
    }).then((sub) => {
      if (cancelled) {
        sub.unsubscribe();
      } else {
        subscription = sub;
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  return { latestPost };
}
