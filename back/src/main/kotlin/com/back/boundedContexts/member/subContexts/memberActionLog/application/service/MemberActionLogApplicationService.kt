package com.back.boundedContexts.member.subContexts.memberActionLog.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.PostLike
import com.back.boundedContexts.post.event.*
import com.back.standard.dto.EventPayload
import com.back.standard.util.Ut
import org.springframework.stereotype.Service

/**
 * MemberActionLogApplicationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class MemberActionLogApplicationService(
    private val memberActionLogRepository: MemberActionLogRepositoryPort,
) {
    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun save(event: EventPayload) {
        when (event) {
            is PostWrittenEvent -> save(event)
            is PostModifiedEvent -> save(event)
            is PostDeletedEvent -> save(event)
            is PostCommentWrittenEvent -> save(event)
            is PostCommentModifiedEvent -> save(event)
            is PostCommentDeletedEvent -> save(event)
            is PostLikedEvent -> save(event)
            is PostUnlikedEvent -> save(event)
            else -> {}
        }
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostWrittenEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostWrittenEvent::class.simpleName!!,
                primaryType = Post::class.simpleName!!,
                primaryId = event.postDto.id,
                primaryOwner = Member(event.postDto.authorId),
                secondaryType = Member::class.simpleName!!,
                secondaryId = event.actorDto.id,
                secondaryOwner = Member(event.actorDto.id),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostModifiedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostModifiedEvent::class.simpleName!!,
                primaryType = Post::class.simpleName!!,
                primaryId = event.postDto.id,
                primaryOwner = Member(event.postDto.authorId),
                secondaryType = Member::class.simpleName!!,
                secondaryId = event.actorDto.id,
                secondaryOwner = Member(event.actorDto.id),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostDeletedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostDeletedEvent::class.simpleName!!,
                primaryType = Post::class.simpleName!!,
                primaryId = event.postDto.id,
                primaryOwner = Member(event.postDto.authorId),
                secondaryType = Member::class.simpleName!!,
                secondaryId = event.actorDto.id,
                secondaryOwner = Member(event.actorDto.id),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostCommentWrittenEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostCommentWrittenEvent::class.simpleName!!,
                primaryType = PostComment::class.simpleName!!,
                primaryId = event.postCommentDto.id,
                primaryOwner = Member(event.postCommentDto.authorId),
                secondaryType = Post::class.simpleName!!,
                secondaryId = event.postDto.id,
                secondaryOwner = Member(event.postDto.authorId),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostCommentModifiedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostCommentModifiedEvent::class.simpleName!!,
                primaryType = PostComment::class.simpleName!!,
                primaryId = event.postCommentDto.id,
                primaryOwner = Member(event.postCommentDto.authorId),
                secondaryType = Post::class.simpleName!!,
                secondaryId = event.postDto.id,
                secondaryOwner = Member(event.postDto.authorId),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostCommentDeletedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostCommentDeletedEvent::class.simpleName!!,
                primaryType = PostComment::class.simpleName!!,
                primaryId = event.postCommentDto.id,
                primaryOwner = Member(event.postCommentDto.authorId),
                secondaryType = Post::class.simpleName!!,
                secondaryId = event.postDto.id,
                secondaryOwner = Member(event.postDto.authorId),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostLikedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostLikedEvent::class.simpleName!!,
                primaryType = PostLike::class.simpleName!!,
                primaryId = event.likeId,
                primaryOwner = Member(event.actorDto.id),
                secondaryType = Post::class.simpleName!!,
                secondaryId = event.postId,
                secondaryOwner = Member(event.postAuthorId),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }

    /**
     * save 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun save(event: PostUnlikedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostUnlikedEvent::class.simpleName!!,
                primaryType = PostLike::class.simpleName!!,
                primaryId = event.likeId,
                primaryOwner = Member(event.actorDto.id),
                secondaryType = Post::class.simpleName!!,
                secondaryId = event.postId,
                secondaryOwner = Member(event.postAuthorId),
                actor = Member(event.actorDto.id),
                data = Ut.JSON.toString(event),
            ),
        )
    }
}
