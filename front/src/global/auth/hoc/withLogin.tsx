"use client";

import { useAuthContext } from "@/global/auth/hooks/useAuth";

export default function withLogin<P extends object>(
  Component: React.ComponentType<P>,
) {
  return function WithLoginComponent(props: P) {
    const { isLogin } = useAuthContext();

    if (!isLogin) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
          <span className="text-lg font-medium">로그인 후 이용해주세요.</span>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
