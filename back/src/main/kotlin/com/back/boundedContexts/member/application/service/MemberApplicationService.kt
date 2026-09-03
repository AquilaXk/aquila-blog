package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.event.MemberPublicProfileChangedEvent
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.UploadedFileRetentionService
import org.slf4j.LoggerFactory
import org.springframework.context.ApplicationEventPublisher
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.Locale
import java.util.Optional

@Service
class MemberApplicationService(
    private val memberRepository: MemberRepositoryPort,
    private val memberProfileHydrator: MemberProfileHydrator,
    private val memberProfilePersistenceService: MemberProfilePersistenceService,
    private val passwordEncoder: PasswordEncoder,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val applicationEventPublisher: ApplicationEventPublisher,
) {
    private val logger = LoggerFactory.getLogger(MemberApplicationService::class.java)

    companion object {
        private const val USERNAME_MAX_LENGTH = 30
        private const val AUTO_USERNAME_BASE_MAX_LENGTH = 24
        private const val AUTO_USERNAME_MAX_RETRY = 100
        private const val FALLBACK_AUTO_USERNAME_PREFIX = "user"
        private val INVALID_USERNAME_CHAR_REGEX = Regex("[^a-z0-9._-]")
        private val DUPLICATED_DOT_REGEX = Regex("\\.{2,}")
    }

    @Transactional(readOnly = true)
    fun count(): Long = memberRepository.count()

    @Transactional
    fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String?,
    ): Member {
        val normalizedEmail = normalizeEmailOrNull(email)

        memberRepository.findByLoginId(username)?.let {
            throw AppException(ErrorCode.MEMBER_DUPLICATE, "이미 존재하는 회원 아이디입니다.")
        }
        normalizedEmail?.let {
            if (memberRepository.existsByEmail(it)) {
                throw AppException(ErrorCode.RESOURCE_CONFLICT, "이미 사용 중인 이메일입니다.")
            }
        }

        val encodedPassword =
            if (!password.isNullOrBlank()) {
                passwordEncoder.encode(password)
            } else {
                null
            }

        val member =
            try {
                memberRepository.saveAndFlush(Member(0, username, encodedPassword, nickname, normalizedEmail))
            } catch (exception: DataIntegrityViolationException) {
                if (memberRepository.findByLoginId(username) != null) {
                    throw AppException(ErrorCode.MEMBER_DUPLICATE, "이미 존재하는 회원 아이디입니다.")
                }
                normalizedEmail?.let {
                    if (memberRepository.existsByEmail(it)) {
                        throw AppException(ErrorCode.RESOURCE_CONFLICT, "이미 사용 중인 이메일입니다.")
                    }
                }
                throw AppException(ErrorCode.MEMBER_SIGNUP_RACE, "동시에 처리된 회원가입 요청입니다. 다시 시도해주세요.")
            }
        memberProfilePersistenceService
            .initializeWorkspaceSnapshots(member, MemberProfileWorkspaceContent(profileImageUrl = profileImgUrl.orEmpty()))
            ?.let { imageSyncRequest ->
                uploadedFileRetentionService.syncProfileImage(
                    member.id,
                    imageSyncRequest.previousProfileImgUrl,
                    imageSyncRequest.currentProfileImgUrl,
                )
            }
        logger.info("member_signup_completed memberId={} actorId={}", member.id, member.id)

        return member
    }

    /**
     * 이메일 인증 기반 회원가입에서 내부 username을 자동 생성해 가입을 완료합니다.
     * 기존 username 필드를 유지하되, 사용자 입력 대신 이메일 기반 규칙으로 생성해 식별자 체계를 통일합니다.
     */
    @Transactional
    fun joinWithVerifiedEmail(
        email: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member {
        val normalizedEmail =
            normalizeEmailOrNull(email)
                ?: throw AppException(ErrorCode.MEMBER_BAD_REQUEST, "이메일을 입력해주세요.")

        val usernameBase = buildAutoUsernameBase(normalizedEmail)

        repeat(AUTO_USERNAME_MAX_RETRY) { attempt ->
            val candidateUsername = buildAutoUsernameCandidate(usernameBase, attempt)

            try {
                return join(
                    username = candidateUsername,
                    password = password,
                    nickname = nickname,
                    profileImgUrl = profileImgUrl,
                    email = normalizedEmail,
                )
            } catch (exception: AppException) {
                if (exception.errorCode != ErrorCode.MEMBER_DUPLICATE) {
                    throw exception
                }
            }
        }

        throw AppException(ErrorCode.MEMBER_USERNAME_GENERATE_FAILED, "회원가입 사용자 식별자 생성에 실패했습니다.")
    }

    @Transactional
    fun ensureVerifiedEmailIdentity(
        email: String,
        nickname: String,
    ): Member {
        val normalizedEmail =
            normalizeEmailOrNull(email)
                ?: throw AppException(ErrorCode.MEMBER_BAD_REQUEST, "이메일을 입력해주세요.")

        memberRepository.lockEmailIdentityProvisioning(normalizedEmail)
        return memberRepository.findByEmail(normalizedEmail)
            ?: joinWithVerifiedEmail(
                email = normalizedEmail,
                password = null,
                nickname = nickname,
                profileImgUrl = null,
            )
    }

    @Transactional(readOnly = true)
    fun findByLoginId(loginId: String): Member? =
        memberRepository
            .findByLoginId(loginId)
            ?.let(memberProfileHydrator::hydrate)

    @Transactional(readOnly = true)
    fun findByEmail(email: String): Member? =
        normalizeEmailOrNull(email)
            ?.let(memberRepository::findByEmail)
            ?.let(memberProfileHydrator::hydrate)

    @Transactional(readOnly = true)
    fun findById(id: Long): Optional<Member> =
        memberRepository
            .findById(id)
            .map { member ->
                memberProfileHydrator.hydrate(member)
            }

    @Transactional
    fun modify(
        member: Member,
        nickname: String,
    ) {
        val previousNickname = member.nickname
        member.modify(nickname)
        if (previousNickname != member.nickname) {
            applicationEventPublisher.publishEvent(
                MemberPublicProfileChangedEvent(
                    memberId = member.id,
                    previousNickname = previousNickname,
                    currentNickname = member.nickname,
                    previousProfileImgUrl = member.getProfileWorkspacePublishedContent().profileImageUrl,
                    currentProfileImgUrl = member.getProfileWorkspacePublishedContent().profileImageUrl,
                ),
            )
        }
    }

    @Transactional
    fun saveProfileWorkspaceDraft(
        member: Member,
        content: MemberProfileWorkspaceContent,
    ) {
        val imageSyncRequest = memberProfilePersistenceService.saveWorkspaceDraft(member, content)
        if (imageSyncRequest != null) {
            uploadedFileRetentionService.syncProfileImage(
                member.id,
                imageSyncRequest.previousProfileImgUrl,
                imageSyncRequest.currentProfileImgUrl,
            )
        }
    }

    @Transactional
    fun publishProfileWorkspace(member: Member) {
        val previousPublished = member.getProfileWorkspacePublishedContent()
        val imageSyncRequest = memberProfilePersistenceService.publishWorkspace(member)
        if (imageSyncRequest != null) {
            uploadedFileRetentionService.syncProfileImage(
                member.id,
                imageSyncRequest.previousProfileImgUrl,
                imageSyncRequest.currentProfileImgUrl,
            )
        }
        if (imageSyncRequest != null) {
            applicationEventPublisher.publishEvent(
                MemberPublicProfileChangedEvent(
                    memberId = member.id,
                    previousNickname = member.nickname,
                    currentNickname = member.nickname,
                    previousProfileImgUrl = previousPublished.profileImageUrl,
                    currentProfileImgUrl = member.getProfileWorkspacePublishedContent().profileImageUrl,
                ),
            )
        }
    }

    private fun normalizeEmailOrNull(email: String?): String? =
        email
            ?.trim()
            ?.lowercase(Locale.ROOT)
            ?.takeIf(String::isNotBlank)

    private fun buildAutoUsernameBase(normalizedEmail: String): String {
        val localPart = normalizedEmail.substringBefore("@", missingDelimiterValue = normalizedEmail)
        val sanitized =
            localPart
                .lowercase(Locale.ROOT)
                .replace(INVALID_USERNAME_CHAR_REGEX, "-")
                .replace(DUPLICATED_DOT_REGEX, ".")
                .trim('-', '_', '.')

        val normalizedBase =
            sanitized
                .ifBlank { FALLBACK_AUTO_USERNAME_PREFIX }
                .take(AUTO_USERNAME_BASE_MAX_LENGTH)
                .ifBlank { FALLBACK_AUTO_USERNAME_PREFIX }

        return if (normalizedBase.length >= 2) normalizedBase else "$normalizedBase$FALLBACK_AUTO_USERNAME_PREFIX"
    }

    private fun buildAutoUsernameCandidate(
        base: String,
        attempt: Int,
    ): String {
        if (attempt == 0) {
            return base.take(USERNAME_MAX_LENGTH)
        }

        val suffix = "-$attempt"
        val maxBaseLength = (USERNAME_MAX_LENGTH - suffix.length).coerceAtLeast(2)
        return "${base.take(maxBaseLength)}$suffix"
    }
}
