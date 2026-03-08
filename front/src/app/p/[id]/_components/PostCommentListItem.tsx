import { useState } from "react";

import type { components } from "@/global/backend/apiV1/schema";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Check, Pencil, Trash2, X } from "lucide-react";

import usePostComments from "../_hooks/usePostComments";

type PostCommentDto = components["schemas"]["PostCommentDto"];

export default function PostCommentListItem({
  comment,
  postCommentsState,
}: {
  comment: PostCommentDto;
  postCommentsState: ReturnType<typeof usePostComments>;
}) {
  const [modifyMode, setModifyMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteComment: _deleteComment, modifyComment } = postCommentsState;

  const toggleModifyMode = () => {
    setModifyMode(!modifyMode);
  };

  const deleteComment = (commentId: number) => {
    setIsDeleting(true);
    _deleteComment(commentId, (data) => {
      toast.success(data.msg);
      setIsDeleting(false);
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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

    modifyComment(comment.id, contentTextarea.value, (data) => {
      toast.success(data.msg);
      toggleModifyMode();
    });
  };

  return (
    <li>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={comment.authorProfileImgUrl}
                    alt={comment.authorName}
                  />
                  <AvatarFallback>
                    {comment.authorName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {comment.authorName}
                </span>
                <Badge variant="secondary">#{comment.id}</Badge>
              </div>

              {!modifyMode && (
                <p className="whitespace-pre-line text-sm">{comment.content}</p>
              )}

              {modifyMode && (
                <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
                  <textarea
                    className="w-full border border-input p-3 rounded-md bg-background resize-none focus:ring-2 focus:ring-ring focus:border-transparent outline-none text-sm"
                    name="content"
                    placeholder="댓글 내용"
                    maxLength={100}
                    rows={3}
                    defaultValue={comment.content}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button type="submit" variant="outline" size="sm">
                      <Check className="w-4 h-4" />
                      저장
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleModifyMode}
                    >
                      <X className="w-4 h-4" />
                      취소
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {!modifyMode &&
              (comment.actorCanModify || comment.actorCanDelete) && (
                <div className="flex gap-1 flex-shrink-0">
                  {comment.actorCanModify && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleModifyMode}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {comment.actorCanDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>댓글 삭제</AlertDialogTitle>
                          <AlertDialogDescription>
                            {comment.id}번 댓글을 정말로 삭제하시겠습니까? 이
                            작업은 되돌릴 수 없습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteComment(comment.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "삭제 중..." : "삭제"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
