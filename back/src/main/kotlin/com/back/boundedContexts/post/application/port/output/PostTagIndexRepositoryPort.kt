package com.back.boundedContexts.post.application.port.output

/**
 * - 역할: post 태그 인덱스 저장/집계 계약을 정의합니다.
 * - 목적: canonical post_tag_index를 원자적으로 교체하고 공개 태그를 DB 집계합니다.
 * - replacePostTags는 호출자 transaction에 참여하며 실패를 숨기지 않습니다.
 */
interface PostTagIndexRepositoryPort {
    data class TagCountRow(
        val tag: String,
        val count: Int,
    )

    data class LockedPostSource(
        val content: String,
        val deleted: Boolean,
    )

    /**
     * 현재 post source를 row lock 아래에서 읽는다.
     * 같은 transaction의 replacePostTags와 함께 사용해 stale task가 이전 content를 쓰지 않게 한다.
     */
    fun findPostSourceForUpdate(postId: Long): LockedPostSource?

    /**
     * empty tags는 이미 cascade로 삭제된 missing post에도 idempotent하게 성공한다.
     * non-empty tags의 missing post는 fail-closed한다.
     */
    fun replacePostTags(
        postId: Long,
        tags: List<String>,
    )

    fun findAllPublicTagCounts(): List<TagCountRow>
}
