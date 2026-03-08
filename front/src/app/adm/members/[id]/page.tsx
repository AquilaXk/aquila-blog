"use client";

import Link from "next/link";

import { use, useEffect, useState } from "react";

import withAdmin from "@/global/auth/hoc/withAdmin";
import type { components } from "@/global/backend/apiV1/schema";
import client from "@/global/backend/client";

import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";

type MemberWithUsernameDto = components["schemas"]["MemberWithUsernameDto"];

export default withAdmin(function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = parseInt(idStr);

  const [member, setMember] = useState<MemberWithUsernameDto | null>(null);

  useEffect(() => {
    client
      .GET("/member/api/v1/adm/members/{id}", {
        params: {
          path: {
            id,
          },
        },
      })
      .then((res) => res.data && setMember(res.data));
  }, [id]);

  if (member == null) return <div>로딩중...</div>;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "ID", value: member.id },
    { label: "아이디", value: member.username },
    { label: "이름", value: member.name },
    { label: "관리자 여부", value: member.isAdmin ? "예" : "아니오" },
    { label: "가입일", value: formatDate(member.createdAt) },
    { label: "수정일", value: formatDate(member.modifiedAt) },
  ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-center my-4">회원 정보</h1>

      <div className="flex justify-center mb-6">
        <img
          src={member.profileImageUrl}
          alt={`${member.name} 프로필`}
          className="w-24 h-24 rounded-full object-cover"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex border-b last:border-b-0 text-sm">
            <div className="w-32 shrink-0 px-4 py-3 font-medium bg-muted text-muted-foreground">
              {label}
            </div>
            <div className="px-4 py-3">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Button variant="outline" asChild>
          <Link href="/adm/members">목록으로</Link>
        </Button>
      </div>
    </div>
  );
});
