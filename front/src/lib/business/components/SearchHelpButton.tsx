"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { HelpCircle } from "lucide-react";

const ROWS = [
  {
    syntax: "키워드",
    example: "스프링",
    desc: "키워드를 포함한 글",
  },
  {
    syntax: "A B (공백 = AND)",
    example: "스프링 부트",
    desc: "두 단어를 모두 포함한 글",
  },
  {
    syntax: "A OR B",
    example: "파이썬 OR 자바",
    desc: "둘 중 하나라도 포함한 글",
  },
  {
    syntax: "-키워드",
    example: "자바 -코틀린",
    desc: "자바 포함, 코틀린 제외한 글",
  },
  {
    syntax: '"A B" (따옴표 = 구문)',
    example: '"스프링 부트"',
    desc: "두 단어가 연속으로 붙어 있는 글",
  },
  {
    syntax: "word* (영문 전위)",
    example: "spring*",
    desc: "spring으로 시작하는 단어 포함 (영문만)",
  },
  {
    syntax: "복합",
    example: "(파이썬 OR 자바) -코틀린",
    desc: "파이썬 또는 자바 포함, 코틀린 제외",
  },
];

export default function SearchHelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="검색 도움말"
      >
        <HelpCircle className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>검색 문법 안내</DialogTitle>
          </DialogHeader>
          {/* 모바일: 카드 리스트 */}
          <div className="sm:hidden divide-y">
            {ROWS.map((row) => (
              <div key={row.syntax} className="flex items-start gap-3 py-3">
                <code className="shrink-0 bg-muted px-2 py-0.5 rounded text-xs font-mono">
                  {row.example}
                </code>
                <div className="min-w-0">
                  <p className="text-sm">{row.desc}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {row.syntax}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 데스크탑: 테이블 */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground whitespace-nowrap">
                    문법
                  </th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground whitespace-nowrap">
                    예시
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    설명
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.syntax} className="border-b last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {row.syntax}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                        {row.example}
                      </code>
                    </td>
                    <td className="py-2">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
