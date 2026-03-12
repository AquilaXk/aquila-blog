package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.out.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Component
import java.util.Optional

@Component
class PostRepositoryAdapter(
    private val postRepository: PostRepository,
) : PostRepositoryPort {
    override fun count(): Long = postRepository.count()

    override fun save(post: Post): Post = postRepository.save(post)

    override fun saveAndFlush(post: Post): Post = postRepository.saveAndFlush(post)

    override fun flush() = postRepository.flush()

    override fun findById(id: Int): Optional<Post> = postRepository.findById(id)

    override fun findFirstByOrderByIdDesc(): Post? = postRepository.findFirstByOrderByIdDesc()

    override fun findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(
        author: Member,
        title: String,
    ): Post? = postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author, title)

    override fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByKw(kw, pageable)

    override fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByKwForAdmin(kw, pageable)

    override fun findQPagedByAuthorAndKw(
        author: Member,
        kw: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByAuthorAndKw(author, kw, pageable)

    override fun existsByContentContaining(contentFragment: String): Boolean =
        postRepository.existsByContentContaining(contentFragment)
}
