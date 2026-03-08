import { MessageSquare } from "lucide-react";

import usePostComments from "../_hooks/usePostComments";
import PostCommentListItem from "./PostCommentListItem";

export default function PostCommentList({
  postCommentsState,
}: {
  postCommentsState: ReturnType<typeof usePostComments>;
}) {
  const { postComments } = postCommentsState;

  if (postComments == null)
    return <div className="text-muted-foreground text-sm">로딩중...</div>;

  return (
    <>
      <div className="text-sm text-muted-foreground mb-3">
        {postComments.length}개의 댓글
      </div>

      {postComments.length === 0 ? (
        <div className="text-muted-foreground text-sm py-8 text-center flex flex-col items-center gap-2">
          <MessageSquare className="w-8 h-8" />첫 번째 댓글을 작성해보세요.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {postComments.map((comment) => (
            <PostCommentListItem
              key={comment.id}
              comment={comment}
              postCommentsState={postCommentsState}
            />
          ))}
        </ul>
      )}
    </>
  );
}
