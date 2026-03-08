"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Suspense, useEffect, useState } from "react";

import Pagination from "@/components/Pagination";
import withAdmin from "@/global/auth/hoc/withAdmin";
import type { components } from "@/global/backend/apiV1/schema";
import client from "@/global/backend/client";

import SearchHelpButton from "@/lib/business/components/SearchHelpButton";
import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ArrowUpDown, Search } from "lucide-react";

type MemberWithUsernameDto = components["schemas"]["MemberWithUsernameDto"];
type PageableDto = components["schemas"]["PageableDto"];
type MemberSort =
  | "CREATED_AT"
  | "CREATED_AT_ASC"
  | "USERNAME"
  | "USERNAME_ASC"
  | "NICKNAME"
  | "NICKNAME_ASC";

const SORT_OPTIONS: { value: MemberSort; label: string }[] = [
  { value: "CREATED_AT", label: "최신순" },
  { value: "CREATED_AT_ASC", label: "오래된순" },
  { value: "USERNAME", label: "사용자명 역순" },
  { value: "USERNAME_ASC", label: "사용자명순" },
  { value: "NICKNAME", label: "별명 역순" },
  { value: "NICKNAME_ASC", label: "별명순" },
];

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get("page") || "1");
  const currentPageSize = Number(searchParams.get("pageSize") || "30");
  const currentKw = searchParams.get("kw") || "";
  const currentSort = (searchParams.get("sort") || "CREATED_AT") as MemberSort;

  const [members, setMembers] = useState<MemberWithUsernameDto[]>([]);
  const [pageable, setPageable] = useState<PageableDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [kwInput, setKwInput] = useState(currentKw);

  useEffect(() => {
    let cancelled = false;
    client
      .GET("/member/api/v1/adm/members", {
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
          setMembers(res.data.content);
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

  if (loading) return <div>로딩중...</div>;

  const totalPages = pageable?.totalPages ?? 1;
  const totalElements = pageable?.totalElements ?? members.length;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center my-4">회원 목록</h1>

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
          총 {totalElements}명
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
        </div>
      </div>

      {members.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          회원이 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`./members/${member.id}`}
                className="flex items-center gap-3 p-3 border rounded hover:bg-accent/50 transition-colors"
              >
                <img
                  src={member.profileImageUrl}
                  alt={member.name}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <span className="flex-1 min-w-0">
                  <span className="block">
                    {member.id} : {member.username} / {member.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    가입일: {formatDate(member.createdAt)}
                  </span>
                </span>
              </Link>
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

export default withAdmin(function Page() {
  return (
    <Suspense fallback={<div>로딩중...</div>}>
      <PageContent />
    </Suspense>
  );
});
