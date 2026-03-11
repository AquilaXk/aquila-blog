package com.back.boundedContexts.post.app

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.*
import com.back.boundedContexts.post.out.PostAttrRepository
import com.back.boundedContexts.post.out.PostCommentRepository
import com.back.boundedContexts.post.out.PostLikeRepository
import com.back.boundedContexts.post.out.PostRepository
import com.back.global.event.app.EventPublisher
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*
import kotlin.jvm.optionals.getOrNull

@Service
class PostFacade(
    private val postRepository: PostRepository,
    private val postAttrRepository: PostAttrRepository,
    private val postCommentRepository: PostCommentRepository,
    private val postLikeRepository: PostLikeRepository,
    private val eventPublisher: EventPublisher,
) {
    fun count(): Long = postRepository.count()

    @Transactional
    fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean = false,
        listed: Boolean = false,
    ): Post {
        syncDomainRepositories()
        val post = Post(0, author, title, content, published, listed)
        val savedPost = postRepository.saveAndFlush(post)
        author.incrementPostsCount()

        eventPublisher.publish(
            PostWrittenEvent(UUID.randomUUID(), PostDto(savedPost), MemberDto(author))
        )

        return savedPost
    }

    fun findById(id: Int): Post? = postRepository.findById(id).getOrNull()

    fun findLatest(): Post? = postRepository.findFirstByOrderByIdDesc()

    @Transactional
    fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
    ) {
        post.modify(title, content, published, listed)
        postRepository.flush()

        eventPublisher.publish(
            PostModifiedEvent(UUID.randomUUID(), PostDto(post), MemberDto(actor))
        )
    }

    @Transactional
    fun delete(post: Post, actor: Member) {
        val postDto = PostDto(post)

        eventPublisher.publish(
            PostDeletedEvent(UUID.randomUUID(), postDto, MemberDto(actor))
        )

        post.author.decrementPostsCount()
        post.softDelete()
    }

    @Transactional
    fun writeComment(author: Member, post: Post, content: String): PostComment {
        syncDomainRepositories()
        val comment = post.addComment(author, content)
        author.incrementPostCommentsCount()
        postRepository.flush()

        eventPublisher.publish(
            PostCommentWrittenEvent(UUID.randomUUID(), PostCommentDto(comment), PostDto(post), MemberDto(author))
        )

        return comment
    }

    @Transactional
    fun modifyComment(postComment: PostComment, actor: Member, content: String) {
        postComment.modify(content)

        eventPublisher.publish(
            PostCommentModifiedEvent(
                UUID.randomUUID(),
                PostCommentDto(postComment),
                PostDto(postComment.post),
                MemberDto(actor)
            )
        )
    }

    @Transactional
    fun deleteComment(post: Post, postComment: PostComment, actor: Member) {
        syncDomainRepositories()
        val postCommentDto = PostCommentDto(postComment)
        val postDto = PostDto(post)

        postComment.author.decrementPostCommentsCount()
        post.deleteComment(postComment)

        eventPublisher.publish(
            PostCommentDeletedEvent(UUID.randomUUID(), postCommentDto, postDto, MemberDto(actor))
        )
    }

    @Transactional
    fun toggleLike(post: Post, actor: Member): PostLikeToggleResult {
        syncDomainRepositories()
        val likeResult = post.toggleLike(actor)
        postRepository.flush()

        eventPublisher.publish(
            if (likeResult.isLiked)
                PostLikedEvent(UUID.randomUUID(), post.id, post.author.id, likeResult.likeId, MemberDto(actor))
            else
                PostUnlikedEvent(UUID.randomUUID(), post.id, post.author.id, likeResult.likeId, MemberDto(actor))
        )

        return likeResult
    }

    @Transactional
    fun incrementHit(post: Post) {
        syncDomainRepositories()
        post.incrementHitCount()
    }

    fun findLikedPostIds(liker: Member?, posts: List<Post>): Set<Int> {
        if (liker == null || posts.isEmpty()) return emptySet()
        return postLikeRepository
            .findByLikerAndPostIn(liker, posts)
            .map { it.post.id }
            .toSet()
    }

    fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> = postRepository.findQPagedByKw(
        kw,
        PageRequest.of(page - 1, pageSize, sort.sortBy)
    )

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> = postRepository.findQPagedByKwForAdmin(
        kw,
        PageRequest.of(page - 1, pageSize, sort.sortBy)
    )

    fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> = postRepository.findQPagedByAuthorAndKw(
        author,
        kw,
        PageRequest.of(page - 1, pageSize, sort.sortBy)
    )

    fun findTemp(author: Member): Post? =
        postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author, "임시글")

    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> {
        syncDomainRepositories()
        val existingTemp = findTemp(author)
        if (existingTemp != null) return existingTemp to false

        val newPost = Post(0, author, "임시글", "임시글 입니다.")
        return postRepository.save(newPost) to true
    }

    private fun syncDomainRepositories() {
        Post.attrRepository_ = postAttrRepository
        Post.commentRepository_ = postCommentRepository
        Post.likeRepository_ = postLikeRepository
    }
}
