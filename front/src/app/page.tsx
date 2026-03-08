"use client";

import Link from "next/link";

import PostWriteButton from "@/domain/post/components/PostWriteButton";
import { useAuthContext } from "@/global/auth/hooks/useAuth";

import LoginButton from "@/lib/business/components/LoginButton";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { FileText, Sparkles } from "lucide-react";

export default function Page() {
  const { isLogin } = useAuthContext();

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="container mx-auto px-4 py-12">
        <Card className="text-center">
          <CardContent className="pt-12 pb-8 space-y-8">
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h1 className="text-3xl font-bold">환영합니다</h1>
              <p className="text-muted-foreground">
                개발 여정을 기록하고, 지식을 나누세요
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg">
                <Link href="/p">
                  <FileText className="w-4 h-4" />글 목록 보기
                </Link>
              </Button>
              {isLogin ? (
                <PostWriteButton variant="outline" size="lg" />
              ) : (
                <LoginButton variant="outline" text="로그인" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
