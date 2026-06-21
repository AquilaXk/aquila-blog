package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceApplicationService
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output.PendingOAuthSignupRepositoryPort
import com.back.boundedContexts.member.subContexts.oauthSignup.model.PendingOAuthSignup
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PagedResult
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.Optional

@DisplayName("OAuthSignupApplicationService 테스트")
class OAuthSignupApplicationServiceTest {
    @Test
    fun `pending 시작은 OAuth redirect 예외 rollback과 분리되는 새 transaction에서 실행한다`() {
        val method =
            OAuthSignupApplicationService::class.java.getMethod(
                "startPending",
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
            )

        val transactional = method.getAnnotation(Transactional::class.java)

        assertThat(transactional.propagation)
            .isEqualTo(Propagation.REQUIRES_NEW)
    }

    @Test
    fun `신규 OAuth pending은 원문 token과 provider subject 대신 hash를 저장한다`() {
        val fixture = Fixture()
        val result =
            fixture.service.startPending(
                provider = "kakao",
                providerSubject = RAW_PROVIDER_SUBJECT,
                nickname = "카카오닉네임",
                profileImgUrl = "https://kakao.cdn/profile.png",
            )

        val pending = fixture.pendingRepository.saved.single()

        assertThat(result.pendingToken).isNotBlank()
        assertThat(pending.provider).isEqualTo("KAKAO")
        assertThat(pending.providerSubjectHash).isEqualTo(
            fixture.hashService.providerSubjectHash("KAKAO", RAW_PROVIDER_SUBJECT),
        )
        assertThat(pending.memberLoginId).isEqualTo(
            fixture.hashService.memberLoginId("KAKAO", pending.providerSubjectHash),
        )
        assertThat(pending.pendingTokenHash).isEqualTo(fixture.hashService.pendingTokenHash(result.pendingToken))
        assertThat(pending.pendingTokenHash).doesNotContain(result.pendingToken)
        assertThat(pending.providerSubjectHash).doesNotContain(RAW_PROVIDER_SUBJECT)
        assertThat(pending.memberLoginId).doesNotContain(RAW_PROVIDER_SUBJECT)
    }

    @Test
    fun `provider subject hash와 member login id helper는 hash service 계약을 노출한다`() {
        val fixture = Fixture()

        val providerSubjectHash =
            fixture.service.providerSubjectHash(
                provider = " kakao ",
                providerSubject = RAW_PROVIDER_SUBJECT,
            )
        val memberLoginId =
            fixture.service.memberLoginId(
                provider = " kakao ",
                providerSubjectHash = providerSubjectHash,
            )

        assertThat(providerSubjectHash)
            .isEqualTo(fixture.hashService.providerSubjectHash(" kakao ", RAW_PROVIDER_SUBJECT))
        assertThat(memberLoginId)
            .isEqualTo(fixture.hashService.memberLoginId(" kakao ", providerSubjectHash))
    }

    @Test
    fun `이미 연결된 member login id가 있으면 pending을 시작하지 않는다`() {
        val fixture = Fixture()
        fixture.memberUseCase.existingLoginIds +=
            fixture.hashService.memberLoginId(
                "KAKAO",
                fixture.hashService.providerSubjectHash("KAKAO", "subject-existing-member"),
            )

        assertThatThrownBy {
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-existing-member",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미 연결된 소셜 계정")
    }

    @Test
    fun `provider nickname이 정책 범위를 벗어나도 pending을 만들고 기본 표시 이름을 사용한다`() {
        val fixture = Fixture()

        fixture.service.startPending(
            provider = "KAKAO",
            providerSubject = "subject-invalid-nickname",
            nickname = "x",
            profileImgUrl = null,
        )

        val pending = fixture.pendingRepository.saved.single()
        assertThat(pending.nickname).isEqualTo("카카오사용자")
    }

    @Test
    fun `이미 소비된 pending row가 있으면 callback refresh를 거부한다`() {
        val fixture = Fixture()
        fixture.service.startPending(
            provider = "KAKAO",
            providerSubject = "subject-consumed",
            nickname = "카카오닉네임",
            profileImgUrl = null,
        )
        fixture.pendingRepository.saved
            .single()
            .consume(Instant.EPOCH.plusSeconds(1))

        assertThatThrownBy {
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-consumed",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미 처리된 소셜 회원가입")
    }

    @Test
    fun `최종 제출 nickname은 정책 범위 검증을 유지한다`() {
        val fixture = Fixture()
        val start =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-final-invalid-nickname",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )

        assertThatThrownBy {
            fixture.service.completeSignup(
                pendingToken = start.pendingToken,
                nickname = "x",
                legalAcceptance = validLegalAcceptance(),
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("프로필 이름은 2~30자")
    }

    @Test
    fun `같은 OAuth subject가 다시 callback되면 기존 pending row를 새 token hash로 갱신한다`() {
        val fixture = Fixture()
        val first =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-1",
                nickname = "첫닉네임",
                profileImgUrl = null,
            )
        val second =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-1",
                nickname = "둘닉네임",
                profileImgUrl = "/profile.png",
            )

        assertThat(first.pendingToken).isNotEqualTo(second.pendingToken)
        assertThat(fixture.pendingRepository.saved).hasSize(1)
        val refreshedPending = fixture.pendingRepository.saved.single()
        assertThat(refreshedPending.nickname)
            .isEqualTo("둘닉네임")
        assertThat(refreshedPending.pendingTokenHash)
            .isEqualTo(fixture.hashService.pendingTokenHash(second.pendingToken))
    }

    @Test
    fun `pending 조회는 token hash로 세션 상세를 반환한다`() {
        val fixture = Fixture()
        val start =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-readable",
                nickname = "카카오닉네임",
                profileImgUrl = "https://kakao.cdn/profile.png",
            )

        val pending = fixture.service.findPending(start.pendingToken)

        assertThat(pending.provider).isEqualTo("KAKAO")
        assertThat(pending.nickname).isEqualTo("카카오닉네임")
        assertThat(pending.profileImgUrl).isEqualTo("https://kakao.cdn/profile.png")
        assertThat(pending.expiresAt).isEqualTo(start.expiresAt)
    }

    @Test
    fun `pending 조회는 blank token과 없는 token을 거부한다`() {
        val fixture = Fixture()

        assertThatThrownBy { fixture.service.findPending(" ") }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("올바르지 않습니다")
        assertThatThrownBy { fixture.service.findPending("missing-token") }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("유효하지 않은")
    }

    @Test
    fun `blank provider는 pending 시작을 거부한다`() {
        val fixture = Fixture()

        assertThatThrownBy {
            fixture.service.startPending(
                provider = " ",
                providerSubject = "subject",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("제공자가 올바르지 않습니다")
    }

    @Test
    fun `pending 완료는 member와 social legal acceptance를 생성하고 pending을 소비한다`() {
        val fixture = Fixture()
        val start =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-2",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )

        val member =
            fixture.service.completeSignup(
                pendingToken = start.pendingToken,
                nickname = "완료닉네임",
                legalAcceptance = validLegalAcceptance(),
            )

        assertThat(member.username).isEqualTo(
            fixture.hashService.memberLoginId(
                "KAKAO",
                fixture.hashService.providerSubjectHash("KAKAO", "subject-2"),
            ),
        )
        assertThat(member.nickname).isEqualTo("완료닉네임")
        val legalAcceptance = fixture.legalAcceptanceRepository.saved.single()
        val consumedPending = fixture.pendingRepository.saved.single()
        assertThat(legalAcceptance.id)
            .isEqualTo(0)
        assertThat(legalAcceptance.source)
            .isEqualTo("KAKAO_OAUTH_SIGNUP")
        assertThat(consumedPending.consumedAt)
            .isNotNull()
    }

    @Test
    fun `소비된 pending token은 재사용할 수 없다`() {
        val fixture = Fixture()
        val start =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-3",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )
        fixture.service.completeSignup(
            pendingToken = start.pendingToken,
            nickname = null,
            legalAcceptance = validLegalAcceptance(),
        )

        assertThatThrownBy {
            fixture.service.completeSignup(
                pendingToken = start.pendingToken,
                nickname = null,
                legalAcceptance = validLegalAcceptance(),
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("더 이상 유효하지 않습니다")
    }

    @Test
    fun `이미 같은 login id의 member가 있으면 pending 완료를 취소하고 충돌을 반환한다`() {
        val fixture = Fixture()
        val start =
            fixture.service.startPending(
                provider = "KAKAO",
                providerSubject = "subject-4",
                nickname = "카카오닉네임",
                profileImgUrl = null,
            )
        fixture.memberUseCase.existingLoginIds +=
            fixture.hashService.memberLoginId(
                "KAKAO",
                fixture.hashService.providerSubjectHash("KAKAO", "subject-4"),
            )

        assertThatThrownBy {
            fixture.service.completeSignup(
                pendingToken = start.pendingToken,
                nickname = null,
                legalAcceptance = validLegalAcceptance(),
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미 연결된 소셜 계정")

        val cancelledPending = fixture.pendingRepository.saved.single()
        assertThat(cancelledPending.cancelledAt)
            .isNotNull()
    }

    private class Fixture {
        val memberUseCase = RecordingMemberUseCase()
        val legalAcceptanceRepository = RecordingLegalAcceptanceRepository()
        val legalAcceptanceService = LegalAcceptanceApplicationService(legalAcceptanceRepository)
        val pendingRepository = RecordingPendingOAuthSignupRepository()
        val hashService = OAuthSignupHashService("", "", "test-jwt-secret")
        val service =
            OAuthSignupApplicationService(
                memberUseCase = memberUseCase,
                legalAcceptanceApplicationService = legalAcceptanceService,
                pendingOAuthSignupRepository = pendingRepository,
                oauthSignupHashService = hashService,
                pendingExpirationSeconds = 1800,
            )
    }

    private companion object {
        private const val RAW_PROVIDER_SUBJECT = "raw-kakao-subject"
    }
}

private fun validLegalAcceptance(): LegalAcceptanceCommand =
    LegalAcceptanceCommand(
        termsVersion = "2026-06-21",
        termsContentSha256 = "3b71950e518b16b9a24cb4f9873633720ca7a9fce145a7bb9787c48845b56c5b",
        privacyVersion = "2026-06-21",
        privacyContentSha256 = "cedbfea674a9e2aca9e29bf6a01492a1e3fa640b0ff53d47f969d64c057b980f",
        age14OrOlder = true,
        requiredPrivacyConfirmed = true,
        analyticsConsent = false,
        overseasTransferAcknowledged = true,
    )

private class RecordingPendingOAuthSignupRepository : PendingOAuthSignupRepositoryPort {
    val saved = mutableListOf<PendingOAuthSignup>()

    override fun save(pendingOAuthSignup: PendingOAuthSignup): PendingOAuthSignup {
        saved.removeIf {
            it.provider == pendingOAuthSignup.provider &&
                it.providerSubjectHash == pendingOAuthSignup.providerSubjectHash
        }
        saved += pendingOAuthSignup
        return pendingOAuthSignup
    }

    override fun findByProviderAndProviderSubjectHash(
        provider: String,
        providerSubjectHash: String,
    ): PendingOAuthSignup? =
        saved.firstOrNull {
            it.provider == provider &&
                it.providerSubjectHash == providerSubjectHash
        }

    override fun findByPendingTokenHash(pendingTokenHash: String): PendingOAuthSignup? =
        saved.firstOrNull { it.pendingTokenHash == pendingTokenHash }
}

private class RecordingLegalAcceptanceRepository : MemberLegalAcceptanceRepositoryPort {
    val saved = mutableListOf<MemberLegalAcceptance>()

    override fun save(memberLegalAcceptance: MemberLegalAcceptance): MemberLegalAcceptance {
        saved += memberLegalAcceptance
        return memberLegalAcceptance
    }
}

private class RecordingMemberUseCase : MemberUseCase {
    val existingLoginIds = mutableSetOf<String>()
    val members = mutableListOf<Member>()

    override fun count(): Long = members.size.toLong()

    override fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String?,
    ): Member {
        if (existingLoginIds.contains(username)) {
            throw AppException("409-1", "이미 존재하는 회원 아이디입니다.")
        }

        val member =
            Member(
                id = members.size.toLong() + 1,
                username = username,
                password = password,
                nickname = nickname,
                email = email,
            )
        members += member
        existingLoginIds += username
        profileImgUrl?.let { member.profileImgUrl = it }
        return member
    }

    override fun joinWithVerifiedEmail(
        email: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member = error("joinWithVerifiedEmail is not used")

    override fun findByLoginId(loginId: String): Member? =
        members.firstOrNull { it.username == loginId }
            ?: existingLoginIds
                .takeIf { it.contains(loginId) }
                ?.let { Member(id = 99, username = loginId, password = null, nickname = "기존회원") }

    override fun findByEmail(email: String): Member? = null

    override fun findById(id: Long): Optional<Member> = Optional.empty()

    override fun checkPassword(
        member: Member,
        rawPassword: String,
    ) = Unit

    override fun modify(
        member: Member,
        nickname: String,
        profileImgUrl: String?,
    ) = Unit

    override fun modifyProfileCard(
        member: Member,
        role: String,
        bio: String,
        aboutRole: String?,
        aboutBio: String?,
        aboutDetails: String?,
        blogTitle: String,
        homeIntroTitle: String,
        homeIntroDescription: String,
        blogDesign: String,
        legacyBlogScheme: String,
        serviceLinks: List<MemberProfileLinkItem>,
        contactLinks: List<MemberProfileLinkItem>,
    ) = Unit

    override fun saveProfileWorkspaceDraft(
        member: Member,
        content: MemberProfileWorkspaceContent,
    ) = Unit

    override fun publishProfileWorkspace(member: Member) = Unit

    override fun modifyOrJoin(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): RsData<Member> = error("modifyOrJoin is not used")

    override fun findPagedByKw(
        kw: String,
        sort: MemberSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Member> =
        PagedResult(
            content = emptyList(),
            page = page,
            pageSize = pageSize,
            totalElements = 0,
        )
}
