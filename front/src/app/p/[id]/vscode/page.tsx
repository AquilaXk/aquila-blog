"use client";

import { useTheme } from "next-themes";

import { useRouter } from "next/navigation";

import { use, useEffect, useRef, useState } from "react";

import usePost from "@/domain/post/hooks/usePost";
import withLogin from "@/global/auth/hoc/withLogin";
import client from "@/global/backend/client";
import { toast } from "sonner";

import HeaderActionSlot from "@/lib/business/components/HeaderActionSlot";
import MonacoEditor from "@/lib/business/components/MonacoEditor";

import { Button } from "@/components/ui/button";

import { ArrowLeft, Save } from "lucide-react";

interface Config {
  title?: string;
  published?: boolean;
  listed?: boolean;
  [key: string]: string | boolean | undefined;
}

function parseConfig(content: string): {
  title: string;
  published: boolean;
  listed: boolean;
  content: string;
} {
  let configSection = "";
  let mainContent = content;

  // 1. $$config 확인
  if (content.startsWith("$$config")) {
    const configEndIndex = content.indexOf("$$", 2);
    if (configEndIndex !== -1) {
      configSection = content.substring(8, configEndIndex);
      // 기존 로직 유지: $$ 뒤의 4글자(아마도 \n\n)를 건너뜀
      mainContent = content.substring(configEndIndex + 4);
    }
  }
  // 2. ```yml 확인
  else if (content.startsWith("```yml")) {
    const configEndIndex = content.indexOf("```", 6);
    if (configEndIndex !== -1) {
      configSection = content.substring(6, configEndIndex);
      // ``` 뒤의 내용으로 본문 설정 (줄바꿈 처리)
      mainContent = content.substring(configEndIndex + 3);
    }
  }

  // config 섹션이 없는 경우
  if (!configSection) {
    return {
      title: "",
      published: false,
      listed: false,
      content: content.trim(),
    };
  }

  // config 파싱
  const configLines = configSection.split("\n");
  const config: Config = {};

  configLines.forEach((line) => {
    const [key, value] = line.split(": ").map((s) => s.trim());
    if (key === "published" || key === "listed") {
      config[key] = value === "true";
    } else {
      config[key] = value;
    }
  });

  return {
    title: config.title?.trim() || "",
    published: config.published || false,
    listed: config.listed || false,
    content: mainContent.trim(),
  };
}

export default withLogin(function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const { id: idStr } = use(params);
  const id = parseInt(idStr);

  const { post } = usePost(id);

  const [initialContent, setInitialContent] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const contentRef = useRef("");

  useEffect(() => {
    if (post) {
      if (isFirstLoad.current) {
        const content = `\`\`\`yml
title: ${post.title}
published: ${post.published}
listed: ${post.listed}
\`\`\`

${post.content || ""}`.trim();
        setInitialContent(content);
        contentRef.current = content;
        isFirstLoad.current = false;
      }
    }
  }, [post]);

  const handleEditorChange = (value: string) => {
    contentRef.current = value;
  };

  const savePostRef = useRef<((value: string) => void) | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.code === "KeyS")) {
        e.preventDefault();
        savePostRef.current?.(contentRef.current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const savePost = async (value: string) => {
    if (!post) return;
    try {
      if (initialContent !== null && value.trim() === initialContent.trim()) {
        toast.info("변경사항이 없습니다.");
        return;
      }

      const { title, published, listed, content } = parseConfig(value.trim());

      const response = await client.PUT("/post/api/v1/posts/{id}", {
        params: {
          path: {
            id: post.id,
          },
        },
        body: {
          title: title,
          content: content,
          published: published,
          listed: listed,
        },
      });

      if (response.error) {
        toast.error(response.error.msg);
        return;
      }

      if (response.data) {
        toast.success(response.data.msg);
        setInitialContent(value);
      }
    } catch {
      toast.error("저장 실패");
    }
  };
  savePostRef.current = savePost;

  return (
    <div className="flex flex-col flex-1 w-full min-h-0">
      <HeaderActionSlot>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="font-semibold">에디터</span>
            <span className="text-muted-foreground">(Ctrl+S로 저장)</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => savePost(contentRef.current)}
          >
            <Save className="w-4 h-4 mr-2" />
            저장
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/p/${id}/edit`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
      </HeaderActionSlot>

      {post == null && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-muted-foreground">로딩중...</div>
        </div>
      )}

      {post != null && !initialContent && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-muted-foreground">에디터 준비중...</div>
        </div>
      )}

      {post != null && initialContent && (
        <div className="flex-1 flex overflow-hidden">
          <MonacoEditor
            theme={resolvedTheme as "light" | "dark"}
            initialValue={initialContent}
            onSave={savePost}
            onChange={handleEditorChange}
            className="flex-1"
          />
        </div>
      )}
    </div>
  );
});
