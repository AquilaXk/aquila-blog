package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment

private const val COMMENTS_COUNT = "commentsCount"
private const val COMMENTS_COUNT_DEFAULT_VALUE = 0

interface PostHasComments : PostAware {
    val commentsCount: Int
        get() = post.commentsCountAttr?.intValue ?: COMMENTS_COUNT_DEFAULT_VALUE

    private fun setCommentsCount(value: Int) {
        val attr = post.commentsCountAttr
            ?: Post.attrRepository.findBySubjectAndName(post, COMMENTS_COUNT)?.also { post.commentsCountAttr = it }
            ?: PostAttr(0, post, COMMENTS_COUNT, value).also { post.commentsCountAttr = it }
        attr.intValue = value
        Post.attrRepository.save(attr)
    }

    fun getComments(): List<PostComment> =
        Post.commentRepository.findByPostOrderByIdDesc(post)

    fun findCommentById(id: Int): PostComment? =
        Post.commentRepository.findByPostAndId(post, id)

    fun addComment(author: Member, content: String): PostComment {
        val postComment = PostComment(0, author, post, content)
        Post.commentRepository.save(postComment)
        setCommentsCount(commentsCount + 1)
        return postComment
    }

    fun deleteComment(postComment: PostComment) {
        setCommentsCount(commentsCount - 1)
        Post.commentRepository.delete(postComment)
    }
}
