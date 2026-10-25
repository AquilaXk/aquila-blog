package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.application.service.CanonicalAdminPolicy
import com.back.boundedContexts.member.application.service.ProfileImageReadPolicy
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AdminProperties
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.config.CloudStorageProperties
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.web.multipart.MultipartFile
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.lang.reflect.Field
import java.time.Instant
import java.util.Optional

@DisplayName("ApiV1PostImageController 업로드 테스트")
class ApiV1PostImageControllerTest {
    private val postImageStorageService = FakePostImageStoragePort()
    private val uploadedFileRetentionService = mock(UploadedFileRetentionService::class.java)
    private val uploadedFileRepository = mock(UploadedFileRepositoryPort::class.java)
    private val postRepository = mock(PostRepositoryPort::class.java)
    private val memberRepository = mock(MemberRepositoryPort::class.java)
    private val currentMemberProfileQueryUseCase = mock(CurrentMemberProfileQueryUseCase::class.java)
    private val profileImageReadPolicy =
        ProfileImageReadPolicy(
            memberRepository = memberRepository,
            canonicalAdminPolicy = CanonicalAdminPolicy(AdminProperties(email = "admin@test.com")),
            currentMemberProfileQueryUseCase = currentMemberProfileQueryUseCase,
        )
    private val controller =
        ApiV1PostImageController(
            postImageStorageService = postImageStorageService,
            storageProperties = CloudStorageProperties(maxFileSizeBytes = 10 * 1024 * 1024),
            uploadedFileRetentionService = uploadedFileRetentionService,
            uploadedFileRepository = uploadedFileRepository,
            postRepository = postRepository,
            profileImageReadUseCase = profileImageReadPolicy,
        )

    @Test
    @DisplayName("게시글 이미지는 MultipartFile.bytes 복사 없이 stream으로 업로드한다")
    fun `posts images 업로드는 uploaded_file purpose를 POST_IMAGE로 저장한다`() {
        // given
        val file = ByteAccessFailingMultipartFile("file", "sample.png", "image/png", pngBytes())
        postImageStorageService.nextImageKey = "posts/2026/03/sample.png"

        // when
        val response = withIsolatedAppConfig { controller.uploadPostImage(file) }

        // then
        assertThat(response.resultCode).isEqualTo("201-1")
        assertThat(postImageStorageService.lastImageContentLength).isEqualTo(file.size)
        assertThat(postImageStorageService.lastImageBytes).containsExactly(*pngBytes())
        verify(uploadedFileRetentionService).registerTempUploadWithCompensation(
            "posts/2026/03/sample.png",
            "image/png",
            file.size,
            UploadedFilePurpose.POST_IMAGE,
        )
    }

    @Test
    @DisplayName("AppConfig URL 설정은 테스트 밖으로 누출되지 않는다")
    fun `AppConfig URL 설정 뒤 raw companion 상태를 복원한다`() {
        val snapshot = appConfigUrlSnapshot()

        withIsolatedAppConfig {
            assertThat(appConfigUrlSnapshot()).containsExactly(
                "https://api.aquilaxk.test",
                "https://www.aquilaxk.test",
            )
        }

        assertThat(appConfigUrlSnapshot()).isEqualTo(snapshot)
    }

    @Test
    @DisplayName("게시글 이미지는 공개 ACTIVE POST_IMAGE만 재검증 가능한 캐시 정책으로 반환한다")
    fun `images 조회는 공개 ACTIVE POST_IMAGE를 재검증 가능한 캐시 정책으로 반환한다`() {
        val objectKey = "posts/2026/03/public.png"
        val storedBytes = pngBytes()
        val uploadedFile = postImage(objectKey).apply { attachToPost(30L, UploadedFilePurpose.POST_IMAGE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(30L)).thenReturn(publicPost(30L))
        postImageStorageService.images[objectKey] =
            PostImageStoragePort.StoredObject(
                inputStream = ByteArrayInputStream(storedBytes),
                contentType = "image/png",
                contentLength = storedBytes.size.toLong(),
                originalFilename = "public.png",
            )

        val response = controller.getPostImage(imageRequest(objectKey))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.headers.contentType.toString()).isEqualTo("image/png")
        assertThat(response.headers.eTag).isNotBlank()
        assertThat(response.headers.cacheControl)
            .contains("max-age=3600")
            .contains("public")
            .contains("stale-while-revalidate=86400")
            .doesNotContain("immutable")
        assertThat(postImageStorageService.imageDownloads).containsExactly(objectKey)

        `when`(postRepository.findPublicDetailById(30L)).thenReturn(null)

        assertThatThrownBy {
            controller.getPostImage(
                imageRequest(objectKey).apply { addHeader(HttpHeaders.IF_NONE_MATCH, requireNotNull(response.headers.eTag)) },
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")

        assertThat(postImageStorageService.imageDownloads).containsExactly(objectKey)
    }

    @Test
    @DisplayName("TEMP 이미지는 조건부 요청에서도 storage 접근 없이 숨긴다")
    fun `images 조건부 조회는 TEMP 이미지를 storage 접근 없이 숨긴다`() {
        val objectKey = "posts/2026/03/temp.png"
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(postImage(objectKey))

        assertThatThrownBy {
            controller.getPostImage(
                imageRequest(objectKey).apply { addHeader(HttpHeaders.IF_NONE_MATCH, "*") },
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")

        assertThat(postImageStorageService.imageDownloads).isEmpty()
        verifyNoInteractions(postRepository)
    }

    @Test
    @DisplayName("비공개 게시글 이미지는 storage 접근 없이 숨긴다")
    fun `images 조회는 비공개 게시글 연결 이미지를 storage 접근 없이 숨긴다`() {
        val objectKey = "posts/2026/03/private.png"
        val uploadedFile = postImage(objectKey).apply { attachToPost(40L, UploadedFilePurpose.POST_IMAGE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(40L)).thenReturn(null)

        assertThatThrownBy { controller.getPostImage(imageRequest(objectKey)) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")

        assertThat(postImageStorageService.imageDownloads).isEmpty()
    }

    @Test
    @DisplayName("관리자 세션은 TEMP 및 비공개 게시글 POST_IMAGE를 private no-store 캐시로 미리보기할 수 있다")
    fun `관리자 세션은 TEMP 및 비공개 게시글 이미지를 private no-store로 조회한다`() {
        val tempKey = "posts/2026/03/temp-preview.png"
        val privateKey = "posts/2026/03/private-preview.png"
        val tempFile = postImage(tempKey)
        val privateFile = postImage(privateKey).apply { attachToPost(40L, UploadedFilePurpose.POST_IMAGE) }
        val privatePost =
            Post(
                id = 40L,
                author = Member(1L, "admin", null, "관리자"),
                title = "비공개 초안",
                content = "본문",
                published = false,
                listed = false,
            )

        `when`(uploadedFileRepository.findByObjectKey(tempKey)).thenReturn(tempFile)
        `when`(uploadedFileRepository.findByObjectKey(privateKey)).thenReturn(privateFile)
        `when`(postRepository.findPublicDetailById(40L)).thenReturn(null)
        `when`(postRepository.findById(40L)).thenReturn(Optional.of(privatePost))
        postImageStorageService.images[tempKey] = storedImage(tempKey)
        postImageStorageService.images[privateKey] = storedImage(privateKey)

        val adminUser = ownerSecurityUser(7L)
        val tempResponse = controller.getPostImage(imageRequest(tempKey), adminUser)
        val privateResponse = controller.getPostImage(imageRequest(privateKey), adminUser)
        val tempNotModified =
            controller.getPostImage(
                imageRequest(tempKey).apply { addHeader(HttpHeaders.IF_NONE_MATCH, requireNotNull(tempResponse.headers.eTag)) },
                adminUser,
            )

        listOf(tempResponse, privateResponse, tempNotModified).forEach { response ->
            assertThat(response.headers.cacheControl).contains("no-store").contains("private")
            assertThat(response.headers.getFirst(HttpHeaders.VARY)).isEqualTo(HttpHeaders.COOKIE)
        }
        assertThat(tempResponse.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(privateResponse.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(tempNotModified.statusCode).isEqualTo(HttpStatus.NOT_MODIFIED)
        assertThat(postImageStorageService.imageDownloads).containsExactly(tempKey, privateKey)
    }

    @Test
    @DisplayName("비관리자 세션이나 삭제된 게시글의 POST_IMAGE는 관리자라도 storage 접근 전에 차단한다")
    fun `비관리자 세션과 삭제된 게시글 또는 삭제 상태 이미지는 storage 접근 전에 차단한다`() {
        val tempKey = "posts/2026/03/temp-denied.png"
        val missingPostKey = "posts/2026/03/missing-post.png"
        val invalidOwnerIdKey = "posts/2026/03/invalid-owner-id.png"
        val deletedFileKey = "posts/2026/03/deleted-file.png"
        val nonAdminUser =
            com.back.global.security.domain.SecurityUser(
                99L,
                "reader",
                "",
                "일반회원",
                listOf(SimpleGrantedAuthority("ROLE_USER")),
            )
        val adminUser = ownerSecurityUser(7L)

        `when`(uploadedFileRepository.findByObjectKey(tempKey)).thenReturn(postImage(tempKey))
        `when`(uploadedFileRepository.findByObjectKey(missingPostKey))
            .thenReturn(postImage(missingPostKey).apply { attachToPost(404L, UploadedFilePurpose.POST_IMAGE) })
        `when`(uploadedFileRepository.findByObjectKey(invalidOwnerIdKey))
            .thenReturn(postImage(invalidOwnerIdKey).apply { attachToPost(0L, UploadedFilePurpose.POST_IMAGE) })
        `when`(uploadedFileRepository.findByObjectKey(deletedFileKey))
            .thenReturn(postImage(deletedFileKey).apply { markDeleted() })
        `when`(postRepository.findPublicDetailById(404L)).thenReturn(null)
        `when`(postRepository.findById(404L)).thenReturn(Optional.empty())

        assertThatThrownBy { controller.getPostImage(imageRequest(tempKey), nonAdminUser) }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { controller.getPostImage(imageRequest(missingPostKey), adminUser) }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { controller.getPostImage(imageRequest(invalidOwnerIdKey), adminUser) }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { controller.getPostImage(imageRequest(deletedFileKey), adminUser) }
            .isInstanceOf(AppException::class.java)

        assertThat(postImageStorageService.imageDownloads).isEmpty()
    }

    @Test
    fun `ownerId 게시글이 비공개여도 다른 공개 게시글이 참조 중이면 익명 조회를 허용한다`() {
        val sharedKey = "posts/2026/03/shared-public-image.png"
        val privateOwnerPost =
            Post(
                id = 10L,
                author = Member(2L, "writer1", null, "작성자1"),
                title = "비공개 글",
                content = "본문",
                published = false,
                listed = false,
            )
        val sharedFile = postImage(sharedKey).apply { attachToPost(privateOwnerPost.id, UploadedFilePurpose.POST_IMAGE) }
        `when`(uploadedFileRepository.findByObjectKey(sharedKey)).thenReturn(sharedFile)
        `when`(postRepository.findPublicDetailById(privateOwnerPost.id)).thenReturn(null)
        `when`(postRepository.existsPublicPostReferencingImage(sharedKey)).thenReturn(true)
        postImageStorageService.images[sharedKey] = storedImage(sharedKey)

        val response = controller.getPostImage(imageRequest(sharedKey))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.headers.cacheControl).contains("public")
    }

    @Test
    fun `공개 게시글 이미지는 Surrogate-Key와 Cache-Tag 헤더를 포함한다`() {
        val objectKey = "posts/2026/03/tagged-public-image.png"
        val uploadedFile = postImage(objectKey).apply { attachToPost(42L, UploadedFilePurpose.POST_IMAGE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(42L)).thenReturn(publicPost(42L))
        postImageStorageService.images[objectKey] = storedImage(objectKey)

        val response = controller.getPostImage(imageRequest(objectKey))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.headers.getFirst("Surrogate-Key"))
            .contains("post-image:$objectKey")
            .contains("post:42")
        assertThat(response.headers.getFirst("Cache-Tag"))
            .contains("post-image:$objectKey")
            .contains("post:42")
    }

    @Test
    fun `발행된 프로필 이미지는 공개 캐시 정책으로 반환한다`() {
        withIsolatedAppConfig {
            val objectKey = "profiles/7/published.png"
            val owner = canonicalOwner()
            val uploadedFile = memberProfileImage(objectKey, owner.id)
            `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
            `when`(memberRepository.findById(owner.id)).thenReturn(Optional.of(owner))
            `when`(currentMemberProfileQueryUseCase.getPublishedById(owner.id)).thenReturn(profile(owner, objectKey))
            postImageStorageService.images[objectKey] = storedImage(objectKey)

            val response = controller.getPostImage(imageRequest(objectKey))

            assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
            assertThat(response.headers.cacheControl)
                .contains("max-age=3600")
                .contains("public")
                .contains("stale-while-revalidate=86400")
                .doesNotContain("immutable")
            assertThat(response.headers.getFirst(HttpHeaders.VARY)).isNotEqualTo(HttpHeaders.COOKIE)
            assertThat(postImageStorageService.imageDownloads).containsExactly(objectKey)
        }
    }

    @Test
    fun `owner-only profile image uses private no-store cache for 200 206 and 304`() {
        val objectKey = "profiles/7/history.png"
        val owner = canonicalOwner()
        val uploadedFile =
            memberProfileImage(objectKey, owner.id).apply {
                scheduleDeletion(UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE, Instant.now())
            }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(memberRepository.findById(owner.id)).thenReturn(Optional.of(owner))
        postImageStorageService.images[objectKey] = storedImage(objectKey)

        val first = controller.getPostImage(imageRequest(objectKey), ownerSecurityUser(owner.id))
        postImageStorageService.images[objectKey] = storedImage(objectKey)
        val partial =
            controller.getPostImage(
                imageRequest(objectKey).apply { addHeader(HttpHeaders.RANGE, "bytes=0-2") },
                ownerSecurityUser(owner.id),
            )
        val notModified =
            controller.getPostImage(
                imageRequest(objectKey).apply { addHeader(HttpHeaders.IF_NONE_MATCH, requireNotNull(first.headers.eTag)) },
                ownerSecurityUser(owner.id),
            )

        listOf(first, partial, notModified).forEach { response ->
            assertThat(response.headers.cacheControl).contains("no-store").contains("private")
            assertThat(response.headers.getFirst(HttpHeaders.VARY)).isEqualTo(HttpHeaders.COOKIE)
        }
        assertThat(first.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(partial.statusCode).isEqualTo(HttpStatus.PARTIAL_CONTENT)
        assertThat(notModified.statusCode).isEqualTo(HttpStatus.NOT_MODIFIED)
    }

    @Test
    fun `anonymous foreign and deleted profile images are denied before storage`() {
        withIsolatedAppConfig {
            val owner = canonicalOwner()
            val draftKey = "profiles/7/draft.png"
            val historyKey = "profiles/7/history.png"
            val deletedKey = "profiles/7/deleted.png"
            val draft = memberProfileImage(draftKey, owner.id)
            val history =
                memberProfileImage(historyKey, owner.id).apply {
                    scheduleDeletion(UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE, Instant.now())
                }
            val deleted = memberProfileImage(deletedKey, owner.id).apply { markDeleted() }
            `when`(uploadedFileRepository.findByObjectKey(draftKey)).thenReturn(draft)
            `when`(uploadedFileRepository.findByObjectKey(historyKey)).thenReturn(history)
            `when`(uploadedFileRepository.findByObjectKey(deletedKey)).thenReturn(deleted)
            `when`(memberRepository.findById(owner.id)).thenReturn(Optional.of(owner))
            `when`(currentMemberProfileQueryUseCase.getPublishedById(owner.id)).thenReturn(profile(owner, "profiles/7/published.png"))

            assertThatThrownBy { controller.getPostImage(imageRequest(draftKey)) }.isInstanceOf(AppException::class.java)
            assertThatThrownBy { controller.getPostImage(imageRequest(historyKey), ownerSecurityUser(8L)) }
                .isInstanceOf(AppException::class.java)
            assertThatThrownBy { controller.getPostImage(imageRequest(deletedKey), ownerSecurityUser(owner.id)) }
                .isInstanceOf(AppException::class.java)

            assertThat(postImageStorageService.imageDownloads).isEmpty()
        }
    }

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

    private fun imageRequest(objectKey: String): MockHttpServletRequest = MockHttpServletRequest("GET", "/post/api/v1/images/$objectKey")

    private fun postImage(objectKey: String): UploadedFile =
        UploadedFile(
            objectKey = objectKey,
            bucket = "blog-images",
            contentType = "image/png",
            fileSize = pngBytes().size.toLong(),
            purpose = UploadedFilePurpose.POST_IMAGE,
        )

    private fun memberProfileImage(
        objectKey: String,
        memberId: Long,
    ): UploadedFile =
        UploadedFile(
            objectKey = objectKey,
            bucket = "blog-images",
            contentType = "image/png",
            fileSize = pngBytes().size.toLong(),
        ).apply { attachToMemberProfile(memberId) }

    private fun canonicalOwner(): Member = Member(7L, "admin", null, "관리자", "admin@test.com", true)

    private fun ownerSecurityUser(id: Long) =
        com.back.global.security.domain.SecurityUser(
            id,
            "admin",
            "",
            "관리자",
            listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
        )

    private fun profile(
        owner: Member,
        objectKey: String,
    ): MemberWithUsernameDto =
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

    private fun storedImage(objectKey: String): PostImageStoragePort.StoredObject =
        PostImageStoragePort.StoredObject(
            inputStream = ByteArrayInputStream(pngBytes()),
            contentType = "image/png",
            contentLength = pngBytes().size.toLong(),
            originalFilename = objectKey.substringAfterLast('/'),
        )

    private fun publicPost(id: Long): Post =
        Post(
            id = id,
            author = Member(1L, "admin", null, "관리자"),
            title = "공개 글",
            content = "본문",
            published = true,
            listed = true,
        )

    private class FakePostImageStoragePort : PostImageStoragePort {
        var nextImageKey: String = "posts/placeholder/image.png"
        var lastImageContentLength: Long? = null
        var lastImageBytes: ByteArray = ByteArray(0)
        val images = mutableMapOf<String, PostImageStoragePort.StoredObject>()
        val imageDownloads = mutableListOf<String>()

        override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String {
            lastImageContentLength = request.contentLength
            lastImageBytes = request.inputStream.use(InputStream::readBytes)
            return nextImageKey
        }

        override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject? {
            imageDownloads += objectKey
            return images[objectKey]
        }

        override fun deletePostImage(objectKey: String) {}

        override fun deletePostFile(objectKey: String) {}

        override fun listObjects(
            prefix: String,
            limit: Int,
        ): PostImageStoragePort.StoredObjectListing = PostImageStoragePort.StoredObjectListing(emptyList(), isTruncated = false)
    }

    private class ByteAccessFailingMultipartFile(
        private val name: String,
        private val originalFilename: String,
        private val contentType: String,
        private val content: ByteArray,
    ) : MultipartFile {
        override fun getName(): String = name

        override fun getOriginalFilename(): String = originalFilename

        override fun getContentType(): String = contentType

        override fun isEmpty(): Boolean = content.isEmpty()

        override fun getSize(): Long = content.size.toLong()

        override fun getBytes(): ByteArray =
            throw AssertionError("controller must pass upload content as stream without reading MultipartFile.bytes")

        override fun getInputStream(): InputStream = ByteArrayInputStream(content)

        override fun transferTo(dest: java.io.File) = dest.writeBytes(content)
    }

    private fun pngBytes(): ByteArray =
        byteArrayOf(
            0x89.toByte(),
            0x50,
            0x4E,
            0x47,
            0x0D,
            0x0A,
            0x1A,
            0x0A,
            0x00,
        )
}
