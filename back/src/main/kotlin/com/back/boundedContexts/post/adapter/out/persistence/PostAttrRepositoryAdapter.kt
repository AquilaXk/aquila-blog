package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.post.application.port.out.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import org.springframework.stereotype.Component
import java.time.Instant

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
