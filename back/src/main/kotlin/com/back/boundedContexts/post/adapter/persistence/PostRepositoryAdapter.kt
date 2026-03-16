package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Component
import java.util.Optional

@Component
class PostRepositoryAdapter(
    private val postRepository: PostRepository,
    private val postDeletedQueryRepository: PostDeletedQueryRepository,
) : PostRepositoryPort {
    override fun count(): Long = postRepository.count()

    override fun countByAuthor(author: Member): Long = postRepository.countByAuthor(author)

    override fun save(post: Post): Post = postRepository.save(post)

    override fun saveAndFlush(post: Post): Post = postRepository.saveAndFlush(post)

    override fun flush() = postRepository.flush()

    override fun findById(id: Int): Optional<Post> = postRepository.findById(id)

    override fun findFirstByOrderByIdDesc(): Post? = postRepository.findFirstByOrderByIdDesc()

    override fun findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(
        author: Member,
        title: String,
    ): Post? = postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author, title)

    override fun existsByAuthorAndTitle(
        author: Member,
        title: String,
    ): Boolean = postRepository.existsByAuthorAndTitle(author, title)

    override fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByKw(kw, pageable)

    override fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByKwForAdmin(kw, pageable)

    override fun findDeletedPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<AdmDeletedPostDto> = postDeletedQueryRepository.findDeletedPagedByKw(kw, pageable)

    override fun findDeletedSnapshotById(id: Int): AdmDeletedPostSnapshotDto? = postDeletedQueryRepository.findDeletedSnapshotById(id)

    override fun restoreDeletedById(id: Int): Boolean = postDeletedQueryRepository.restoreDeletedById(id)

    override fun hardDeleteDeletedById(id: Int): Boolean = postDeletedQueryRepository.hardDeleteDeletedById(id)

    override fun findQPagedByAuthorAndKw(
        author: Member,
        kw: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByAuthorAndKw(author, kw, pageable)

    override fun findQPagedByKwAndTag(
        kw: String,
        tag: String,
        pageable: Pageable,
    ): Page<Post> = postRepository.findQPagedByKwAndTag(kw, tag, pageable)

    override fun findAllPublicListedContents(): List<String> = postRepository.findAllPublicListedContents()

    override fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String> =
        postRepository.findAllPublicListedTagIndexes(tagIndexAttrName)

    override fun existsByIdAndContentContaining(
        id: Int,
        contentFragment: String,
    ): Boolean = postRepository.existsByIdAndContentContaining(id, contentFragment)

    override fun existsByContentContaining(contentFragment: String): Boolean = postRepository.existsByContentContaining(contentFragment)
}
