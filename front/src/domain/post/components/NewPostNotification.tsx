"use client";

import Image from "next/image";
import Link from "next/link";

import { useState } from "react";

import {
  PostNotification,
  useNewPostNotification,
} from "@/domain/post/hooks/useNewPostNotification";

import { Button } from "@/components/ui/button";

import { Bell, X } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

function getImageUrl(path: string | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

export default function NewPostNotification() {
  const [notification, setNotification] = useState<PostNotification | null>(
    null,
  );

  useNewPostNotification((post) => {
    setNotification(post);
  });

  if (!notification) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border shadow-lg rounded-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              새 글이 등록됨
            </p>
            <Link
              href={`/p/${notification.id}`}
              className="text-sm text-muted-foreground hover:text-primary line-clamp-2 mt-1 block"
              onClick={() => setNotification(null)}
            >
              {notification.title}
            </Link>
            <div className="flex items-center gap-2 mt-2">
              <Image
                src={
                  getImageUrl(notification.authorProfileImgUrl) ||
                  "/default-avatar.png"
                }
                alt={notification.authorName}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full object-cover"
                unoptimized
              />
              <span className="text-xs text-muted-foreground">
                {notification.authorName}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-6 w-6"
            onClick={() => setNotification(null)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
