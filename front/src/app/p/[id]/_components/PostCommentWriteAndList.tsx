import usePostComments from "../_hooks/usePostComments";
import PostCommentList from "./PostCommentList";
import PostCommentWrite from "./PostCommentWrite";

export default function PostCommentWriteAndList({
  postCommentsState,
}: {
  postCommentsState: ReturnType<typeof usePostComments>;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 dark:text-white">댓글</h2>

      <PostCommentWrite postCommentsState={postCommentsState} />

      <div className="mt-6">
        <PostCommentList postCommentsState={postCommentsState} />
      </div>
    </section>
  );
}
