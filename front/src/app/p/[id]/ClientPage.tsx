"use client";

import type { components } from "@/global/backend/apiV1/schema";

import PostCommentWriteAndList from "./_components/PostCommentWriteAndList";
import PostInfo from "./_components/PostInfo";
import usePostClient from "./_hooks/usePostClient";
import usePostComments from "./_hooks/usePostComments";

type PostWithContentDto = components["schemas"]["PostWithContentDto"];

export default function ClientPage({
  initialPost,
}: {
  initialPost: PostWithContentDto;
}) {
  const postState = usePostClient(initialPost);
  const postCommentsState = usePostComments(initialPost.id);

  return (
    <div className="container mx-auto px-4 py-6">
      <PostInfo postState={postState} />

      <div className="mt-8 border-t dark:border-gray-700 pt-8">
        <PostCommentWriteAndList postCommentsState={postCommentsState} />
      </div>
    </div>
  );
}
