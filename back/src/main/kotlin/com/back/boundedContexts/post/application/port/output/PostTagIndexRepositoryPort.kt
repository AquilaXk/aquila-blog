package com.back.boundedContexts.post.application.port.output

/**
 * `PostTagIndexRepositoryPort` 인터페이스입니다.
 * - 역할: post 태그 인덱스 저장/집계 계약을 정의합니다.
 * - 목적: 공개 태그 집계를 본문 스캔 없이 DB 집계로 처리합니다.
 */
interface PostTagIndexRepositoryPort {
    data class TagCountRow(
        val tag: String,
        val count: Int,
    )

    fun replacePostTags(
        postId: Long,
        tags: List<String>,
    )

    fun findAllPublicTagCounts(): List<TagCountRow>
}
