"use client";

import { Button } from "@/components/ui/button";

import { LogIn } from "lucide-react";

export default function LoginButton({
  variant,
  className,
  text,
}: {
  variant?:
    | "link"
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | null
    | undefined;
  className?: string;
  text?: string | boolean;
}) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL as string;
  const frontendBaseUrl = process.env.NEXT_PUBLIC_FRONTEND_BASE_URL as string;
  const redirectUrl = encodeURIComponent(`${frontendBaseUrl}/members/me`);
  const kakaoLoginUrl = `${apiBaseUrl}/oauth2/authorization/kakao?redirectUrl=${redirectUrl}`;

  if (!variant) variant = "link";
  if (typeof text === "boolean") text = "로그인";

  return (
    <Button variant={variant} className={className} asChild>
      <a href={kakaoLoginUrl}>
        <LogIn />
        {text && <span>{text}</span>}
      </a>
    </Button>
  );
}
