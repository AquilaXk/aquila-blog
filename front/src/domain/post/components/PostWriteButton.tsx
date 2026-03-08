"use client";

import { useRouter } from "next/navigation";

import { ComponentProps, useState } from "react";

import client from "@/global/backend/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { PenSquare } from "lucide-react";

interface PostWriteButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick"
> {
  text?: string;
  showIcon?: boolean;
}

export default function PostWriteButton({
  text = "글쓰기",
  showIcon = true,
  variant = "outline",
  children,
  disabled,
  ...props
}: PostWriteButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const response = await client.POST("/post/api/v1/posts/temp");

      if (response.error) {
        toast.error(response.error.msg);
        return;
      }

      toast(response.data.msg);
      router.push(`/p/${response.data.data.id}/edit`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      onClick={handleClick}
      disabled={disabled || isLoading}
      {...props}
    >
      {showIcon && <PenSquare className="w-4 h-4" />}
      {children || (isLoading ? "로딩..." : text)}
    </Button>
  );
}
