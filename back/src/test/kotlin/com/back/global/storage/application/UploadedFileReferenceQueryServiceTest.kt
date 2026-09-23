package com.back.global.storage.application

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_DRAFT
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.global.app.AppConfig
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock

@DisplayName("UploadedFileReferenceQueryService 단위 테스트")
class UploadedFileReferenceQueryServiceTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun setUp() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
            )
        }
    }

    private val postRepository = mock(PostRepositoryPort::class.java)
    private val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)

    @Test
    fun `후보 목록이 비어 있으면 빈 결과를 반환한다`() {
        val service = UploadedFileReferenceQueryService(postRepository, memberAttrRepository)
        val result = service.findReferencedObjectKeys(emptyList())
        assertThat(result).isEmpty()
    }

    @Test
    fun `ownerId가 없거나 알 수 없는 ownerType이면 fallback 미활성 시 참조되지 않는다`() {
        val service =
            UploadedFileReferenceQueryService(
                postRepository,
                memberAttrRepository,
                UploadedFileRetentionProperties(fallbackLookupEnabled = false),
            )
        val noOwnerFile =
            UploadedFile(
                objectKey = "posts/2026/03/no-owner.png",
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
                ownerId = null,
                ownerType = UploadedFileOwnerType.POST,
            )
        val unknownOwnerFile =
            UploadedFile(
                objectKey = "posts/2026/03/unknown.png",
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
                ownerId = 1L,
                ownerType = null,
            )

        val result = service.findReferencedObjectKeys(listOf(noOwnerFile, unknownOwnerFile))
        assertThat(result).isEmpty()
    }

    @Test
    fun `POST 소유자가 본문에서 참조 중이면 식별된다`() {
        val service =
            UploadedFileReferenceQueryService(
                postRepository,
                memberAttrRepository,
                UploadedFileRetentionProperties(fallbackLookupEnabled = false),
            )
        val postFile =
            UploadedFile(
                objectKey = "posts/2026/03/post.png",
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
                ownerId = 10L,
                ownerType = UploadedFileOwnerType.POST,
            )
        given(postRepository.existsImageReference(10L, "posts/2026/03/post.png")).willReturn(true)

        val result = service.findReferencedObjectKeys(listOf(postFile))
        assertThat(result).containsExactly("posts/2026/03/post.png")
    }

    @Test
    fun `MEMBER_PROFILE 소유자가 draft 또는 published에서 참조 중이면 식별된다`() {
        val service =
            UploadedFileReferenceQueryService(
                postRepository,
                memberAttrRepository,
                UploadedFileRetentionProperties(fallbackLookupEnabled = false),
            )
        val draftFile =
            UploadedFile(
                objectKey = "posts/2026/03/draft.png",
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
                ownerId = 20L,
                ownerType = UploadedFileOwnerType.MEMBER_PROFILE,
            )
        val publishedFile =
            UploadedFile(
                objectKey = "posts/2026/03/pub.png",
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
                ownerId = 30L,
                ownerType = UploadedFileOwnerType.MEMBER_PROFILE,
            )

        given(
            memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(
                20L,
                PROFILE_WORKSPACE_DRAFT,
                "posts/2026/03/draft.png",
            ),
        ).willReturn(true)
        given(
            memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(
                30L,
                PROFILE_WORKSPACE_DRAFT,
                "posts/2026/03/pub.png",
            ),
        ).willReturn(false)
        given(
            memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(
                30L,
                PROFILE_WORKSPACE_PUBLISHED,
                "posts/2026/03/pub.png",
            ),
        ).willReturn(true)

        val result = service.findReferencedObjectKeys(listOf(draftFile, publishedFile))
        assertThat(result).containsExactly("posts/2026/03/draft.png", "posts/2026/03/pub.png")
    }

    @Test
    fun `fallbackLookupEnabled 활성화 시 모든 fallback 경로를 검사한다`() {
        val service =
            UploadedFileReferenceQueryService(
                postRepository,
                memberAttrRepository,
                UploadedFileRetentionProperties(fallbackLookupEnabled = true),
            )
        val key1 = "posts/2026/03/fb1.png"
        val key2 = "posts/2026/03/fb2.png"
        val key3 = "posts/2026/03/fb3.png"
        val key4 = "posts/2026/03/fb4.png"
        val key5 = "posts/2026/03/fb5.png"
        val key6 = "posts/2026/03/fb6.png"
        val keyNone = "posts/2026/03/none.png"

        fun makeFile(key: String) =
            UploadedFile(
                objectKey = key,
                bucket = "post-img",
                contentType = "image/png",
                fileSize = 100,
                ownerId = null,
                ownerType = null,
            )

        val file1 = makeFile(key1)
        val file2 = makeFile(key2)
        val file3 = makeFile(key3)
        val file4 = makeFile(key4)
        val file5 = makeFile(key5)
        val file6 = makeFile(key6)
        val fileNone = makeFile(keyNone)

        // key1: post image reference by key
        given(postRepository.existsImageReferenceByObjectKey(key1)).willReturn(true)

        // key2: member attr draft by key
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_DRAFT, key2)).willReturn(true)

        // key3: member attr pub by key
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_DRAFT, key3)).willReturn(false)
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_PUBLISHED, key3)).willReturn(true)

        // key4: member attr draft by imageUrl
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_DRAFT, key4)).willReturn(false)
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_PUBLISHED, key4)).willReturn(false)
        given(
            memberAttrRepository.existsByNameAndStrValueContaining(
                PROFILE_WORKSPACE_DRAFT,
                UploadedFileUrlCodec.buildImageUrl(key4),
            ),
        ).willReturn(true)

        // key5: member attr pub by imageUrl
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_DRAFT, key5)).willReturn(false)
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_PUBLISHED, key5)).willReturn(false)
        given(
            memberAttrRepository.existsByNameAndStrValueContaining(
                PROFILE_WORKSPACE_DRAFT,
                UploadedFileUrlCodec.buildImageUrl(key5),
            ),
        ).willReturn(false)
        given(
            memberAttrRepository.existsByNameAndStrValueContaining(
                PROFILE_WORKSPACE_PUBLISHED,
                UploadedFileUrlCodec.buildImageUrl(key5),
            ),
        ).willReturn(true)

        // keyNone: all false
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_DRAFT, keyNone)).willReturn(false)
        given(memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_PUBLISHED, keyNone)).willReturn(false)
        given(
            memberAttrRepository.existsByNameAndStrValueContaining(
                PROFILE_WORKSPACE_DRAFT,
                UploadedFileUrlCodec.buildImageUrl(keyNone),
            ),
        ).willReturn(false)
        given(
            memberAttrRepository.existsByNameAndStrValueContaining(
                PROFILE_WORKSPACE_PUBLISHED,
                UploadedFileUrlCodec.buildImageUrl(keyNone),
            ),
        ).willReturn(false)

        val result = service.findReferencedObjectKeys(listOf(file1, file2, file3, file4, file5, fileNone))
        assertThat(result).containsExactly(key1, key2, key3, key4, key5)
    }
}
