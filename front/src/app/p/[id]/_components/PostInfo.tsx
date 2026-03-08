import { useTheme } from "next-themes";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useState } from "react";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

import ToastUIEditorViewer from "@/lib/business/components/ToastUIEditorViewer";
import { formatDate } from "@/lib/utils";

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

import {
  Calendar,
  Eye,
  FileText,
  Heart,
  MessageCircle,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
} from "lucide-react";

import usePostClient from "../_hooks/usePostClient";

function hasPpt(content: string): boolean {
  return /<details[^>]*\bppt-id\s*=/.test(content);
}

export default function PostInfo({
  postState,
}: {
  postState: ReturnType<typeof usePostClient>;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { post, deletePost: _deletePost, toggleLike, editorRef } = postState;
  const { loginMember, isLogin, isAdmin } = useAuthContext();
  const [isDeleting, setIsDeleting] = useState(false);

  const isAuthor = isLogin && loginMember.id === post?.authorId;
  const canEdit = isAuthor;
  const canDelete = isAdmin || isAuthor;

  if (post == null)
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">로딩중...</div>
      </div>
    );

  const deletePost = () => {
    setIsDeleting(true);
    _deletePost(
      post.id,
      () => {
        router.replace("/p");
      },
      () => {
        setIsDeleting(false);
      },
    );
  };

  const getStatusBadge = () => {
    if (!post.published) {
      return <Badge variant="secondary">임시저장</Badge>;
    }
    if (!post.listed) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-600">
          비공개
        </Badge>
      );
    }
    return null;
  };

  return (
    <article>
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">{post.id}</Badge>
          {getStatusBadge()}
        </div>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Avatar className="w-7 h-7">
              <AvatarImage
                src={post.authorProfileImgUrl}
                alt={post.authorName}
              />
              <AvatarFallback className="text-xs">
                {post.authorName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {post.authorName}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(post.createdAt)}
          </span>
          {post.modifiedAt !== post.createdAt && (
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              {formatDate(post.modifiedAt)}
            </span>
          )}
        </div>
      </header>

      <div className="prose dark:prose-invert max-w-none">
        <ToastUIEditorViewer
          ref={editorRef}
          key={resolvedTheme}
          initialValue={post.content}
          theme={(resolvedTheme as "dark" | "light") || "light"}
          postId={post.id}
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-border">
        <Button variant="outline" size="sm" disabled>
          <Eye className="w-4 h-4" />
          {post.hitCount}
        </Button>
        <Button
          variant={post.actorHasLiked ? "default" : "outline"}
          size="sm"
          onClick={() => toggleLike(post.id)}
          className={
            post.actorHasLiked
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "hover:text-red-500 hover:border-red-500"
          }
        >
          <Heart
            className={`w-4 h-4 ${post.actorHasLiked ? "fill-current" : ""}`}
          />
          {post.likesCount}
        </Button>
        <Button variant="outline" size="sm" disabled>
          <MessageCircle className="w-4 h-4" />
          {post.commentsCount}
        </Button>
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="w-4 h-4" />
                삭제
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>글 삭제</AlertDialogTitle>
                <AlertDialogDescription>
                  {post.id}번 글을 정말로 삭제하시겠습니까? 이 작업은 되돌릴 수
                  없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={deletePost} disabled={isDeleting}>
                  {isDeleting ? "삭제 중..." : "삭제"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/p/${post.id}/edit`}>
              <Pencil className="w-4 h-4" />
              수정
            </Link>
          </Button>
        )}
        <Button variant="secondary" size="sm" asChild>
          <a
            href={`/p/${post.id}/raw`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText className="w-4 h-4" />
            Raw 보기
          </a>
        </Button>
        {hasPpt(post.content) && (
          <Button
            variant="outline"
            size="sm"
            className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            asChild
          >
            <Link href={`/p/${post.id}/ppt`}>
              <Presentation className="w-4 h-4" />
              PPT 보기
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
