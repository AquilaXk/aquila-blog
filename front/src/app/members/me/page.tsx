"use client";

import Image from "next/image";

import withLogin from "@/global/auth/hoc/withLogin";
import { useAuthContext } from "@/global/auth/hooks/useAuth";

import { formatDate } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Calendar, Clock, User } from "lucide-react";

export default withLogin(function Page() {
  const { loginMember } = useAuthContext();

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-2xl font-bold text-center mb-8">내 정보</h1>

      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src={loginMember.profileImageUrl}
              alt={loginMember.name}
              width={96}
              height={96}
              className="rounded-full object-cover ring-4 ring-primary/10"
              unoptimized
            />
          </div>
          <CardTitle className="text-xl">{loginMember.name}</CardTitle>
          <Badge variant="outline" className="w-fit mx-auto">
            ID: {loginMember.id}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <User className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">이름</div>
              <div className="font-medium">{loginMember.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">가입일</div>
              <div className="font-medium">
                {formatDate(loginMember.createdAt)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">최근 수정</div>
              <div className="font-medium">
                {formatDate(loginMember.modifiedAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
