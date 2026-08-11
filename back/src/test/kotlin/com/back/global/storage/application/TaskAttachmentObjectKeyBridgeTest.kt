package com.back.global.storage.application

import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class TaskAttachmentObjectKeyBridgeTest {
    @Test
    fun `post attachment service는 empty object key snapshot을 명시적으로 처리한다`() {
        val repository = mock(UploadedFileRepositoryPort::class.java)
        val service =
            PostAttachmentRetentionService(
                uploadedFileRepository = repository,
                storageProperties = PostImageStorageProperties(),
                retentionProperties = UploadedFileRetentionProperties(),
                clock = Clock.fixed(Instant.parse("2026-08-11T00:00:00Z"), ZoneOffset.UTC),
            )

        service.syncPostAttachmentKeys(
            postId = 41L,
            currentImageObjectKeys = emptyList(),
            previousImageObjectKeys = emptyList(),
            currentFileObjectKeys = emptyList(),
            previousFileObjectKeys = emptyList(),
        )
        service.scheduleDeletedPostAttachmentKeys(
            imageObjectKeys = emptyList(),
            fileObjectKeys = emptyList(),
        )

        verifyNoInteractions(repository)
    }

    @Test
    fun `retention facade는 object key snapshot을 post attachment service에 exact 위임한다`() {
        val postAttachmentRetentionService = mock(PostAttachmentRetentionService::class.java)
        val service =
            UploadedFileRetentionService(
                registrationService = mock(UploadedFileRegistrationService::class.java),
                postAttachmentRetentionService = postAttachmentRetentionService,
                profileImageRetentionService = mock(ProfileImageRetentionService::class.java),
                purgeService = mock(UploadedFilePurgeService::class.java),
            )
        val currentImages = listOf("posts/current.png")
        val previousImages = listOf("posts/previous.png")
        val currentFiles = listOf("posts/current.pdf")
        val previousFiles = listOf("posts/previous.pdf")

        service.syncPostAttachmentKeys(
            postId = 42L,
            currentImageObjectKeys = currentImages,
            previousImageObjectKeys = previousImages,
            currentFileObjectKeys = currentFiles,
            previousFileObjectKeys = previousFiles,
        )
        service.scheduleDeletedPostAttachmentKeys(
            imageObjectKeys = previousImages,
            fileObjectKeys = previousFiles,
        )

        verify(postAttachmentRetentionService).syncPostAttachmentKeys(
            postId = 42L,
            currentImageObjectKeys = currentImages,
            previousImageObjectKeys = previousImages,
            currentFileObjectKeys = currentFiles,
            previousFileObjectKeys = previousFiles,
        )
        verify(postAttachmentRetentionService).scheduleDeletedPostAttachmentKeys(
            imageObjectKeys = previousImages,
            fileObjectKeys = previousFiles,
        )
    }
}
