"use client";

import { useRouter } from "next/navigation";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

import { Button } from "@/components/ui/button";

import { LogOut } from "lucide-react";

export default function withLogout<P extends object>(
  Component: React.ComponentType<P>,
) {
  return function WithLogoutComponent(props: P) {
    const { isLogin, logout } = useAuthContext();
    const router = useRouter();

    if (isLogin) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
          <span className="text-lg font-medium">이미 로그인 되었습니다.</span>
          <Button
            variant="outline"
            onClick={() => logout(() => router.replace("/"))}
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </Button>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
