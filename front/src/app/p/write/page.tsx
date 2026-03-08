"use client";

import { useRouter } from "next/navigation";

import { useEffect } from "react";

import withLogin from "@/global/auth/hoc/withLogin";
import client from "@/global/backend/client";
import { toast } from "sonner";

// write 페이지는 임시글 생성 후 edit 페이지로 리다이렉트
export default withLogin(function Page() {
  const router = useRouter();

  useEffect(() => {
    const createTemp = async () => {
      const response = await client.POST("/post/api/v1/posts/temp");

      if (response.error) {
        toast.error(response.error.msg);
        router.replace("/p");
        return;
      }

      toast(response.data.msg);
      router.replace(`/p/${response.data.data.id}/edit`);
    };

    createTemp();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-muted-foreground">글 준비 중...</div>
    </div>
  );
});
