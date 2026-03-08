package com.back.boundedContexts.post.app

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.out.PostLikeRepository
import com.back.boundedContexts.post.out.PostRepository
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import kotlin.jvm.optionals.getOrNull

@Service
class PostFacade(
    private val postRepository: PostRepository,
    private val postLikeRepository: PostLikeRepository,
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
        val post = Post(0, author, title, content, published, listed)
        postRepository.save(post)
        author.incrementPostsCount()
        return post
    }

    fun findById(id: Int): Post? = postRepository.findById(id).getOrNull()

    fun findLatest(): Post? = postRepository.findFirstByOrderByIdDesc()

    @Transactional
    fun modify(
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
    ) {
        post.modify(title, content, published, listed)
        postRepository.flush()
    }

    @Transactional
    fun delete(post: Post) {
        post.author.decrementPostsCount()
        post.softDelete()
    }

    @Transactional
    fun writeComment(author: Member, post: Post, content: String): PostComment {
        val comment = post.addComment(author, content)
        author.incrementPostCommentsCount()
        return comment
    }

    @Transactional
    fun modifyComment(postComment: PostComment, content: String) {
        postComment.modify(content)
    }

    @Transactional
    fun deleteComment(post: Post, postComment: PostComment) {
        postComment.author.decrementPostCommentsCount()
        post.deleteComment(postComment)
    }

    @Transactional
    fun toggleLike(post: Post, actor: Member): PostLikeToggleResult {
        return post.toggleLike(actor)
    }

    @Transactional
    fun incrementHit(post: Post) {
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
        val existingTemp = findTemp(author)
        if (existingTemp != null) return existingTemp to false

        val newPost = Post(0, author, "임시글", "임시글 입니다.")
        return postRepository.save(newPost) to true
    }
}
