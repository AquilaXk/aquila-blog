import { createContext, use, useEffect, useState } from "react";

import client from "@/global/backend/client";
import { toast } from "sonner";

// LoginMember와 MemberWithUsernameDto 공통 필드
type LoginMember = {
  id: number;
  createdAt: string;
  modifiedAt: string;
  name: string;
  profileImageUrl: string;
  isAdmin: boolean;
};

export default function useAuth() {
  const [loginMember, setLoginMember] = useState<LoginMember>(
    null as unknown as LoginMember,
  );
  const [isPending, setIsPending] = useState(true);
  const isLogin = loginMember !== null;
  const isAdmin = isLogin && loginMember.isAdmin;

  useEffect(() => {
    client.GET("/member/api/v1/auth/me", {}).then((res) => {
      if (res.error) {
        setIsPending(false);
        return;
      }

      setLoginMember(res.data);
      setIsPending(false);
    });
  }, []);

  const clearLoginMember = () => {
    setLoginMember(null as unknown as LoginMember);
  };

  const logout = (onSuccess: () => void) => {
    client.DELETE("/member/api/v1/auth/logout", {}).then((res) => {
      if (res.error) {
        toast.error(res.error.msg);
        return;
      }

      clearLoginMember();

      onSuccess();
    });
  };

  return {
    isLogin,
    isAdmin,
    isPending,
    loginMember,
    logout,
    setLoginMember,
    clearLoginMember,
  };
}

export const AuthContext = createContext<ReturnType<typeof useAuth>>(
  null as unknown as ReturnType<typeof useAuth>,
);

export function AuthProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authState = useAuth();

  return <AuthContext value={authState}>{children}</AuthContext>;
}

export function useAuthContext() {
  const authState = use(AuthContext);

  if (authState === null) throw new Error("AuthContext is not found");

  return authState;
}
