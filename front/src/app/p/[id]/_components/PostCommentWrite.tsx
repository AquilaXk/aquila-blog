import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Send } from "lucide-react";

import usePostComments from "../_hooks/usePostComments";

export default function PostCommentWrite({
  postCommentsState,
}: {
  postCommentsState: ReturnType<typeof usePostComments>;
}) {
  const { writeComment } = postCommentsState;

  const handleCommentWriteFormSubmit = (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();

    const form = e.target as HTMLFormElement;

    const contentTextarea = form.elements.namedItem(
      "content",
    ) as HTMLTextAreaElement;

    contentTextarea.value = contentTextarea.value.trim();

    if (contentTextarea.value.length === 0) {
      toast.error("댓글 내용을 입력해주세요.");
      contentTextarea.focus();
      return;
    }

    if (contentTextarea.value.length < 2) {
      toast.error("댓글 내용을 2자 이상 입력해주세요.");
      contentTextarea.focus();
      return;
    }

    writeComment(contentTextarea.value, (data) => {
      toast.success(data.msg);
      contentTextarea.value = "";
    });
  };

  return (
    <form
      className="flex flex-col sm:flex-row gap-3"
      onSubmit={handleCommentWriteFormSubmit}
    >
      <textarea
        className="flex-1 border border-input p-3 rounded-md bg-background resize-none focus:ring-2 focus:ring-ring focus:border-transparent outline-none"
        name="content"
        placeholder="댓글을 작성해주세요..."
        maxLength={100}
        rows={3}
      />
      <Button type="submit" className="self-end sm:self-start">
        <Send className="w-4 h-4" />
        작성
      </Button>
    </form>
  );
}
