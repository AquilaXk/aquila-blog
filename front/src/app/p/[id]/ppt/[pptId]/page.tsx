import { cookies } from "next/headers";
import Link from "next/link";

import ClientPage from "../ClientPage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

async function getPost(id: number) {
  const cookieStore = await cookies();
  const response = await fetch(`${API_BASE_URL}/post/api/v1/posts/${id}`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function extractPptContent(
  content: string,
  pptId: string,
): { title: string; markdown: string } | null {
  const escapedId = pptId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // SLOG 방식: <div markdown="1"> 안에 내용
  const patternWithDiv = new RegExp(
    `<details[^>]*\\bppt-id\\s*=\\s*["']${escapedId}["'][^>]*>[\\s\\S]*?<summary>\\s*(.*?)\\s*</summary>[\\s\\S]*?<div[^>]*markdown=["']1["'][^>]*>([\\s\\S]*?)</div>`,
    "i",
  );
  let match = content.match(patternWithDiv);

  // 기본 방식: details 내 직접 내용
  if (!match) {
    const patternDirect = new RegExp(
      `<details[^>]*\\bppt-id\\s*=\\s*["']${escapedId}["'][^>]*>[\\s\\S]*?<summary[^>]*>([^<]+)</summary>([\\s\\S]*?)</details>`,
    );
    match = content.match(patternDirect);
  }

  if (!match) return null;

  const title = match[1].trim();
  let markdown = match[2].trim();

  // 끝에 있는 빈 슬라이드 구분자 제거 (---\n\n 또는 ---만 있는 경우)
  markdown = markdown.replace(/\n---\s*$/, "");

  return { title, markdown };
}

function stripMarpFrontMatter(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return normalized;

  const header = match[1];
  if (/\bmarp\s*:/i.test(header)) {
    return normalized.slice(match[0].length);
  }

  return normalized;
}

function splitSlides(content: string): string[] {
  const normalized = stripMarpFrontMatter(content).trim();
  if (!normalized) return [];

  const slides = normalized
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return slides;
}

/**
 * PPT 슬라이드에서 다이어그램을 가로 방향(LR)으로 자동 변환
 * - PlantUML: @startuml 뒤에 left to right direction 주입
 * - Mermaid stateDiagram / flowchart: direction LR 주입
 * 이미 방향이 지정된 경우는 건드리지 않음
 */
function applyHorizontalDiagramDirection(slide: string): string {
  let result = slide;

  // PlantUML: @startuml 뒤에 left to right direction 주입
  result = result.replace(
    /(@startuml\b[^\n]*\n)(?![\s\S]*?left to right direction)/gi,
    "$1left to right direction\n",
  );

  // Mermaid stateDiagram: direction LR 주입
  result = result.replace(
    /(```mermaid\s*\n\s*stateDiagram(?:-v2)?\s*\n)(?!\s*direction\s)/gi,
    "$1    direction LR\n",
  );

  // Mermaid flowchart: TD→LR 변환 비활성화
  // mermaid.ink SVG에서 LR flowchart의 왼쪽 노드가 viewBox 밖으로
  // 배치되는 버그가 있어 원래 방향을 유지한다

  return result;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; pptId: string }>;
}) {
  const { id, pptId } = await params;
  const post = await getPost(parseInt(id));

  if (!post) {
    return { title: "Error - PPT" };
  }

  const pptData = extractPptContent(post.content, pptId);
  const title = pptData?.title || post.title;

  return {
    title: `Doc ${id} - ${title}`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; pptId: string }>;
}) {
  const { id: idStr, pptId } = await params;
  const id = parseInt(idStr);

  const post = await getPost(id);

  if (!post) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-500">글을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const pptData = extractPptContent(post.content, pptId);

  if (!pptData) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500">
        PPT를 찾을 수 없습니다: {pptId}
        <br />
        <Link href={`/p/${id}`} className="text-blue-500 hover:underline">
          돌아가기
        </Link>
      </div>
    );
  }

  const slides = splitSlides(pptData.markdown).map(
    applyHorizontalDiagramDirection,
  );

  if (slides.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500">
        PPT 내용을 찾을 수 없습니다: {pptId}
        <br />
        <Link href={`/p/${id}`} className="text-blue-500 hover:underline">
          돌아가기
        </Link>
      </div>
    );
  }

  return <ClientPage postId={id} pptTitle={pptData.title} slides={slides} />;
}
