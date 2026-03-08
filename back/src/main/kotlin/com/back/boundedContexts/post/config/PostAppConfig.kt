package com.back.boundedContexts.post.config

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.out.PostAttrRepository
import com.back.boundedContexts.post.out.PostCommentRepository
import com.back.boundedContexts.post.out.PostLikeRepository
import jakarta.annotation.PostConstruct
import org.springframework.context.annotation.Configuration

@Configuration
class PostAppConfig(
    private val postAttrRepo: PostAttrRepository,
    private val postCommentRepo: PostCommentRepository,
    private val postLikeRepo: PostLikeRepository,
) {
    @PostConstruct
    fun init() {
        Post.attrRepository_ = postAttrRepo
        Post.commentRepository_ = postCommentRepo
        Post.likeRepository_ = postLikeRepo
    }
}
