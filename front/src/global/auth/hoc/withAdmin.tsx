"use client";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

export default function withAdmin<P extends object>(
  Component: React.ComponentType<P>,
) {
  return function WithAdminComponent(props: P) {
    const { isLogin, isAdmin } = useAuthContext();

    if (!isLogin) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
          <span className="text-lg font-medium">로그인 후 이용해주세요.</span>
        </div>
      );
    }

    if (!isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
          <span className="text-lg font-medium">관리자 권한이 없습니다.</span>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
