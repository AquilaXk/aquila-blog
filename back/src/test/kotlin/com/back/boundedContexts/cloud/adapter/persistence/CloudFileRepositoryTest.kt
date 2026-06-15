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
import java.time.Instant

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

    @Test
    @DisplayName("파일 목록은 폴더, 키워드, 미디어 조건과 삭제 상태를 함께 반영한다")
    fun `파일 목록은 폴더 키워드 미디어 조건과 삭제 상태를 함께 반영한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "cloud-filter-admin", "1234", "클라우드 필터 관리자"))
        val matched =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/docs/report-2026.pdf",
                    originalFilename = "Report_2026.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                ),
            )
        cloudFileRepository.saveAndFlush(
            cloudFile(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/photos/report-2026.png",
                originalFilename = "Report_2026.png",
                mediaKind = CloudFileMediaKind.PHOTO,
                folderPath = "photos",
            ),
        )
        val deleted =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/docs/deleted-report.pdf",
                    originalFilename = "Report_deleted.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                ),
            )
        deleted.markDeleted(Instant.now())
        cloudFileRepository.saveAndFlush(deleted)

        val files =
            cloudFileRepository.findActiveByOwner(
                ownerMemberId = owner.id,
                folderPath = " docs ",
                keyword = " REPORT_2026 ",
                mediaKind = CloudFileMediaKind.DOCUMENT,
            )

        assertThat(files).extracting<Long> { it.id }.containsExactly(matched.id)
    }

    @Test
    @DisplayName("파일 목록 검색어는 like 특수문자를 일반 문자로 이스케이프한다")
    fun `파일 목록 검색어는 like 특수문자를 일반 문자로 이스케이프한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "cloud-escape-admin", "1234", "클라우드 검색 관리자"))
        val literalMatch =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/docs/budget_100.pdf",
                    originalFilename = "budget_100%.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                ),
            )
        cloudFileRepository.saveAndFlush(
            cloudFile(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/docs/budgetx1000.pdf",
                originalFilename = "budgetx1000.pdf",
                mediaKind = CloudFileMediaKind.DOCUMENT,
            ),
        )

        val files =
            cloudFileRepository.findActiveByOwner(
                ownerMemberId = owner.id,
                folderPath = "docs",
                keyword = "budget_100%",
                mediaKind = null,
            )

        assertThat(files).extracting<Long> { it.id }.containsExactly(literalMatch.id)
    }

    private fun cloudFile(
        ownerMemberId: Long,
        objectKey: String,
        originalFilename: String,
        mediaKind: CloudFileMediaKind,
        folderPath: String = "docs",
    ): CloudFile =
        CloudFile.create(
            ownerMemberId = ownerMemberId,
            objectKey = objectKey,
            originalFilename = originalFilename,
            contentType = "application/pdf",
            byteSize = 10,
            mediaKind = mediaKind,
            folderPath = folderPath,
            checksumSha256 = null,
        )
}
