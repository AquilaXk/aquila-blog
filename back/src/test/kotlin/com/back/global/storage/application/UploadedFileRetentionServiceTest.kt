package com.back.global.storage.application

import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.global.app.AppConfig
import com.back.global.storage.adapter.persistence.UploadedFileRepository
import com.back.global.storage.domain.UploadedFile
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
import org.mockito.ArgumentMatchers.anyString
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.BDDMockito.willThrow
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.springframework.beans.factory.annotation.Autowired
import java.time.Clock
import java.time.Instant

@org.junit.jupiter.api.DisplayName("UploadedFileRetentionService 테스트")
class UploadedFileRetentionServiceTest : BaseUploadedFileRetentionServiceIntegrationTest() {
    @Autowired
    private lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @Autowired
    private lateinit var uploadedFileRepository: UploadedFileRepository

    @Autowired
    private lateinit var clock: Clock

    @Autowired
    private lateinit var retentionProperties: UploadedFileRetentionProperties

    @Autowired
    private lateinit var uploadedFileReferenceQueryService: UploadedFileReferenceQueryService

    @Autowired
    private lateinit var uploadedFilePurgeService: UploadedFilePurgeService

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
        assertThat(uploadedFile.purgeAfter)
            .isEqualTo(Instant.now(clock).plusSeconds(retentionProperties.tempUploadSeconds))
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
        assertThat(oldFile.purgeAfter)
            .isEqualTo(Instant.now(clock).plusSeconds(retentionProperties.replacedProfileImageSeconds))
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
    fun `존재하지 않는 프로필 이미지는 삭제할 수 없다`() {
        assertThatThrownBy {
            uploadedFileRetentionService.deleteProfileImage(
                memberId = 7,
                fileId = 9_999,
                protectedProfileImgUrls = emptyList(),
            )
        }.hasMessageContaining("프로필 이미지를 찾을 수 없습니다")
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
        assertThat(removedFile.purgeAfter)
            .isEqualTo(Instant.now(clock).plusSeconds(retentionProperties.deletedPostAttachmentSeconds))
    }

    @Test
    fun `미등록 게시글 첨부파일 동기화는 추적 row를 생성하고 활성화한다`() {
        val imageKey = "posts/2026/03/new-image.png"
        val fileKey = "posts/2026/03/new-file.pdf"
        val currentContent =
            """
            ![](${UploadedFileUrlCodec.buildImageUrl(imageKey)})
            [file](${UploadedFileUrlCodec.buildFileUrl(fileKey)})
            """.trimIndent()

        uploadedFileRetentionService.syncPostContent(
            postId = 41,
            previousContent = null,
            currentContent = currentContent,
        )

        val imageFile = uploadedFileRepository.findByObjectKey(imageKey)!!
        val postFile = uploadedFileRepository.findByObjectKey(fileKey)!!
        assertThat(imageFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(imageFile.purpose).isEqualTo(UploadedFilePurpose.POST_IMAGE)
        assertThat(imageFile.ownerId).isEqualTo(41)
        assertThat(postFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(postFile.purpose).isEqualTo(UploadedFilePurpose.POST_FILE)
        assertThat(postFile.ownerId).isEqualTo(41)
    }

    @Test
    fun `미등록 프로필 이미지 동기화는 추적 row를 생성하고 활성화한다`() {
        val profileKey = "posts/2026/03/new-profile.png"
        val profileUrl = UploadedFileUrlCodec.buildImageUrl(profileKey)

        uploadedFileRetentionService.syncProfileImage(
            memberId = 9,
            previousProfileImgUrl = null,
            currentProfileImgUrl = profileUrl,
        )

        val profileFile = uploadedFileRepository.findByObjectKey(profileKey)!!
        assertThat(profileFile.status).isEqualTo(UploadedFileStatus.ACTIVE)
        assertThat(profileFile.purpose).isEqualTo(UploadedFilePurpose.PROFILE_IMAGE)
        assertThat(profileFile.ownerType).isEqualTo(UploadedFileOwnerType.MEMBER_PROFILE)
        assertThat(profileFile.ownerId).isEqualTo(9)
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
        uploadedFile.purgeAfter = Instant.now(clock).minusSeconds(60)
        uploadedFileRepository.save(uploadedFile)

        val diagnostics = uploadedFileRetentionService.diagnoseCleanup(sampleSize = 5)
        val directDiagnostics = uploadedFilePurgeService.diagnoseCleanup(sampleSize = 5)

        assertThat(diagnostics.tempCount).isGreaterThanOrEqualTo(1)
        assertThat(diagnostics.eligibleForPurgeCount).isGreaterThanOrEqualTo(1)
        assertThat(diagnostics.sampleEligibleObjectKeys).contains(objectKey)
        assertThat(directDiagnostics.sampleEligibleObjectKeys).contains(objectKey)
    }

    @Test
    fun `reference query는 빈 후보 목록을 그대로 빈 결과로 반환한다`() {
        assertThat(uploadedFileReferenceQueryService.findReferencedObjectKeys(emptyList())).isEmpty()
    }

    @Test
    fun `reference query는 알 수 없는 owner type 후보를 fallback lookup으로 확인한다`() {
        val uploadedFile =
            UploadedFile(
                objectKey = "posts/2026/03/reference-unknown-owner.png",
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
            ).apply {
                ownerId = 101
            }

        val referencedObjectKeys = uploadedFileReferenceQueryService.findReferencedObjectKeys(listOf(uploadedFile))

        assertThat(referencedObjectKeys).isEmpty()
    }

    @Test
    fun `purge는 참조 없는 만료 파일을 storage 삭제 후 deleted로 전환한다`() {
        val objectKey = "posts/2026/03/purge-delete.png"
        uploadedFileRetentionService.registerTempUpload(objectKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)
        expireUpload(objectKey)

        uploadedFileRetentionService.purgeExpiredFiles(limit = 10)

        assertThat(uploadedFileRepository.findByObjectKey(objectKey)!!.status).isEqualTo(UploadedFileStatus.DELETED)
        then(postImageStoragePort).should().deletePostImage(objectKey)
    }

    @Test
    fun `purge는 게시글에서 다시 참조 중인 만료 파일을 active로 복구한다`() {
        val objectKey = "posts/2026/03/purge-post-reference.png"
        val content = "![](${UploadedFileUrlCodec.buildImageUrl(objectKey)})"
        uploadedFileRetentionService.registerTempUpload(objectKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)
        uploadedFileRetentionService.syncPostContent(postId = 44, previousContent = null, currentContent = content)
        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey)!!
        uploadedFile.scheduleDeletion(
            UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT,
            Instant.now(clock).minusSeconds(60),
        )
        uploadedFileRepository.save(uploadedFile)
        given(postRepository.existsByIdAndContentContaining(44, objectKey)).willReturn(true)

        uploadedFileRetentionService.purgeExpiredFiles(limit = 10)

        assertThat(uploadedFileRepository.findByObjectKey(objectKey)!!.status).isEqualTo(UploadedFileStatus.ACTIVE)
        then(postImageStoragePort).should(never()).deletePostImage(objectKey)
    }

    @Test
    fun `purge는 프로필에서 다시 참조 중인 만료 파일을 active로 복구한다`() {
        val objectKey = "posts/2026/03/purge-profile-reference.png"
        val profileUrl = UploadedFileUrlCodec.buildImageUrl(objectKey)
        uploadedFileRetentionService.registerTempUpload(objectKey, "image/png", 100, UploadedFilePurpose.PROFILE_IMAGE)
        uploadedFileRetentionService.syncProfileImage(77, previousProfileImgUrl = null, currentProfileImgUrl = profileUrl)
        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey)!!
        uploadedFile.scheduleDeletion(
            UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE,
            Instant.now(clock).minusSeconds(60),
        )
        uploadedFileRepository.save(uploadedFile)
        given(
            memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(
                77,
                PROFILE_IMG_URL,
                objectKey,
            ),
        ).willReturn(true)

        uploadedFileRetentionService.purgeExpiredFiles(limit = 10)

        assertThat(uploadedFileRepository.findByObjectKey(objectKey)!!.status).isEqualTo(UploadedFileStatus.ACTIVE)
        then(postImageStoragePort).should(never()).deletePostImage(objectKey)
    }

    @Test
    fun `purge는 storage 삭제 실패 시 DB 삭제 전환을 남기지 않는다`() {
        val objectKey = "posts/2026/03/purge-storage-fail.png"
        uploadedFileRetentionService.registerTempUpload(objectKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)
        expireUpload(objectKey)
        willThrow(RuntimeException("storage down"))
            .given(postImageStoragePort)
            .deletePostImage(objectKey)

        uploadedFileRetentionService.purgeExpiredFiles(limit = 10)

        assertThat(uploadedFileRepository.findByObjectKey(objectKey)!!.status).isEqualTo(UploadedFileStatus.TEMP)
    }

    @Test
    fun `purge는 safety threshold 초과 시 threshold 범위까지만 처리한다`() {
        val keys =
            (1..26).map { index ->
                "posts/2026/03/purge-threshold-$index.png"
            }
        keys.forEach { objectKey ->
            uploadedFileRetentionService.registerTempUpload(objectKey, "image/png", 100, UploadedFilePurpose.POST_IMAGE)
            expireUpload(objectKey)
        }

        uploadedFileRetentionService.purgeExpiredFiles(limit = 500)

        val deletedCount =
            keys.count { objectKey ->
                uploadedFileRepository.findByObjectKey(objectKey)!!.status == UploadedFileStatus.DELETED
            }
        assertThat(deletedCount).isEqualTo(retentionProperties.cleanupSafetyThreshold)
        then(postImageStoragePort).should(times(retentionProperties.cleanupSafetyThreshold)).deletePostImage(anyString())
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

    private fun expireUpload(objectKey: String) {
        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey)!!
        uploadedFile.purgeAfter = Instant.now(clock).minusSeconds(60)
        uploadedFileRepository.save(uploadedFile)
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
