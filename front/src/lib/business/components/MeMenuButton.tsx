"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { LogOut, MonitorCog, User } from "lucide-react";

export default function MeMenuButton() {
  const { loginMember, isAdmin, logout: _logout } = useAuthContext();
  const router = useRouter();
  const logout = () => {
    _logout(() => router.replace("/"));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="link">
          <Image
            className="w-[32px] h-[32px] object-cover rounded-full"
            src={loginMember.profileImageUrl}
            alt={loginMember.name}
            width={32}
            height={32}
            unoptimized
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/members/me" className="flex items-center gap-2">
            <User className="w-4 h-4" /> {loginMember.name}
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link
              href="/adm/members"
              className="flex items-center gap-2 w-full"
            >
              <MonitorCog className="w-4 h-4" /> 관리자 메뉴
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={logout} className="flex items-center gap-2">
          <LogOut className="w-4 h-4" /> 로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
