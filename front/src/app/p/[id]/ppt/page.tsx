import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

interface PptItem {
  pptId: string;
  title: string;
}

function extractPptList(content: string): PptItem[] {
  const pattern =
    /<details[^>]*\bppt-id\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<summary[^>]*>([^<]+)<\/summary>/g;
  const results: PptItem[] = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    results.push({
      pptId: match[1],
      title: match[2].trim(),
    });
  }

  return results;
}

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

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const post = await getPost(id);

  if (!post) {
    return (
      <div className="p-4">
        <p className="text-red-500">글을 찾을 수 없습니다.</p>
        <Link href="/p" className="text-blue-500 hover:underline">
          목록으로
        </Link>
      </div>
    );
  }

  const pptList = extractPptList(post.content);

  if (pptList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 p-10 text-center">
        이 문서에는 PPT가 없습니다. <br />
        <Link href={`/p/${id}`} className="text-blue-500 hover:underline">
          돌아가기
        </Link>
      </div>
    );
  }

  // PPT가 1개면 바로 리다이렉트
  if (pptList.length === 1) {
    redirect(`/p/${id}/ppt/${pptList[0].pptId}`);
  }

  // 여러 PPT가 있으면 목록 표시
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">{post.title} - PPT 목록</h1>

      <ul className="space-y-2">
        {pptList.map((ppt) => (
          <li key={ppt.pptId}>
            <Link
              href={`/p/${id}/ppt/${ppt.pptId}`}
              className="text-blue-500 hover:underline"
            >
              {ppt.title}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Link href={`/p/${id}`} className="text-gray-500 hover:underline">
          ← 돌아가기
        </Link>
      </div>
    </div>
  );
}
