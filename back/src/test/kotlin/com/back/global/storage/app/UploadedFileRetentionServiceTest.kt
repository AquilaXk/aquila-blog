package com.back.global.storage.app

import com.back.boundedContexts.member.application.port.out.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostImageStoragePort
import com.back.boundedContexts.post.application.port.out.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.jpa.config.JpaConfig
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import com.back.global.storage.out.UploadedFileRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Duration
import java.time.Instant

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(UploadedFileRetentionService::class, JpaConfig::class, UploadedFileRetentionServiceTest.TestConfig::class)
class UploadedFileRetentionServiceTest {
    @Autowired
    private lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @Autowired
    private lateinit var uploadedFileRepository: UploadedFileRepository

    @MockitoBean
    private lateinit var postRepository: PostRepositoryPort

    @MockitoBean
    private lateinit var memberAttrRepository: MemberAttrRepositoryPort

    @MockitoBean
    private lateinit var postImageStoragePort: PostImageStoragePort

    @Test
    fun `업로드 직후 파일은 1일 보존 임시 파일로 등록된다`() {
        val objectKey = "posts/2026/03/temp-upload.png"

        uploadedFileRetentionService.registerTempUpload(
            objectKey = objectKey,
            contentType = "image/png",
            fileSize = 2048,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )

        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey)!!

        assertThat(uploadedFile.status).isEqualTo(UploadedFileStatus.TEMP)
        assertThat(uploadedFile.retentionReason).isEqualTo(UploadedFileRetentionReason.TEMP_UPLOAD)
        assertThat(uploadedFile.purpose).isEqualTo(UploadedFilePurpose.POST_IMAGE)
        assertThat(uploadedFile.fileSize).isEqualTo(2048)
        assertThat(Duration.between(Instant.now(), uploadedFile.purgeAfter)).isBetween(
            Duration.ofHours(23),
            Duration.ofHours(25),
        )
    }

    @Test
    fun `프로필 이미지를 교체하면 새 이미지는 활성화되고 이전 이미지는 3일 후 삭제 예약된다`() {
        val oldKey = "posts/2026/03/profile-old.png"
        val newKey = "posts/2026/03/profile-new.png"
        val oldUrl = UploadedFileUrlCodec.buildImageUrl(oldKey)
        val newUrl = UploadedFileUrlCodec.buildImageUrl(newKey)

        uploadedFileRetentionService.registerTempUpload(oldKey, "image/png", 100, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.registerTempUpload(newKey, "image/png", 200, UploadedFilePurpose.PROFILE_IMAGE)

        uploadedFileRetentionService.syncProfileImage(
            memberId = 7,
            previousProfileImgUrl = oldUrl,
            currentProfileImgUrl = newUrl,
        )

        val oldFile = uploadedFileRepository.findByObjectKey(oldKey)!!
        val newFile = uploadedFileRepository.findByObjectKey(newKey)!!

        assertThat(newFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(newFile.ownerType).isEqualTo(UploadedFileOwnerType.MEMBER_PROFILE)
        assertThat(newFile.ownerId).isEqualTo(7)
        assertThat(newFile.purpose).isEqualTo(UploadedFilePurpose.PROFILE_IMAGE)
        assertThat(newFile.purgeAfter).isNull()

        assertThat(oldFile.status).isEqualTo(UploadedFileStatus.PENDING_DELETE)
        assertThat(oldFile.retentionReason).isEqualTo(UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE)
        assertThat(oldFile.purpose).isEqualTo(UploadedFilePurpose.PROFILE_IMAGE)
        assertThat(Duration.between(Instant.now(), oldFile.purgeAfter)).isBetween(
            Duration.ofDays(2),
            Duration.ofDays(4),
        )
    }

    @Test
    fun `게시글 본문에서 제거된 이미지는 14일 후 삭제 예약된다`() {
        val removedKey = "posts/2026/03/removed-image.png"
        val activeKey = "posts/2026/03/active-image.png"
        val previousContent = "![](${UploadedFileUrlCodec.buildImageUrl(removedKey)})"
        val currentContent = "![](${UploadedFileUrlCodec.buildImageUrl(activeKey)})"

        uploadedFileRetentionService.registerTempUpload(removedKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)
        uploadedFileRetentionService.registerTempUpload(activeKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)

        uploadedFileRetentionService.syncPostContent(
            postId = 15,
            previousContent = previousContent,
            currentContent = currentContent,
        )

        val removedFile = uploadedFileRepository.findByObjectKey(removedKey)!!
        val activeFile = uploadedFileRepository.findByObjectKey(activeKey)!!

        assertThat(activeFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(activeFile.ownerType).isEqualTo(UploadedFileOwnerType.POST)
        assertThat(activeFile.ownerId).isEqualTo(15)
        assertThat(activeFile.purgeAfter).isNull()

        assertThat(removedFile.status).isEqualTo(UploadedFileStatus.PENDING_DELETE)
        assertThat(removedFile.retentionReason).isEqualTo(UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT)
        assertThat(Duration.between(Instant.now(), removedFile.purgeAfter)).isBetween(
            Duration.ofDays(13),
            Duration.ofDays(15),
        )
    }

    @Test
    fun `cleanup 진단은 purge 후보 수와 샘플 object key를 보여준다`() {
        val objectKey = "posts/2026/03/diagnostics-temp.png"

        uploadedFileRetentionService.registerTempUpload(
            objectKey = objectKey,
            contentType = "image/png",
            fileSize = 512,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )

        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey)!!
        uploadedFile.purgeAfter = Instant.now().minusSeconds(60)
        uploadedFileRepository.save(uploadedFile)

        val diagnostics = uploadedFileRetentionService.diagnoseCleanup()

        assertThat(diagnostics.tempCount).isGreaterThanOrEqualTo(1)
        assertThat(diagnostics.eligibleForPurgeCount).isGreaterThanOrEqualTo(1)
        assertThat(diagnostics.sampleEligibleObjectKeys).contains(objectKey)
    }

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
                adminUsername = "admin",
                adminPassword = "",
            )
        }
    }

    @TestConfiguration
    class TestConfig {
        @Bean
        fun postImageStorageProperties(): PostImageStorageProperties = PostImageStorageProperties()

        @Bean
        fun uploadedFileRetentionProperties(): UploadedFileRetentionProperties = UploadedFileRetentionProperties()
    }
}
