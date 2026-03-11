package com.back.boundedContexts.post.app

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.MemberProxy
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.out.shared.MemberAttrRepository
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.POST_COMMENTS_COUNT
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.PostLike
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
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
import java.util.UUID
import kotlin.jvm.optionals.getOrNull

@Service
class PostFacade(
    private val postRepository: PostRepository,
    private val postAttrRepository: PostAttrRepository,
    private val memberAttrRepository: MemberAttrRepository,
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
        val persistenceAuthor = toPersistenceMember(author)
        val post = Post(0, persistenceAuthor, title, content, published, listed)
        val savedPost = postRepository.saveAndFlush(post)
        hydrateMemberCounterAttrs(persistenceAuthor)
        persistenceAuthor.incrementPostsCount()
        saveMemberAttr(persistenceAuthor.postsCountAttr)

        eventPublisher.publish(
            PostWrittenEvent(UUID.randomUUID(), PostDto(savedPost), MemberDto(author))
        )

        return savedPost
    }

    fun findById(id: Int): Post? =
        postRepository.findById(id).getOrNull()
            ?.also(::hydratePostAttrs)

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
        hydratePostAttrs(post)
        post.modify(title, content, published, listed)
        postRepository.flush()

        eventPublisher.publish(
            PostModifiedEvent(UUID.randomUUID(), PostDto(post), MemberDto(actor))
        )
    }

    @Transactional
    fun delete(post: Post, actor: Member) {
        hydratePostAttrs(post)
        hydrateMemberCounterAttrs(post.author)
        val postDto = PostDto(post)

        eventPublisher.publish(
            PostDeletedEvent(UUID.randomUUID(), postDto, MemberDto(actor))
        )

        post.author.decrementPostsCount()
        saveMemberAttr(post.author.postsCountAttr)
        post.softDelete()
    }

    @Transactional
    fun writeComment(author: Member, post: Post, content: String, parentComment: PostComment? = null): PostComment {
        val persistenceAuthor = toPersistenceMember(author)
        hydratePostAttrs(post)
        hydrateMemberCounterAttrs(persistenceAuthor)
        val persistedParentComment = parentComment?.let { findCommentById(post, it.id) ?: it }
        val comment = postCommentRepository.save(
            post.newComment(
                author = persistenceAuthor,
                content = content,
                parentComment = persistedParentComment,
            )
        )
        post.onCommentAdded()
        savePostAttr(post.commentsCountAttr)
        persistenceAuthor.incrementPostCommentsCount()
        saveMemberAttr(persistenceAuthor.postCommentsCountAttr)
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
        hydratePostAttrs(post)
        val allComments = postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post)
        val commentsByParentId =
            allComments
                .mapNotNull { comment -> comment.parentComment?.id?.let { parentId -> parentId to comment } }
                .groupBy({ it.first }, { it.second })
        val commentsToDelete = mutableListOf<PostComment>()

        fun collect(comment: PostComment) {
            commentsByParentId[comment.id].orEmpty().forEach(::collect)
            commentsToDelete += comment
        }

        collect(postComment)

        commentsToDelete.forEach { hydrateMemberCounterAttrs(it.author) }

        val postDto = PostDto(post)
        commentsToDelete.forEach { comment ->
            val postCommentDto = PostCommentDto(comment)
            comment.author.decrementPostCommentsCount()
            saveMemberAttr(comment.author.postCommentsCountAttr)
            post.onCommentDeleted()
            postCommentRepository.delete(comment)

            eventPublisher.publish(
                PostCommentDeletedEvent(UUID.randomUUID(), postCommentDto, postDto, MemberDto(actor))
            )
        }

        savePostAttr(post.commentsCountAttr)
    }

    @Transactional
    fun toggleLike(post: Post, actor: Member): PostLikeToggleResult {
        val persistenceActor = toPersistenceMember(actor)
        hydratePostAttrs(post)
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        val likeResult = if (existingLike != null) {
            postLikeRepository.delete(existingLike)
            post.onLikeRemoved()
            PostLikeToggleResult(false, existingLike.id)
        } else {
            val savedLike = postLikeRepository.save(PostLike(0, persistenceActor, post))
            post.onLikeAdded()
            PostLikeToggleResult(true, savedLike.id)
        }
        savePostAttr(post.likesCountAttr)
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
        hydratePostAttrs(post)
        post.incrementHitCount()
        savePostAttr(post.hitCountAttr)
    }

    fun getComments(post: Post): List<PostComment> =
        postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post).also { comments ->
            hydrateMembersProfileImgAttrs(comments.map { it.author })
        }

    fun findCommentById(post: Post, id: Int): PostComment? =
        postCommentRepository.findByPostAndId(post, id)

    fun isLiked(post: Post, liker: Member?): Boolean {
        if (liker == null) return false
        return postLikeRepository.findByLikerAndPost(toPersistenceMember(liker), post) != null
    }

    fun findLikedPostIds(liker: Member?, posts: List<Post>): Set<Int> {
        if (liker == null || posts.isEmpty()) return emptySet()
        return postLikeRepository
            .findByLikerAndPostIn(toPersistenceMember(liker), posts)
            .map { it.post.id }
            .toSet()
    }

    fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> = findAndHydratePagedPosts {
        postRepository.findQPagedByKw(
            kw,
            PageRequest.of(page - 1, pageSize, sort.sortBy)
        )
    }

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> = findAndHydratePagedPosts {
        postRepository.findQPagedByKwForAdmin(
            kw,
            PageRequest.of(page - 1, pageSize, sort.sortBy)
        )
    }

    fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> = findAndHydratePagedPosts {
        postRepository.findQPagedByAuthorAndKw(
            toPersistenceMember(author),
            kw,
            PageRequest.of(page - 1, pageSize, sort.sortBy)
        )
    }

    fun findTemp(author: Member): Post? =
        postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(toPersistenceMember(author), "임시글")

    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> {
        val existingTemp = findTemp(author)
        if (existingTemp != null) return existingTemp to false

        val newPost = Post(0, toPersistenceMember(author), "임시글", "임시글 입니다.")
        return postRepository.save(newPost) to true
    }

    private fun findAndHydratePagedPosts(loader: () -> Page<Post>): Page<Post> {
        val page = loader()
        hydratePostAttrs(page.content)
        hydrateMembersProfileImgAttrs(page.content.map { it.author })
        return page
    }

    private fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.commentsCountAttr ?: postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)?.let { post.commentsCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    private fun hydratePostAttrs(posts: List<Post>) {
        if (posts.isEmpty()) return

        // 목록 조회 시 post마다 natural-id lookup을 반복하면 쿼리가 급증하므로 일괄 hydrate 한다.
        val attrsByKey = postAttrRepository
            .findBySubjectInAndNameIn(posts, listOf(LIKES_COUNT, COMMENTS_COUNT, HIT_COUNT))
            .associateBy { "${it.subject.id}:${it.name}" }

        posts.forEach { post ->
            post.likesCountAttr = post.likesCountAttr ?: attrsByKey["${post.id}:$LIKES_COUNT"]
            post.commentsCountAttr = post.commentsCountAttr ?: attrsByKey["${post.id}:$COMMENTS_COUNT"]
            post.hitCountAttr = post.hitCountAttr ?: attrsByKey["${post.id}:$HIT_COUNT"]
        }
    }

    private fun hydrateMemberCounterAttrs(member: Member) {
        member.postsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POSTS_COUNT)?.let { member.postsCountAttr = it }
        member.postCommentsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POST_COMMENTS_COUNT)
            ?.let { member.postCommentsCountAttr = it }
    }

    private fun hydrateMembersProfileImgAttrs(members: List<Member>) {
        if (members.isEmpty()) return

        val uniqueMembers = members.distinctBy { it.id }
        val profileAttrsByMemberId = memberAttrRepository
            .findBySubjectInAndNameIn(uniqueMembers, listOf(PROFILE_IMG_URL))
            .associateBy { it.subject.id }

        // DTO 매핑에서 redirectToProfileImgUrlOrDefault 접근 시 profile attr lazy-load를 미리 해소한다.
        uniqueMembers.forEach { member ->
            member.getOrInitProfileImgUrlAttr {
                profileAttrsByMemberId[member.id] ?: MemberAttr(0, member, PROFILE_IMG_URL, "")
            }
        }
    }

    private fun savePostAttr(attr: PostAttr?) {
        attr?.let(postAttrRepository::save)
    }

    private fun saveMemberAttr(attr: MemberAttr?) {
        attr?.let(memberAttrRepository::save)
    }

    // SecurityContext actor는 MemberProxy일 수 있어 영속 경계에서는 실제 엔티티를 사용한다.
    private fun toPersistenceMember(member: Member): Member =
        if (member is MemberProxy) member.persistenceMember else member
}
