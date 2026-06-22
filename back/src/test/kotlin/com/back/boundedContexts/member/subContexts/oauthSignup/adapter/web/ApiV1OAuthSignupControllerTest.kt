package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.boundedContexts.member.subContexts.oauthSignup.application.service.OAuthSignupPendingDetails
import com.back.boundedContexts.member.subContexts.oauthSignup.application.service.OAuthSignupPendingStartResult
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("ApiV1OAuthSignupController 테스트")
class ApiV1OAuthSignupControllerTest {
    @Test
    fun `pending은 token으로 social signup 세션을 조회한다`() {
        val useCase = RecordingOAuthSignupUseCase()
        val controller = ApiV1OAuthSignupController(useCase)

        val response =
            controller.pending(
                ApiV1OAuthSignupController.SocialSignupPendingRequest(
                    token = "pending-token",
                ),
            )

        assertThat(response.resultCode).isEqualTo("200-3")
        assertThat(response.data.provider).isEqualTo("KAKAO")
        assertThat(response.data.nickname).isEqualTo("카카오닉네임")
        assertThat(response.data.profileImgUrl).isEqualTo("https://kakao.cdn/profile.png")
        assertThat(response.data.expiresAt).isEqualTo(Instant.EPOCH.plusSeconds(300))
        assertThat(useCase.lastFindPendingToken).isEqualTo("pending-token")
    }

    @Test
    fun `complete는 legal acceptance payload와 nickname으로 social signup을 완료한다`() {
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.site",
            siteFrontUrl = "https://www.aquilaxk.site",
        )
        val useCase = RecordingOAuthSignupUseCase()
        val controller = ApiV1OAuthSignupController(useCase)

        val response =
            controller.complete(
                ApiV1OAuthSignupController.SocialSignupCompleteRequest(
                    token = "pending-token",
                    nickname = "완료닉네임",
                    termsVersion = "2026-06-21",
                    termsContentSha256 = TERMS_HASH,
                    privacyVersion = "2026-06-21",
                    privacyContentSha256 = PRIVACY_HASH,
                    age14OrOlder = true,
                    requiredPrivacyConfirmed = true,
                    analyticsConsent = false,
                    overseasTransferAcknowledged = true,
                ),
            )

        assertThat(response.resultCode).isEqualTo("201-3")
        assertThat(response.msg).contains("완료닉네임")
        assertThat(response.data.name).isEqualTo("완료닉네임")
        assertThat(useCase.lastCompletePendingToken).isEqualTo("pending-token")
        assertThat(useCase.lastCompleteNickname).isEqualTo("완료닉네임")
        assertThat(useCase.lastLegalAcceptance)
            .isEqualTo(
                LegalAcceptanceCommand(
                    termsVersion = "2026-06-21",
                    termsContentSha256 = TERMS_HASH,
                    privacyVersion = "2026-06-21",
                    privacyContentSha256 = PRIVACY_HASH,
                    age14OrOlder = true,
                    requiredPrivacyConfirmed = true,
                    analyticsConsent = false,
                    overseasTransferAcknowledged = true,
                ),
            )
    }

    @Test
    fun `complete request는 nickname 생략과 legal command 변환을 지원한다`() {
        val request =
            ApiV1OAuthSignupController.SocialSignupCompleteRequest(
                token = "pending-token",
                termsVersion = "2026-06-21",
                termsContentSha256 = TERMS_HASH,
                privacyVersion = "2026-06-21",
                privacyContentSha256 = PRIVACY_HASH,
                age14OrOlder = true,
                requiredPrivacyConfirmed = true,
                analyticsConsent = true,
                overseasTransferAcknowledged = true,
            )

        val command = request.toLegalAcceptanceCommand()

        assertThat(request.token).isEqualTo("pending-token")
        assertThat(request.nickname).isNull()
        assertThat(request.termsVersion).isEqualTo("2026-06-21")
        assertThat(request.termsContentSha256).isEqualTo(TERMS_HASH)
        assertThat(request.privacyVersion).isEqualTo("2026-06-21")
        assertThat(request.privacyContentSha256).isEqualTo(PRIVACY_HASH)
        assertThat(request.age14OrOlder).isTrue()
        assertThat(request.requiredPrivacyConfirmed).isTrue()
        assertThat(request.analyticsConsent).isTrue()
        assertThat(request.overseasTransferAcknowledged).isTrue()
        assertThat(command.termsVersion).isEqualTo("2026-06-21")
        assertThat(command.termsContentSha256).isEqualTo(TERMS_HASH)
        assertThat(command.privacyVersion).isEqualTo("2026-06-21")
        assertThat(command.privacyContentSha256).isEqualTo(PRIVACY_HASH)
        assertThat(command.age14OrOlder).isTrue()
        assertThat(command.requiredPrivacyConfirmed).isTrue()
        assertThat(command.analyticsConsent).isTrue()
        assertThat(command.overseasTransferAcknowledged).isTrue()
    }

    private companion object {
        private const val TERMS_HASH = "3b71950e518b16b9a24cb4f9873633720ca7a9fce145a7bb9787c48845b56c5b"
        private const val PRIVACY_HASH = "cedbfea674a9e2aca9e29bf6a01492a1e3fa640b0ff53d47f969d64c057b980f"
    }
}

private class RecordingOAuthSignupUseCase : OAuthSignupUseCase {
    var lastFindPendingToken: String? = null
        private set
    var lastCompletePendingToken: String? = null
        private set
    var lastCompleteNickname: String? = null
        private set
    var lastLegalAcceptance: LegalAcceptanceCommand? = null
        private set

    override fun providerSubjectHash(
        provider: String,
        providerSubject: String,
    ): String = error("providerSubjectHash is not used in ApiV1OAuthSignupControllerTest")

    override fun memberLoginId(
        provider: String,
        providerSubjectHash: String,
    ): String = error("memberLoginId is not used in ApiV1OAuthSignupControllerTest")

    override fun startPending(
        provider: String,
        providerSubject: String,
        nickname: String,
        profileImgUrl: String?,
    ): OAuthSignupPendingStartResult = error("startPending is not used in ApiV1OAuthSignupControllerTest")

    override fun findPending(pendingToken: String): OAuthSignupPendingDetails {
        lastFindPendingToken = pendingToken
        return OAuthSignupPendingDetails(
            provider = "KAKAO",
            nickname = "카카오닉네임",
            profileImgUrl = "https://kakao.cdn/profile.png",
            expiresAt = Instant.EPOCH.plusSeconds(300),
        )
    }

    override fun completeSignup(
        pendingToken: String,
        nickname: String?,
        legalAcceptance: LegalAcceptanceCommand,
    ): Member {
        lastCompletePendingToken = pendingToken
        lastCompleteNickname = nickname
        lastLegalAcceptance = legalAcceptance
        return Member(
            id = 7,
            username = "KAKAO__subject-hash",
            password = null,
            nickname = nickname ?: "카카오사용자",
        ).apply {
            createdAt = Instant.EPOCH
            modifiedAt = Instant.EPOCH.plusSeconds(1)
        }
    }

    override fun releaseConsumedSignupForMemberLoginId(memberLoginId: String): Int =
        error("releaseConsumedSignupForMemberLoginId is not used in ApiV1OAuthSignupControllerTest")
}
