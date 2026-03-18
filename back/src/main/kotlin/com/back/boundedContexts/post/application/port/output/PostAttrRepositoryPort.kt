package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import java.time.Instant

/**
 * `PostAttrRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostAttrRepositoryPort {
    fun findBySubjectAndName(
        subject: Post,
        name: String,
    ): PostAttr?

    fun findBySubjectInAndNameIn(
        subjects: List<Post>,
        names: List<String>,
    ): List<PostAttr>

    fun incrementIntValue(
        subject: Post,
        name: String,
        delta: Int = 1,
    ): Int

    fun findRecentlyModifiedByName(
        name: String,
        modifiedAfter: Instant,
        limit: Int,
    ): List<PostAttr>

    fun save(attr: PostAttr): PostAttr
}
