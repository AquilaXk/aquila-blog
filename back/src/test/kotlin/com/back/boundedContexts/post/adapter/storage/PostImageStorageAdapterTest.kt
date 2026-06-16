package com.back.boundedContexts.post.adapter.storage

import com.back.boundedContexts.post.config.PostImageStorageProperties
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class PostImageStorageAdapterTest {
    @Test
    fun `post object reader rejects keys outside configured post prefix before storage access`() {
        val adapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = false,
                    keyPrefix = "posts",
                ),
            )

        assertThatThrownBy {
            adapter.getPostImage("cloud/1/private/2026/06/leaked.png")
        }.hasMessageContaining("400-1")
            .hasMessageContaining("유효하지 않은 이미지 경로입니다.")
    }

    @Test
    fun `post object reader keeps configured post prefix keys on the normal storage path`() {
        val adapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = false,
                    keyPrefix = "posts",
                ),
            )

        assertThatThrownBy {
            adapter.getPostImage("posts/2026/06/image.png")
        }.hasMessageContaining("503-1")
            .hasMessageContaining("이미지 스토리지가 비활성화되어 있습니다.")
    }
}
