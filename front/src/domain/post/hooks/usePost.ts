import { useEffect, useState } from "react";

import type { components } from "@/global/backend/apiV1/schema";
import client from "@/global/backend/client";
import { toast } from "sonner";

type PostWithContentDto = components["schemas"]["PostWithContentDto"];
type RsDataVoid = components["schemas"]["RsDataVoid"];

export default function usePost(id: number) {
  const [post, setPost] = useState<PostWithContentDto | null>(null);

  useEffect(() => {
    client
      .GET("/post/api/v1/posts/{id}", {
        params: {
          path: {
            id,
          },
        },
      })
      .then((res) => {
        if (res.error) {
          toast.error(res.error.msg);
          return;
        }

        setPost(res.data);
      });
  }, [id]);

  const deletePost = (id: number, onSuccess: () => void) => {
    client
      .DELETE("/post/api/v1/posts/{id}", {
        params: {
          path: {
            id,
          },
        },
      })
      .then((res) => {
        if (res.error) {
          toast.error(res.error.msg);
          return;
        }

        toast.success(res.data.msg);
        onSuccess();
      });
  };

  const modifyPost = (
    id: number,
    title: string,
    content: string,
    onSuccess: (res: RsDataVoid) => void,
    published?: boolean,
    listed?: boolean,
  ) => {
    client
      .PUT("/post/api/v1/posts/{id}", {
        params: {
          path: {
            id,
          },
        },
        body: {
          title,
          content,
          published: published ?? post?.published ?? false,
          listed: listed ?? post?.listed ?? false,
        },
      })
      .then((res) => {
        if (res.error) {
          toast.error(res.error.msg);
          return;
        }

        onSuccess(res.data);
      });
  };

  return {
    post,
    setPost,
    deletePost,
    modifyPost,
  };
}
