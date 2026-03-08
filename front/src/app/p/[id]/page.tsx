import { cookies } from "next/headers";

import client from "@/global/backend/client";
import type { Metadata } from "next";

import {
  getSummaryFromContent,
  stripMarkdown,
} from "@/lib/business/markdownUtils";

import ClientPage from "./ClientPage";

async function getPost(id: number) {
  const res = await client.GET("/post/api/v1/posts/{id}", {
    params: {
      path: {
        id,
      },
    },
    headers: {
      cookie: (await cookies()).toString(),
    },
  });

  return res;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const postResponse = await getPost(parseInt(id));

  if (postResponse.error) {
    return {
      title: postResponse.error.msg,
      description: postResponse.error.msg,
    };
  }

  const post = postResponse.data;
  const summary = getSummaryFromContent(post.content);

  return {
    title: `${post.id} - ${post.title}`,
    description: summary || stripMarkdown(post.content),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postResponse = await getPost(parseInt(id));

  if (postResponse.error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {postResponse.error.msg}
      </div>
    );
  }

  return <ClientPage initialPost={postResponse.data} />;
}
