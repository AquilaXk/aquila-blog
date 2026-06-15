package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

@DisplayName("CloudFileRepository 테스트")
class CloudFileRepositoryTest : BaseRepositoryIntegrationTest() {
    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var cloudFileRepository: CloudFileRepository

    @Test
    @DisplayName("파일 목록은 nullable 조건 없이도 관리자 소유 파일을 조회한다")
    fun `파일 목록은 nullable 조건 없이도 관리자 소유 파일을 조회한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "cloud-admin", "1234", "클라우드 관리자"))
        val other = memberRepository.saveAndFlush(Member(0, "cloud-other", "1234", "다른 관리자"))
        val manual =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/docs/manual.pdf",
                    originalFilename = "manual.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                ),
            )
        cloudFileRepository.saveAndFlush(
            cloudFile(
                ownerMemberId = other.id,
                objectKey = "cloud/${other.id}/docs/other.pdf",
                originalFilename = "other.pdf",
                mediaKind = CloudFileMediaKind.DOCUMENT,
            ),
        )

        val files =
            cloudFileRepository.findActiveByOwner(
                ownerMemberId = owner.id,
                folderPath = null,
                keyword = null,
                mediaKind = null,
            )

        assertThat(files).extracting<Long> { it.id }.containsExactly(manual.id)
    }

    private fun cloudFile(
        ownerMemberId: Long,
        objectKey: String,
        originalFilename: String,
        mediaKind: CloudFileMediaKind,
    ): CloudFile =
        CloudFile.create(
            ownerMemberId = ownerMemberId,
            objectKey = objectKey,
            originalFilename = originalFilename,
            contentType = "application/pdf",
            byteSize = 10,
            mediaKind = mediaKind,
            folderPath = "docs",
            checksumSha256 = null,
        )
}
