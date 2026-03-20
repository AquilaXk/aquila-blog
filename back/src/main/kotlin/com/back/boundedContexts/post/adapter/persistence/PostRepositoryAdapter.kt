package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Component
import java.util.Optional

/**
 * PostRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
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

    override fun findById(id: Long): Optional<Post> = postRepository.findById(id)

    override fun findFirstByOrderByIdDesc(): Post? = postRepository.findFirstByOrderByIdDesc()

    override fun findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(
        author: Member,
        title: String,
    ): Post? = postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author, title)

    override fun existsByAuthorAndTitle(
        author: Member,
        title: String,
    ): Boolean = postRepository.existsByAuthorAndTitle(author, title)

    override fun findQPagedByKw(query: PostRepositoryPort.PagedQuery): PostRepositoryPort.PagedResult<Post> {
        val pageable = query.toPageRequest()
        val page = postRepository.findQPagedByKw(query.kw, pageable)
        return PostRepositoryPort.PagedResult(content = page.content, totalElements = page.totalElements)
    }

    override fun findQPagedByKwForAdmin(query: PostRepositoryPort.PagedQuery): PostRepositoryPort.PagedResult<Post> {
        val pageable = query.toPageRequest()
        val page = postRepository.findQPagedByKwForAdmin(query.kw, pageable)
        return PostRepositoryPort.PagedResult(content = page.content, totalElements = page.totalElements)
    }

    override fun findDeletedPagedByKw(query: PostRepositoryPort.DeletedPagedQuery): PostRepositoryPort.PagedResult<AdmDeletedPostDto> {
        val pageable = PageRequest.of(query.zeroBasedPage, query.pageSize)
        val page = postDeletedQueryRepository.findDeletedPagedByKw(query.kw, pageable)
        return PostRepositoryPort.PagedResult(content = page.content, totalElements = page.totalElements)
    }

    override fun findDeletedSnapshotById(id: Long): AdmDeletedPostSnapshotDto? = postDeletedQueryRepository.findDeletedSnapshotById(id)

    override fun softDeleteById(id: Long): Boolean = postDeletedQueryRepository.softDeleteById(id)

    override fun restoreDeletedById(id: Long): Boolean = postDeletedQueryRepository.restoreDeletedById(id)

    override fun hardDeleteDeletedById(id: Long): Boolean = postDeletedQueryRepository.hardDeleteDeletedById(id)

    override fun findQPagedByAuthorAndKw(
        author: Member,
        query: PostRepositoryPort.PagedQuery,
    ): PostRepositoryPort.PagedResult<Post> {
        val pageable = query.toPageRequest()
        val page = postRepository.findQPagedByAuthorAndKw(author, query.kw, pageable)
        return PostRepositoryPort.PagedResult(content = page.content, totalElements = page.totalElements)
    }

    override fun findQPagedByKwAndTag(query: PostRepositoryPort.TaggedPagedQuery): PostRepositoryPort.PagedResult<Post> {
        val pageable = query.toPageRequest()
        val page = postRepository.findQPagedByKwAndTag(query.kw, query.tag, pageable)
        return PostRepositoryPort.PagedResult(content = page.content, totalElements = page.totalElements)
    }

    override fun findAllPublicListedContents(): List<String> = postRepository.findAllPublicListedContents()

    override fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String> =
        postRepository.findAllPublicListedTagIndexes(tagIndexAttrName)

    override fun existsByIdAndContentContaining(
        id: Long,
        contentFragment: String,
    ): Boolean = postRepository.existsByIdAndContentContaining(id, contentFragment)

    override fun existsByContentContaining(contentFragment: String): Boolean = postRepository.existsByContentContaining(contentFragment)

    private fun PostRepositoryPort.PagedQuery.toPageRequest(): PageRequest =
        PageRequest.of(
            zeroBasedPage,
            pageSize,
            Sort.by(if (sortAscending) Sort.Direction.ASC else Sort.Direction.DESC, sortProperty),
        )

    private fun PostRepositoryPort.TaggedPagedQuery.toPageRequest(): PageRequest =
        PageRequest.of(
            zeroBasedPage,
            pageSize,
            Sort.by(if (sortAscending) Sort.Direction.ASC else Sort.Direction.DESC, sortProperty),
        )
}
