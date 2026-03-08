"use client";

import Link from "next/link";

import { Triangle } from "lucide-react";

export default function Logo({ text, ...props }: { text?: boolean }) {
  return (
    <Link href="/" {...props}>
      <Triangle /> {text && <span>슬로그</span>}
    </Link>
  );
}
