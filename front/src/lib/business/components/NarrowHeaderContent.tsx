"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";

import {
  LogOut,
  Menu,
  MonitorCog,
  NotebookText,
  TableOfContents,
  User,
} from "lucide-react";

import LoginButton from "./LoginButton";
import Logo from "./Logo";
import MeMenuButton from "./MeMenuButton";
import PostWriteButton from "./PostWriteButton";
import ThemeToggleButton from "./ThemeToggleButton";

export default function NarrowHeaderContent({
  className,
}: {
  className?: string;
}) {
  const { isLogin, isAdmin, loginMember, logout: _logout } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();

  // /p/[id]/edit 또는 /p/[id]/edit/monaco 패턴에서 글 번호 추출
  const editMatch = pathname.match(/^\/p\/(\d+)\/edit/);
  const editPostId = editMatch ? editMatch[1] : null;

  const logout = () => {
    _logout(() => router.replace("/"));
  };

  return (
    <div className={`${className} px-2 py-1`}>
      <Drawer>
        <DrawerTrigger asChild>
          <Button variant="link">
            <Menu />
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>전체 메뉴</DrawerTitle>
            <DrawerDescription>전체 메뉴</DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[calc(100dvh-150px)] px-2 pb-2 overflow-y-auto">
            <ul>
              <li>
                <DrawerClose asChild>
                  <Button
                    variant="link"
                    className="w-full justify-start"
                    asChild
                  >
                    <Link href="/p">
                      <TableOfContents /> 글
                    </Link>
                  </Button>
                </DrawerClose>
              </li>
              {isLogin && (
                <li>
                  <DrawerClose asChild>
                    <PostWriteButton className="w-full justify-start" text />
                  </DrawerClose>
                </li>
              )}
              {isLogin && (
                <li>
                  <DrawerClose asChild>
                    <Button
                      variant="link"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link href="/p/mine">
                        <NotebookText /> 내 글
                      </Link>
                    </Button>
                  </DrawerClose>
                </li>
              )}
              {isLogin && isAdmin && (
                <li>
                  <DrawerClose asChild>
                    <Button
                      variant="link"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link href="/adm/members">
                        <MonitorCog /> 관리자 메뉴
                      </Link>
                    </Button>
                  </DrawerClose>
                </li>
              )}
              <li className="py-2">
                <Separator />
              </li>
              <li>
                <DrawerClose asChild>
                  <Button
                    variant="link"
                    className="w-full justify-start"
                    asChild
                  >
                    <Logo text />
                  </Button>
                </DrawerClose>
              </li>
              {!isLogin && (
                <li>
                  <DrawerClose asChild>
                    <LoginButton
                      className="w-full justify-start"
                      text="로그인"
                    />
                  </DrawerClose>
                </li>
              )}
              {isLogin && (
                <li>
                  <DrawerClose asChild>
                    <Button
                      variant="link"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link href="/members/me">
                        <User /> {loginMember.name}
                      </Link>
                    </Button>
                  </DrawerClose>
                </li>
              )}
              {isLogin && (
                <li>
                  <DrawerClose asChild>
                    <Button
                      variant="link"
                      className="w-full justify-start"
                      onClick={logout}
                    >
                      <LogOut /> 로그아웃
                    </Button>
                  </DrawerClose>
                </li>
              )}
            </ul>
          </div>
        </DrawerContent>
      </Drawer>

      <Button variant="link" asChild>
        <Logo />
      </Button>

      <div className="flex-grow flex items-center justify-center">
        {editPostId && (
          <Link
            href={`/p/${editPostId}/edit`}
            className="text-sm text-muted-foreground hover:underline"
          >
            #{editPostId}번 글
          </Link>
        )}
        <div data-header-slot="" />
      </div>

      {!isLogin && <LoginButton />}
      {isLogin && <MeMenuButton />}
      <ThemeToggleButton />
    </div>
  );
}
