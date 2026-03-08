import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const post = await getPost(id);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const filename = `Doc ${id} - ${post.title}.md`;
  const encodedFilename = encodeURIComponent(filename);

  return new NextResponse(post.content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
