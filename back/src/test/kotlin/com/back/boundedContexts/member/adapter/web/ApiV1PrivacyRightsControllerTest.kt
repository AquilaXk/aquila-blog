package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.AuthTokenIssueUseCase
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_DETAILS
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_LINKS
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_LINKS
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_DRAFT
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
import com.back.boundedContexts.member.subContexts.legalAcceptance.adapter.persistence.MemberLegalAcceptanceRepository
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.ActiveLegalDocumentMetadata
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberAccountDeletionRepository
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant

class ApiV1PrivacyRightsControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var memberLegalAcceptanceRepository: MemberLegalAcceptanceRepository

    @Autowired
    private lateinit var memberAccountDeletionRepository: MemberAccountDeletionRepository

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @Autowired
    private lateinit var memberSessionUseCase: MemberSessionUseCase

    @Autowired
    private lateinit var authTokenIssueUseCase: AuthTokenIssueUseCase

    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `개인정보 export 는 로그인 사용자의 계정 스냅샷을 반환한다`() {
        val activeLegalDocuments = ActiveLegalDocumentMetadata.current()
        val member =
            memberFacade.join(
                username = "privacy-export-user",
                password = "Abcd1234!",
                nickname = "정보내보내기",
                profileImgUrl = null,
                email = "privacy-export-user@example.com",
            )
        memberLegalAcceptanceRepository.save(
            MemberLegalAcceptance(
                member = member,
                termsVersion = activeLegalDocuments.terms.version,
                termsContentSha256 = activeLegalDocuments.terms.contentSha256,
                privacyVersion = activeLegalDocuments.privacy.version,
                privacyContentSha256 = activeLegalDocuments.privacy.contentSha256,
                age14OrOlder = true,
                requiredPrivacyConfirmed = true,
                analyticsConsent = false,
                overseasTransferAcknowledged = true,
                source = "EMAIL_SIGNUP",
                acceptedAt = Instant.parse("2026-06-21T00:00:00Z"),
            ),
        )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .get("/member/api/v1/privacy/export") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("개인정보 내보내기 데이터를 조회했습니다.") }
                jsonPath("$.data.member.id") { value(member.id) }
                jsonPath("$.data.member.email") { value("privacy-export-user@example.com") }
                jsonPath("$.data.member.username") { value("privacy-export-user") }
                jsonPath("$.data.member.nickname") { value("정보내보내기") }
                jsonPath("$.data.member.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                jsonPath("$.data.latestLegalAcceptance.termsVersion") { value(activeLegalDocuments.terms.version) }
                jsonPath("$.data.latestLegalAcceptance.termsContentSha256") {
                    value(activeLegalDocuments.terms.contentSha256)
                }
                jsonPath("$.data.latestLegalAcceptance.privacyVersion") { value(activeLegalDocuments.privacy.version) }
                jsonPath("$.data.latestLegalAcceptance.privacyContentSha256") {
                    value(activeLegalDocuments.privacy.contentSha256)
                }
                jsonPath("$.data.latestLegalAcceptance.age14OrOlder") { value(true) }
                jsonPath("$.data.latestLegalAcceptance.requiredPrivacyConfirmed") { value(true) }
                jsonPath("$.data.latestLegalAcceptance.analyticsConsent") { value(false) }
                jsonPath("$.data.latestLegalAcceptance.overseasTransferAcknowledged") { value(true) }
                jsonPath("$.data.latestLegalAcceptance.source") { value("EMAIL_SIGNUP") }
                jsonPath("$.data.latestLegalAcceptance.acceptedAt") { value("2026-06-21T00:00:00Z") }
                jsonPath("$.data.generatedAt") { value(startsWith("20")) }
            }
    }

    @Test
    fun `개인정보 export 는 법적 동의 이력이 없어도 계정 스냅샷을 반환한다`() {
        val member =
            memberFacade.join(
                username = "privacy-export-no-legal-user",
                password = "Abcd1234!",
                nickname = "동의이력없음",
                profileImgUrl = null,
                email = "privacy-export-no-legal-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .get("/member/api/v1/privacy/export") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.member.id") { value(member.id) }
                jsonPath("$.data.latestLegalAcceptance") { doesNotExist() }
            }
    }

    @Test
    fun `개인정보 처리 요청은 생성 후 본인 상태 조회가 가능하다`() {
        val member =
            memberFacade.join(
                username = "privacy-request-user",
                password = "Abcd1234!",
                nickname = "권리요청",
                profileImgUrl = null,
                email = "privacy-request-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        val created =
            mvc
                .post("/member/api/v1/privacy/requests") {
                    authCookies.forEach { cookie(it) }
                    header("X-Aquila-CSRF", "1")
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "type": "EXPORT",
                            "message": "가입 정보와 운영 로그 열람을 요청합니다."
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.resultCode") { value("201-1") }
                    jsonPath("$.msg") { value("개인정보 처리 요청을 접수했습니다.") }
                    jsonPath("$.data.item.id") { isNumber() }
                    jsonPath("$.data.item.type") { value("EXPORT") }
                    jsonPath("$.data.item.status") { value("RECEIVED") }
                    jsonPath("$.data.item.message") { value("가입 정보와 운영 로그 열람을 요청합니다.") }
                    jsonPath("$.data.item.requestedAt") { value(startsWith("20")) }
                    jsonPath("$.data.item.dueAt") { value(startsWith("20")) }
                }.andReturn()

        val requestId = JsonPath.read<Int>(created.response.contentAsString, "$.data.item.id").toLong()

        mvc
            .get("/member/api/v1/privacy/requests/$requestId") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청 상태를 조회했습니다.") }
                jsonPath("$.data.item.id") { value(requestId) }
                jsonPath("$.data.item.memberId") { value(member.id) }
                jsonPath("$.data.item.type") { value("EXPORT") }
                jsonPath("$.data.item.status") { value("RECEIVED") }
            }

        mvc
            .post("/member/api/v1/privacy/requests") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "type": "CORRECTION",
                        "message": "   "
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.item.type") { value("CORRECTION") }
                jsonPath("$.data.item.message") { doesNotExist() }
            }
    }

    @Test
    fun `존재하지 않는 개인정보 처리 요청은 404를 반환한다`() {
        val member =
            memberFacade.join(
                username = "privacy-request-missing-user",
                password = "Abcd1234!",
                nickname = "권리요청없음",
                profileImgUrl = null,
                email = "privacy-request-missing-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .get("/member/api/v1/privacy/requests/999999") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청을 찾을 수 없습니다.") }
            }
    }

    @Test
    fun `개인정보 처리 요청은 다른 회원이 조회할 수 없다`() {
        val owner =
            memberFacade.join(
                username = "privacy-request-owner",
                password = "Abcd1234!",
                nickname = "요청소유자",
                profileImgUrl = null,
                email = "privacy-request-owner@example.com",
            )
        val attacker =
            memberFacade.join(
                username = "privacy-request-attacker",
                password = "Abcd1234!",
                nickname = "다른사용자",
                profileImgUrl = null,
                email = "privacy-request-attacker@example.com",
            )
        val ownerCookies = loginAuthCookies(owner.email!!)
        val attackerCookies = loginAuthCookies(attacker.email!!)
        val created =
            mvc
                .post("/member/api/v1/privacy/requests") {
                    ownerCookies.forEach { cookie(it) }
                    header("X-Aquila-CSRF", "1")
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "type": "EXPORT"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                }.andReturn()
        val requestId = JsonPath.read<Int>(created.response.contentAsString, "$.data.item.id").toLong()

        mvc
            .get("/member/api/v1/privacy/requests/$requestId") {
                attackerCookies.forEach { cookie(it) }
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청을 찾을 수 없습니다.") }
            }
    }

    @Test
    fun `계정 탈퇴는 비밀번호 재확인 후 회원을 삭제 상태로 전환하고 모든 세션을 폐기한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-user",
                password = "Abcd1234!",
                nickname = "탈퇴유저",
                profileImgUrl = null,
                email = "account-delete-user@example.com",
            )
        val firstAuthCookies = loginAuthCookies(member.email!!)
        val secondAuthCookies = loginAuthCookies(member.email!!)
        member.applyLoginSecurityPolicy(
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            ipSecurityFingerprint = "fingerprint-before-delete",
        )
        val legacyProfileImageKey = "profiles/account-delete/legacy-profile.png"
        val draftProfileImageKey = "profiles/account-delete/draft-profile.png"
        val publishedProfileImageKey = "profiles/account-delete/published-profile.png"
        insertActiveProfileUploadedFile(member.id, legacyProfileImageKey)
        insertActiveProfileUploadedFile(member.id, draftProfileImageKey)
        insertActiveProfileUploadedFile(member.id, publishedProfileImageKey)
        insertMemberAttr(member.id, PROFILE_IMG_URL, "/post/api/v1/images/$legacyProfileImageKey")
        insertMemberAttr(member.id, PROFILE_BIO, "민감한 자기소개")
        insertMemberAttr(member.id, ABOUT_DETAILS, "민감한 상세 소개")
        insertMemberAttr(member.id, PROFILE_SERVICE_LINKS, """[{"label":"민감한 서비스","href":"https://example.test"}]""")
        insertMemberAttr(member.id, PROFILE_CONTACT_LINKS, """[{"label":"민감한 연락처","href":"mailto:secret@example.test"}]""")
        insertMemberAttr(
            member.id,
            PROFILE_WORKSPACE_DRAFT,
            """{"content":{"profileImageUrl":"/post/api/v1/images/$draftProfileImageKey","profileBio":"민감한 draft"}}""",
        )
        insertMemberAttr(
            member.id,
            PROFILE_WORKSPACE_PUBLISHED,
            """{"content":{"profileImageUrl":"/post/api/v1/images/$publishedProfileImageKey","profileBio":"민감한 published"}}""",
        )
        val authoredPost =
            postFacade.write(
                author = member,
                title = "탈퇴 회원 작성글",
                content = "탈퇴 후 공개 조회에서 빠져야 하는 글",
                published = true,
                listed = true,
            )
        val otherAuthor =
            memberFacade.join(
                username = "account-delete-other-author",
                password = "Abcd1234!",
                nickname = "다른작성자",
                profileImgUrl = null,
                email = "account-delete-other-author@example.com",
            )
        val otherPost =
            postFacade.write(
                author = otherAuthor,
                title = "탈퇴 댓글 대상글",
                content = "다른 회원의 공개 글",
                published = true,
                listed = true,
            )
        val authoredComment = postFacade.writeComment(member, otherPost, "탈퇴 후 숨겨져야 하는 댓글")
        val replyToAuthoredComment = postFacade.writeComment(otherAuthor, otherPost, "탈퇴 댓글의 답글", authoredComment)
        val nestedReplyToAuthoredComment =
            postFacade.writeComment(member, otherPost, "탈퇴 댓글의 중첩 답글", replyToAuthoredComment)
        val deletedOtherPost =
            postFacade.write(
                author = otherAuthor,
                title = "탈퇴 댓글 대상 삭제글",
                content = "이미 삭제된 글의 댓글도 정리되어야 한다",
                published = true,
                listed = true,
            )
        val authoredCommentOnDeletedPost =
            postFacade.writeComment(member, deletedOtherPost, "삭제된 글에 남은 탈퇴 회원 댓글")
        val replyToDeletedPostAuthoredComment =
            postFacade.writeComment(otherAuthor, deletedOtherPost, "삭제된 글 탈퇴 댓글의 답글", authoredCommentOnDeletedPost)
        deletedOtherPost.softDelete()
        val firstSessionKey = requireAuthCookie(firstAuthCookies, AuthCookieNames.SESSION_KEY)
        val secondSessionKey = requireAuthCookie(secondAuthCookies, AuthCookieNames.SESSION_KEY)
        assertThat(countMemberAttrsContaining(member.id, "민감")).isGreaterThan(0)
        assertThat(findPostCommentsCount(otherPost.id)).isEqualTo(3)
        assertThat(findPostCommentsCount(deletedOtherPost.id)).isEqualTo(2)
        assertThat(findMemberPostCommentsCount(otherAuthor.id)).isEqualTo(2)
        assertThat(findUploadedFileState(legacyProfileImageKey).status).isEqualTo("ACTIVE")
        assertThat(findUploadedFileState(draftProfileImageKey).status).isEqualTo("ACTIVE")
        assertThat(findUploadedFileState(publishedProfileImageKey).status).isEqualTo("ACTIVE")
        val taskPayloadsWithDeletedPostContentBeforeDeletion =
            countTaskPayloadsContaining("탈퇴 후 공개 조회에서 빠져야 하는 글")
        val taskPayloadsWithDeletedCommentContentBeforeDeletion =
            countTaskPayloadsContaining("탈퇴 후 숨겨져야 하는 댓글")
        val actionLogsWithDeletingMemberProfileBeforeDeletion =
            countActionLogsContaining("탈퇴유저")

        mvc
            .delete("/member/api/v1/privacy/account") {
                firstAuthCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "Abcd1234!",
                        "reason": "서비스 이용 종료"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("계정 탈퇴가 완료되었습니다.") }
                cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
            }

        assertThat(memberFacade.findByEmail("account-delete-user@example.com")).isNull()
        assertThat(findMemberDeletionState(member.id).email).isNull()
        assertThat(findMemberDeletionState(member.id).username).startsWith("deleted-${member.id}-")
        assertThat(findMemberDeletionState(member.id).deletedAt).isNotNull()
        assertThat(findMemberDeletionState(member.id).ipSecurityEnabled).isFalse()
        assertThat(findMemberDeletionState(member.id).ipSecurityFingerprint).isNull()
        assertThat(findSessionRevokedAt(firstSessionKey.value)).isNotNull()
        assertThat(findSessionRevokedAt(secondSessionKey.value)).isNotNull()
        assertThat(countDeletionTombstones(member.id, "서비스 이용 종료")).isEqualTo(1)
        assertThat(countMemberAttrsContaining(member.id, "민감")).isZero()
        assertThat(findPostDeletionState(authoredPost.id).deletedAt).isNotNull()
        assertThat(findCommentDeletedAt(authoredComment.id)).isNotNull()
        assertThat(findCommentDeletedAt(replyToAuthoredComment.id)).isNotNull()
        assertThat(findCommentDeletedAt(nestedReplyToAuthoredComment.id)).isNotNull()
        assertThat(findCommentDeletedAt(authoredCommentOnDeletedPost.id)).isNotNull()
        assertThat(findCommentDeletedAt(replyToDeletedPostAuthoredComment.id)).isNotNull()
        assertThat(findPostCommentsCount(otherPost.id)).isZero()
        assertThat(findPostCommentsCount(deletedOtherPost.id)).isZero()
        assertThat(findMemberPostCommentsCount(otherAuthor.id)).isZero()
        assertThatThrownBy { postFacade.restoreDeletedByIdForAdmin(authoredPost.id) }
            .hasMessage("404-1 : 이미 복구되었거나 존재하지 않는 글입니다.")
        listOf(legacyProfileImageKey, draftProfileImageKey, publishedProfileImageKey).forEach { objectKey ->
            val uploadedFile = findUploadedFileState(objectKey)
            assertThat(uploadedFile.status).isEqualTo("PENDING_DELETE")
            assertThat(uploadedFile.retentionReason).isEqualTo("REPLACED_PROFILE_IMAGE")
            assertThat(uploadedFile.purgeAfter).isNotNull()
        }
        assertThat(countTaskPayloadsContaining("탈퇴 후 공개 조회에서 빠져야 하는 글"))
            .isEqualTo(taskPayloadsWithDeletedPostContentBeforeDeletion)
        assertThat(countTaskPayloadsContaining("탈퇴 후 숨겨져야 하는 댓글"))
            .isEqualTo(taskPayloadsWithDeletedCommentContentBeforeDeletion)
        assertThat(countActionLogsContaining("탈퇴유저"))
            .isEqualTo(actionLogsWithDeletingMemberProfileBeforeDeletion)
        val deletion =
            memberAccountDeletionRepository
                .findAll()
                .single { it.memberId == member.id }
        assertThat(deletion.memberId).isEqualTo(member.id)
        assertThat(deletion.reason).isEqualTo("서비스 이용 종료")
        assertThat(deletion.deletedAt).isNotNull()
        val rejoinedMember =
            memberFacade.joinWithVerifiedEmail(
                email = "account-delete-user@example.com",
                password = "Abcd1234!",
                nickname = "재가입유저",
                profileImgUrl = null,
            )
        assertThat(rejoinedMember.id).isNotEqualTo(member.id)
        assertThat(rejoinedMember.email).isEqualTo("account-delete-user@example.com")
    }

    @Test
    fun `계정 탈퇴는 비밀번호 앞뒤 공백을 원문 그대로 검증한다`() {
        val rawPassword = " Abcd1234! "
        val member =
            memberFacade.join(
                username = "account-delete-spaced-password-user",
                password = rawPassword,
                nickname = "공백비밀번호",
                profileImgUrl = null,
                email = "account-delete-spaced-password-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!, rawPassword)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": " Abcd1234! ",
                        "reason": "비밀번호 원문 검증"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("계정 탈퇴가 완료되었습니다.") }
            }

        assertThat(findMemberDeletionState(member.id).deletedAt).isNotNull()
        assertThat(countDeletionTombstones(member.id, "비밀번호 원문 검증")).isEqualTo(1)
    }

    @Test
    fun `계정 탈퇴는 비밀번호가 틀리면 세션과 회원 상태를 유지한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-wrong-password-user",
                password = "Abcd1234!",
                nickname = "탈퇴실패",
                profileImgUrl = null,
                email = "account-delete-wrong-password-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)
        val sessionKey = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "wrong-password",
                        "reason": "서비스 이용 종료"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
                jsonPath("$.msg") { value("비밀번호가 일치하지 않습니다.") }
            }

        assertThat(memberFacade.findByEmail("account-delete-wrong-password-user@example.com")).isNotNull()
        assertThat(memberSessionRepository.findBySessionKey(sessionKey.value)?.revokedAt).isNull()
    }

    @Test
    fun `계정 탈퇴는 비밀번호 계정에서 비밀번호가 없으면 세션과 회원 상태를 유지한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-missing-password-user",
                password = "Abcd1234!",
                nickname = "탈퇴비밀번호누락",
                profileImgUrl = null,
                email = "account-delete-missing-password-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)
        val sessionKey = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "   ",
                        "reason": "서비스 이용 종료"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.resultCode") { value("400-1") }
                jsonPath("$.msg") { value("비밀번호를 입력해주세요.") }
            }

        assertThat(memberFacade.findByEmail("account-delete-missing-password-user@example.com")).isNotNull()
        assertThat(memberSessionRepository.findBySessionKey(sessionKey.value)?.revokedAt).isNull()
    }

    @Test
    fun `계정 탈퇴는 기존 탈퇴 tombstone 이 있으면 409를 반환한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-duplicate-user",
                password = "Abcd1234!",
                nickname = "중복탈퇴",
                profileImgUrl = null,
                email = "account-delete-duplicate-user@example.com",
            )
        memberAccountDeletionRepository.save(
            MemberAccountDeletion(
                memberId = member.id,
                deletedAt = Instant.parse("2026-06-21T00:00:00Z"),
            ),
        )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "Abcd1234!"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isConflict() }
                jsonPath("$.resultCode") { value("409-1") }
                jsonPath("$.msg") { value("이미 탈퇴 처리된 계정입니다.") }
            }
    }

    @Test
    fun `비밀번호가 없는 소셜 계정은 확인 플래그로 탈퇴할 수 있다`() {
        val member =
            memberFacade.join(
                username = "account-delete-oauth-user",
                password = null,
                nickname = "소셜탈퇴",
                profileImgUrl = null,
                email = "account-delete-oauth-user@example.com",
            )
        val authCookies = issueSessionAuthCookies(member)
        val sessionKey = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)
        insertConsumedPendingOAuthSignup(member.username)
        assertThat(countPendingOAuthSignupByMemberLoginId(member.username)).isEqualTo(1)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "oauthAccountDeletionConfirmed": true,
                        "reason": "소셜 계정 탈퇴"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("계정 탈퇴가 완료되었습니다.") }
                cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
            }

        assertThat(findMemberDeletionState(member.id).email).isNull()
        assertThat(findMemberDeletionState(member.id).deletedAt).isNotNull()
        assertThat(findSessionRevokedAt(sessionKey.value)).isNotNull()
        assertThat(countDeletionTombstones(member.id, "소셜 계정 탈퇴")).isEqualTo(1)
        assertThat(countPendingOAuthSignupByMemberLoginId(member.username)).isZero()
    }

    @Test
    fun `비밀번호가 없는 소셜 계정은 확인 플래그가 없으면 탈퇴할 수 없다`() {
        val member =
            memberFacade.join(
                username = "account-delete-oauth-unconfirmed-user",
                password = null,
                nickname = "소셜탈퇴미확인",
                profileImgUrl = null,
                email = "account-delete-oauth-unconfirmed-user@example.com",
            )
        val authCookies = issueSessionAuthCookies(member)
        val sessionKey = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "reason": "소셜 계정 탈퇴"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.resultCode") { value("400-2") }
                jsonPath("$.msg") { value("소셜 계정 탈퇴 확인이 필요합니다.") }
            }

        assertThat(findMemberDeletionState(member.id).deletedAt).isNull()
        assertThat(findSessionRevokedAt(sessionKey.value)).isNull()
    }

    private fun loginAuthCookies(
        email: String,
        password: String = "Abcd1234!",
    ): List<Cookie> =
        mvc
            .post("/member/api/v1/auth/login") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email",
                        "password": "$password"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .cookies
            .filter {
                it.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES &&
                    it.value.isNotBlank()
            }

    private fun issueSessionAuthCookies(member: Member): List<Cookie> {
        val sessionWithRefreshToken =
            memberSessionUseCase.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "127.0.0.1",
                userAgent = "ApiV1PrivacyRightsControllerTest",
            )
        val session = sessionWithRefreshToken.session
        val accessToken =
            authTokenIssueUseCase.genAccessToken(
                member = member,
                sessionKey = session.sessionKey,
                rememberLoginEnabled = session.rememberLoginEnabled,
                ipSecurityEnabled = session.ipSecurityEnabled,
                ipSecurityFingerprint = session.ipSecurityFingerprint,
            )

        return listOf(
            Cookie(AuthCookieNames.API_KEY, member.apiKey),
            Cookie(AuthCookieNames.ACCESS_TOKEN, accessToken),
            Cookie(AuthCookieNames.REFRESH_TOKEN, sessionWithRefreshToken.refreshToken),
            Cookie(AuthCookieNames.SESSION_KEY, session.sessionKey),
        )
    }

    private fun requireAuthCookie(
        cookies: List<Cookie>,
        name: String,
    ): Cookie = cookies.firstOrNull { it.name == name } ?: error("$name cookie not issued")

    private fun countDeletionTombstones(
        memberId: Long,
        reason: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from member_account_deletion
            where member_id = ?
              and reason = ?
            """.trimIndent(),
            Int::class.java,
            memberId,
            reason,
        ) ?: 0

    private fun insertMemberAttr(
        memberId: Long,
        name: String,
        strValue: String,
    ) {
        jdbcTemplate.update(
            """
            insert into member_attr (id, subject_id, name, str_value)
            values (nextval('member_attr_seq'), ?, ?, ?)
            """.trimIndent(),
            memberId,
            name,
            strValue,
        )
    }

    private fun insertActiveProfileUploadedFile(
        memberId: Long,
        objectKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into uploaded_file (
                id,
                object_key,
                bucket,
                content_type,
                file_size,
                purpose,
                status,
                owner_type,
                owner_id
            )
            values (nextval('uploaded_file_seq'), ?, 'test-bucket', 'image/png', 128, 'PROFILE_IMAGE', 'ACTIVE', 'MEMBER_PROFILE', ?)
            """.trimIndent(),
            objectKey,
            memberId,
        )
    }

    private fun findUploadedFileState(objectKey: String): UploadedFileState =
        jdbcTemplate.queryForObject(
            """
            select status, retention_reason, purge_after
            from uploaded_file
            where object_key = ?
            """.trimIndent(),
            { rs, _ ->
                UploadedFileState(
                    status = rs.getString("status"),
                    retentionReason = rs.getString("retention_reason"),
                    purgeAfter = rs.getTimestamp("purge_after")?.toInstant(),
                )
            },
            objectKey,
        ) ?: error("uploaded file not found")

    private fun insertConsumedPendingOAuthSignup(memberLoginId: String) {
        jdbcTemplate.update(
            """
            insert into pending_oauth_signup (
                id,
                created_at,
                modified_at,
                provider,
                provider_subject_hash,
                member_login_id,
                pending_token_hash,
                pending_token_expires_at,
                nickname,
                profile_img_url,
                consumed_at,
                cancelled_at
            )
            values (
                nextval('pending_oauth_signup_seq'),
                current_timestamp,
                current_timestamp,
                'KAKAO',
                ?,
                ?,
                ?,
                current_timestamp + interval '30 minutes',
                '소셜탈퇴',
                null,
                current_timestamp,
                null
            )
            """.trimIndent(),
            "subject-hash-$memberLoginId",
            memberLoginId,
            "pending-token-hash-$memberLoginId",
        )
    }

    private fun countPendingOAuthSignupByMemberLoginId(memberLoginId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from pending_oauth_signup
            where member_login_id = ?
            """.trimIndent(),
            Int::class.java,
            memberLoginId,
        ) ?: 0

    private fun countMemberAttrsContaining(
        memberId: Long,
        valueFragment: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from member_attr
            where subject_id = ?
              and str_value like ?
            """.trimIndent(),
            Int::class.java,
            memberId,
            "%$valueFragment%",
        ) ?: 0

    private fun countTaskPayloadsContaining(valueFragment: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from task
            where payload like ?
            """.trimIndent(),
            Int::class.java,
            "%$valueFragment%",
        ) ?: 0

    private fun countActionLogsContaining(valueFragment: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from member_action_log
            where data like ?
            """.trimIndent(),
            Int::class.java,
            "%$valueFragment%",
        ) ?: 0

    private fun findPostDeletionState(postId: Long): PostDeletionState =
        jdbcTemplate.queryForObject(
            """
            select published, listed, deleted_at
            from post
            where id = ?
            """.trimIndent(),
            { rs, _ ->
                PostDeletionState(
                    published = rs.getBoolean("published"),
                    listed = rs.getBoolean("listed"),
                    deletedAt = rs.getTimestamp("deleted_at")?.toInstant(),
                )
            },
            postId,
        ) ?: error("post not found")

    private fun findCommentDeletedAt(commentId: Long): java.time.Instant? =
        jdbcTemplate.queryForObject(
            """
            select deleted_at
            from post_comment
            where id = ?
            """.trimIndent(),
            { rs, _ -> rs.getTimestamp("deleted_at")?.toInstant() },
            commentId,
        )

    private fun findPostCommentsCount(postId: Long): Int =
        jdbcTemplate.queryForObject(
            """
            select int_value
            from post_attr
            where subject_id = ?
              and name = 'commentsCount'
            """.trimIndent(),
            Int::class.java,
            postId,
        ) ?: 0

    private fun findMemberPostCommentsCount(memberId: Long): Int =
        jdbcTemplate.queryForObject(
            """
            select int_value
            from member_attr
            where subject_id = ?
              and name = 'postCommentsCount'
            """.trimIndent(),
            Int::class.java,
            memberId,
        ) ?: 0

    private fun findMemberDeletionState(memberId: Long): MemberDeletionState =
        jdbcTemplate.queryForObject(
            """
            select login_id, email, deleted_at, ip_security_enabled, ip_security_fingerprint
            from member
            where id = ?
            """.trimIndent(),
            { rs, _ ->
                MemberDeletionState(
                    username = rs.getString("login_id"),
                    email = rs.getString("email"),
                    deletedAt = rs.getTimestamp("deleted_at")?.toInstant(),
                    ipSecurityEnabled = rs.getBoolean("ip_security_enabled"),
                    ipSecurityFingerprint = rs.getString("ip_security_fingerprint"),
                )
            },
            memberId,
        ) ?: error("member not found")

    private fun findSessionRevokedAt(sessionKey: String): java.time.Instant? =
        jdbcTemplate.queryForObject(
            """
            select revoked_at
            from member_session
            where session_key = ?
            """.trimIndent(),
            { rs, _ -> rs.getTimestamp("revoked_at")?.toInstant() },
            sessionKey,
        )

    private data class MemberDeletionState(
        val username: String,
        val email: String?,
        val deletedAt: java.time.Instant?,
        val ipSecurityEnabled: Boolean,
        val ipSecurityFingerprint: String?,
    )

    private data class PostDeletionState(
        val published: Boolean,
        val listed: Boolean,
        val deletedAt: java.time.Instant?,
    )

    private data class UploadedFileState(
        val status: String,
        val retentionReason: String?,
        val purgeAfter: java.time.Instant?,
    )
}
