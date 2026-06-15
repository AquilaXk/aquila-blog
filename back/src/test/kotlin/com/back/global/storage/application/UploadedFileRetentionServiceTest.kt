package com.back.global.storage.application

import com.back.global.app.AppConfig
import com.back.global.storage.adapter.persistence.UploadedFileRepository
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import com.back.support.BaseUploadedFileRetentionServiceIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.BDDMockito.then
import org.springframework.beans.factory.annotation.Autowired
import java.time.Duration
import java.time.Instant

@org.junit.jupiter.api.DisplayName("UploadedFileRetentionService 테스트")
class UploadedFileRetentionServiceTest : BaseUploadedFileRetentionServiceIntegrationTest() {
    @Autowired
    private lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @Autowired
    private lateinit var uploadedFileRepository: UploadedFileRepository

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
    fun `업로드 파일 시퀀스는 이미지 업로드 경로에서 1씩 증가한다`() {
        uploadedFileRetentionService.registerTempUpload(
            objectKey = "posts/2026/03/seq-first.png",
            contentType = "image/png",
            fileSize = 128,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        uploadedFileRetentionService.registerTempUpload(
            objectKey = "posts/2026/03/seq-second.png",
            contentType = "image/png",
            fileSize = 256,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )

        val first = uploadedFileRepository.findByObjectKey("posts/2026/03/seq-first.png")!!
        val second = uploadedFileRepository.findByObjectKey("posts/2026/03/seq-second.png")!!

        assertThat(second.id).isEqualTo(first.id + 1)
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
    fun `프로필 이미지 이력은 현재 이미지와 교체된 이미지를 함께 반환한다`() {
        val oldKey = "posts/2026/03/profile-history-old.png"
        val newKey = "posts/2026/03/profile-history-new.png"
        val oldUrl = UploadedFileUrlCodec.buildImageUrl(oldKey)
        val newUrl = UploadedFileUrlCodec.buildImageUrl(newKey)

        uploadedFileRetentionService.registerTempUpload(oldKey, "image/png", 100, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.registerTempUpload(newKey, "image/png", 200, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.syncProfileImage(7, previousProfileImgUrl = oldUrl, currentProfileImgUrl = newUrl)

        val images = uploadedFileRetentionService.listProfileImages(7, protectedProfileImgUrls = listOf(newUrl))

        assertThat(images).extracting("objectKey").contains(oldKey, newKey)
        assertThat(images.single { it.objectKey == newKey }.isCurrent).isTrue()
        assertThat(images.single { it.objectKey == oldKey }.isCurrent).isFalse()
    }

    @Test
    fun `과거 프로필 이미지는 삭제할 수 있지만 현재 이미지는 삭제할 수 없다`() {
        val oldKey = "posts/2026/03/profile-delete-old.png"
        val newKey = "posts/2026/03/profile-delete-new.png"
        val oldUrl = UploadedFileUrlCodec.buildImageUrl(oldKey)
        val newUrl = UploadedFileUrlCodec.buildImageUrl(newKey)

        uploadedFileRetentionService.registerTempUpload(oldKey, "image/png", 100, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.registerTempUpload(newKey, "image/png", 200, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.syncProfileImage(7, previousProfileImgUrl = oldUrl, currentProfileImgUrl = newUrl)

        val oldFile = uploadedFileRepository.findByObjectKey(oldKey)!!
        val newFile = uploadedFileRepository.findByObjectKey(newKey)!!

        uploadedFileRetentionService.deleteProfileImage(7, oldFile.id, protectedProfileImgUrls = listOf(newUrl))

        assertThat(uploadedFileRepository.findByObjectKey(oldKey)!!.status).isEqualTo(UploadedFileStatus.DELETED)
        then(postImageStoragePort).should().deletePostImage(oldKey)
        assertThatThrownBy {
            uploadedFileRetentionService.deleteProfileImage(7, newFile.id, protectedProfileImgUrls = listOf(newUrl))
        }.hasMessageContaining("현재 사용 중인 프로필 이미지는 삭제할 수 없습니다")
    }

    @Test
    fun `published 프로필 이미지는 초안에서 교체되어도 삭제할 수 없다`() {
        val publishedKey = "posts/2026/03/profile-published.png"
        val draftKey = "posts/2026/03/profile-draft.png"
        val publishedUrl = UploadedFileUrlCodec.buildImageUrl(publishedKey)
        val draftUrl = UploadedFileUrlCodec.buildImageUrl(draftKey)

        uploadedFileRetentionService.registerTempUpload(publishedKey, "image/png", 100, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.registerTempUpload(draftKey, "image/png", 200, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.syncProfileImage(7, previousProfileImgUrl = publishedUrl, currentProfileImgUrl = draftUrl)

        val publishedFile = uploadedFileRepository.findByObjectKey(publishedKey)!!

        assertThatThrownBy {
            uploadedFileRetentionService.deleteProfileImage(
                7,
                publishedFile.id,
                protectedProfileImgUrls = listOf(draftUrl, publishedUrl),
            )
        }.hasMessageContaining("현재 사용 중인 프로필 이미지는 삭제할 수 없습니다")
        then(postImageStoragePort).shouldHaveNoInteractions()
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
    fun `본문에 잘못 인코딩된 이미지 URL이 포함되어도 동기화가 실패하지 않는다`() {
        val validKey = "posts/2026/03/valid-image.png"
        val malformedEncodedKey = "%E0%A4%A"
        val currentContent =
            """
            ![](${UploadedFileUrlCodec.buildImageUrl(validKey)})
            ![](${AppConfig.siteBackUrl}/post/api/v1/images/$malformedEncodedKey)
            """.trimIndent()

        uploadedFileRetentionService.registerTempUpload(validKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)

        uploadedFileRetentionService.syncPostContent(
            postId = 21,
            previousContent = null,
            currentContent = currentContent,
        )

        val activeFile = uploadedFileRepository.findByObjectKey(validKey)!!
        assertThat(activeFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(activeFile.ownerType).isEqualTo(UploadedFileOwnerType.POST)
        assertThat(activeFile.ownerId).isEqualTo(21)
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

    @Test
    fun `삭제 예약은 추적 중인 첨부파일에만 적용되고 미등록 키는 무시한다`() {
        val knownKey = "posts/2026/03/known-image.png"
        val unknownLegacyKey = "legacy-" + "x".repeat(1500)
        val content =
            """
            ![](${UploadedFileUrlCodec.buildImageUrl(knownKey)})
            ![](${AppConfig.siteBackUrl}/post/api/v1/images/$unknownLegacyKey)
            """.trimIndent()

        uploadedFileRetentionService.registerTempUpload(knownKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)

        assertDoesNotThrow {
            uploadedFileRetentionService.scheduleDeletedPostAttachments(content)
        }

        val knownFile = uploadedFileRepository.findByObjectKey(knownKey)!!
        assertThat(knownFile.status).isEqualTo(UploadedFileStatus.PENDING_DELETE)
        assertThat(knownFile.retentionReason).isEqualTo(UploadedFileRetentionReason.DELETED_POST_ATTACHMENT)
        assertThat(uploadedFileRepository.findByObjectKey(unknownLegacyKey)).isNull()
    }

    @Test
    fun `삭제 글 복구 첨부파일은 활성화될 때 게시글 소유자를 다시 기록한다`() {
        val restoredKey = "posts/2026/03/restored-image.png"
        val content = "![](${UploadedFileUrlCodec.buildImageUrl(restoredKey)})"

        uploadedFileRetentionService.registerTempUpload(restoredKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)
        uploadedFileRetentionService.scheduleDeletedPostAttachments(content)

        uploadedFileRetentionService.restoreDeletedPostAttachments(postId = 33, content = content)

        val restoredFile = uploadedFileRepository.findByObjectKey(restoredKey)!!
        assertThat(restoredFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(restoredFile.ownerType).isEqualTo(UploadedFileOwnerType.POST)
        assertThat(restoredFile.ownerId).isEqualTo(33)
        assertThat(restoredFile.retentionReason).isNull()
        assertThat(restoredFile.purgeAfter).isNull()
    }

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
                adminUsername = "admin",
                adminEmail = "admin@test.com",
                adminPassword = "",
            )
        }
    }
}
