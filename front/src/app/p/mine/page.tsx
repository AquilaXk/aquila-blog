"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Suspense, useEffect, useState } from "react";

import Pagination from "@/components/Pagination";
import PostWriteButton from "@/domain/post/components/PostWriteButton";
import withLogin from "@/global/auth/hoc/withLogin";
import type { components } from "@/global/backend/apiV1/schema";
import client from "@/global/backend/client";

import SearchHelpButton from "@/lib/business/components/SearchHelpButton";
import { formatDate } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  ArrowUpDown,
  Eye,
  Heart,
  List,
  Lock,
  MessageCircle,
  Pencil,
  Search,
} from "lucide-react";

type PostDto = components["schemas"]["PostDto"];
type PageableDto = components["schemas"]["PageableDto"];
type PostSort =
  | "CREATED_AT"
  | "CREATED_AT_ASC"
  | "MODIFIED_AT"
  | "MODIFIED_AT_ASC";

const SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: "CREATED_AT", label: "작성일 ↓" },
  { value: "CREATED_AT_ASC", label: "작성일 ↑" },
  { value: "MODIFIED_AT", label: "수정일 ↓" },
  { value: "MODIFIED_AT_ASC", label: "수정일 ↑" },
];

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = Math.max(1, Number(searchParams.get("page") || "1"));
  const currentPageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") || "30")),
  );
  const currentKw = searchParams.get("kw") || "";
  const currentSort = (searchParams.get("sort") || "CREATED_AT") as PostSort;

  const [posts, setPosts] = useState<PostDto[]>([]);
  const [pageable, setPageable] = useState<PageableDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [kwInput, setKwInput] = useState(currentKw);

  useEffect(() => {
    let cancelled = false;
    client
      .GET("/post/api/v1/posts/mine", {
        params: {
          query: {
            page: currentPage,
            pageSize: currentPageSize,
            kw: currentKw,
            sort: currentSort,
          },
        },
      })
      .then((res) => {
        if (!cancelled && res.data) {
          setPosts(res.data.content);
          setPageable(res.data.pageable ?? null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage, currentPageSize, currentKw, currentSort]);

  const updateParams = (params: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) {
        sp.set(k, v);
      } else {
        sp.delete(k);
      }
    }
    router.push(`?${sp.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ kw: kwInput, page: "1" });
  };

  const handleSortChange = (sort: string) => {
    updateParams({ sort, page: "1" });
  };

  const handlePageChange = (page: number) => {
    updateParams({ page: String(page) });
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">로딩중...</div>
      </div>
    );

  const totalPages = pageable?.totalPages ?? 1;
  const totalElements = pageable?.totalElements ?? posts.length;

  const getStatusBadge = (post: PostDto) => {
    if (!post.published) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Lock className="w-3 h-3" />
          임시저장
        </Badge>
      );
    }
    if (!post.listed) {
      return (
        <Badge variant="outline" className="gap-1">
          <Eye className="w-3 h-3" />
          비공개
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        <List className="w-3 h-3" />
        공개
      </Badge>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center my-4">내 글</h1>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <Input
          placeholder="검색어를 입력하세요"
          value={kwInput}
          onChange={(e) => setKwInput(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="icon">
          <Search className="w-4 h-4" />
        </Button>
        <SearchHelpButton />
      </form>

      {/* 정렬 + 총 개수 */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-muted-foreground">
          총 {totalElements}개
        </span>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          <select
            value={currentSort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <PostWriteButton />
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-280px)] py-12 text-muted-foreground">
          <Search className="w-12 h-12 mb-4" />
          <p>작성한 글이 없습니다.</p>
          <PostWriteButton className="mt-4" text="첫 글 작성하기" />
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Card
                className="hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/p/${post.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <Badge variant="outline">{post.id}</Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(post)}
                      </div>
                      <span className="font-medium block truncate">
                        {post.title || "(제목 없음)"}
                      </span>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span>{formatDate(post.createdAt)}</span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {post.hitCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart
                            className={`w-3.5 h-3.5 ${post.actorHasLiked ? "fill-red-500 text-red-500" : ""}`}
                          />
                          {post.likesCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {post.commentsCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/p/${post.id}/edit`);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* 페이지네이션 */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        className="mt-8"
      />
    </div>
  );
}

export default withLogin(function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-muted-foreground">로딩중...</div>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
});
