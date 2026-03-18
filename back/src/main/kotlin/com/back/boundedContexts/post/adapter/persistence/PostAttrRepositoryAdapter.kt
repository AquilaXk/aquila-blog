package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * PostAttrRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class PostAttrRepositoryAdapter(
    private val postAttrRepository: PostAttrRepository,
) : PostAttrRepositoryPort {
    override fun findBySubjectAndName(
        subject: Post,
        name: String,
    ): PostAttr? = postAttrRepository.findBySubjectAndName(subject, name)

    override fun findBySubjectInAndNameIn(
        subjects: List<Post>,
        names: List<String>,
    ): List<PostAttr> = postAttrRepository.findBySubjectInAndNameIn(subjects, names)

    override fun incrementIntValue(
        subject: Post,
        name: String,
        delta: Int,
    ): Int = postAttrRepository.incrementIntValue(subject, name, delta)

    override fun findRecentlyModifiedByName(
        name: String,
        modifiedAfter: Instant,
        limit: Int,
    ): List<PostAttr> = postAttrRepository.findRecentlyModifiedByName(name, modifiedAfter, limit)

    override fun save(attr: PostAttr): PostAttr = postAttrRepository.save(attr)
}
