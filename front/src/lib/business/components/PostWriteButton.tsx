"use client";

import { useRouter } from "next/navigation";

import { ButtonHTMLAttributes } from "react";

import client from "@/global/backend/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Pencil } from "lucide-react";

interface PostWriteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  text?: boolean;
}

const PostWriteButton = ({
  className,
  text,
  onClick,
  ...props
}: PostWriteButtonProps) => {
  const router = useRouter();
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }

    const response = await client.POST("/post/api/v1/posts/temp");

    if (response.error) {
      toast.error(response.error.msg);
    } else {
      toast(response.data.msg);
      router.push(`/p/${response.data.data.id}/edit`);
    }
  };

  return (
    <Button
      className={className}
      variant="link"
      onClick={handleClick}
      {...props}
    >
      <Pencil />
      {text && "작성"}
    </Button>
  );
};

PostWriteButton.displayName = "PostWriteButton";

export default PostWriteButton;
