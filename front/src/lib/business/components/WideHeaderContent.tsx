"use client";

import Link from "next/link";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

import { Button } from "@/components/ui/button";

import { MonitorCog, NotebookText, TableOfContents } from "lucide-react";

import LoginButton from "./LoginButton";
import Logo from "./Logo";
import MeMenuButton from "./MeMenuButton";
import PostWriteButton from "./PostWriteButton";
import ThemeToggleButton from "./ThemeToggleButton";

export default function WideHeaderContent({
  className,
}: {
  className?: string;
}) {
  const { isLogin, isAdmin } = useAuthContext();

  return (
    <div className={`${className} container mx-auto px-4 py-1`}>
      <Button variant="link" asChild>
        <Logo text />
      </Button>
      <Button variant="link" asChild>
        <Link href="/p">
          <TableOfContents /> 글
        </Link>
      </Button>
      {isLogin && <PostWriteButton text />}
      {isLogin && (
        <Button variant="link" asChild>
          <Link href="/p/mine">
            <NotebookText /> 내 글
          </Link>
        </Button>
      )}

      <div
        data-header-slot=""
        className="flex-grow flex items-center justify-center min-w-0"
      ></div>

      {!isLogin && <LoginButton />}
      {isLogin && <MeMenuButton />}
      {isLogin && isAdmin && (
        <Button variant="link" asChild>
          <Link href="/adm/members">
            <MonitorCog /> 관리자 메뉴
          </Link>
        </Button>
      )}
      <ThemeToggleButton />
    </div>
  );
}
