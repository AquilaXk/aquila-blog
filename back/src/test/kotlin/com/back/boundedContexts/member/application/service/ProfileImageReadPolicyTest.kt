package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.ProfileImageReadUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.app.AdminProperties
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileRetentionReason
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.lang.reflect.Field
import java.time.Instant
import java.util.Optional

@org.junit.jupiter.api.DisplayName("ProfileImageReadPolicy 테스트")
class ProfileImageReadPolicyTest {
    private val memberRepository = mock(MemberRepositoryPort::class.java)
    private val currentMemberProfileQueryUseCase = mock(CurrentMemberProfileQueryUseCase::class.java)
    private val owner = Member(7L, "admin", null, "관리자", "admin@test.com", true)
    private val policy =
        ProfileImageReadPolicy(
            memberRepository = memberRepository,
            canonicalAdminPolicy = CanonicalAdminPolicy(AdminProperties(email = "admin@test.com")),
            currentMemberProfileQueryUseCase = currentMemberProfileQueryUseCase,
        )

    @Test
    fun `ACTIVE 발행 프로필 이미지는 정확한 canonical key일 때 공개한다`() {
        withIsolatedAppConfig {
            val objectKey = "profiles/7/published.png"
            val uploadedFile = profileImage(objectKey)
            `when`(memberRepository.findById(owner.id)).thenReturn(Optional.of(owner))
            `when`(currentMemberProfileQueryUseCase.getPublishedById(owner.id)).thenReturn(profile(objectKey))

            assertThat(policy.resolve(objectKey, uploadedFile, null)).isEqualTo(ProfileImageReadUseCase.Access.PUBLIC)
        }
    }

    @Test
    fun `발행본이 아닌 history 이미지는 owner만 private으로 읽는다`() {
        val objectKey = "profiles/7/history.png"
        val uploadedFile =
            profileImage(objectKey).apply {
                scheduleDeletion(UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE, Instant.now())
            }
        `when`(memberRepository.findById(owner.id)).thenReturn(Optional.of(owner))

        assertThat(policy.resolve(objectKey, uploadedFile, owner.id)).isEqualTo(ProfileImageReadUseCase.Access.OWNER_ONLY)
        assertThatThrownBy { policy.resolve(objectKey, uploadedFile, null) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")
    }

    @Test
    fun `anonymous foreign viewer와 deleted profile 이미지는 공개하지 않는다`() {
        withIsolatedAppConfig {
            val objectKey = "profiles/7/draft.png"
            val activeUnpublished = profileImage(objectKey)
            `when`(memberRepository.findById(owner.id)).thenReturn(Optional.of(owner))
            `when`(currentMemberProfileQueryUseCase.getPublishedById(owner.id)).thenReturn(profile("profiles/7/published.png"))

            assertThatThrownBy { policy.resolve(objectKey, activeUnpublished, null) }
                .isInstanceOf(AppException::class.java)
            assertThatThrownBy { policy.resolve(objectKey, activeUnpublished, 8L) }
                .isInstanceOf(AppException::class.java)

            val deleted = profileImage("profiles/7/deleted.png").apply { markDeleted() }
            assertThatThrownBy { policy.resolve("profiles/7/deleted.png", deleted, owner.id) }
                .isInstanceOf(AppException::class.java)
        }
    }

    @Test
    fun `canonical admin이 아닌 profile owner는 읽을 수 없다`() {
        val noncanonicalOwner = Member(8L, "other", null, "다른 관리자", "other@test.com", true)
        val uploadedFile = profileImage("profiles/8/current.png").apply { attachToMemberProfile(noncanonicalOwner.id) }
        `when`(memberRepository.findById(noncanonicalOwner.id)).thenReturn(Optional.of(noncanonicalOwner))

        assertThatThrownBy { policy.resolve("profiles/8/current.png", uploadedFile, noncanonicalOwner.id) }
            .isInstanceOf(AppException::class.java)
    }

    private fun profileImage(objectKey: String): UploadedFile =
        UploadedFile(
            objectKey = objectKey,
            bucket = "blog-images",
            contentType = "image/png",
            fileSize = 3,
        ).apply { attachToMemberProfile(owner.id) }

    private fun profile(objectKey: String): MemberWithUsernameDto =
        MemberWithUsernameDto(
            id = owner.id,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            isAdmin = true,
            username = "admin",
            name = "관리자",
            nickname = "관리자",
            profileImageUrl = UploadedFileUrlCodec.buildRelativeImagePath(objectKey),
            profileRole = "",
            profileBio = "",
            aboutHeadline = "",
            aboutRole = "",
            aboutBio = "",
            aboutSections = emptyList(),
            aboutProjectSectionTitle = "",
            aboutProjects = emptyList(),
            blogTitle = "",
            homeIntroTitle = "",
            homeIntroDescription = "",
            blogDesign = "",
            legacyBlogScheme = "",
            serviceLinks = emptyList(),
            contactLinks = emptyList(),
        )

    private fun <T> withIsolatedAppConfig(block: () -> T): T {
        val snapshot = appConfigUrlSnapshot()
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.test",
            siteFrontUrl = "https://www.aquilaxk.test",
        )

        return try {
            block()
        } finally {
            appConfigUrlFields.zip(snapshot).forEach { (field, value) -> field.set(null, value) }
        }
    }

    private fun appConfigUrlSnapshot(): List<Any?> = appConfigUrlFields.map { field -> field.get(null) }

    private val appConfigUrlFields: List<Field> by lazy {
        listOf("siteBackUrl", "siteFrontUrl").map { name ->
            AppConfig::class.java.getDeclaredField(name).apply { isAccessible = true }
        }
    }
}
