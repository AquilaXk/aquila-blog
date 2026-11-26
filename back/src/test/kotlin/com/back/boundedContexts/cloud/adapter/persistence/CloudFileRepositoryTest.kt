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
    @DisplayName("findByObjectKey는 soft-deleted 행도 조회한다")
    fun `findByObjectKey는 soft-deleted 행도 조회한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "cloud-by-key-admin", "1234", "클라우드 key 관리자"))
        val deleted =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/videos/soft-deleted.mp4",
                    originalFilename = "soft-deleted.mp4",
                    mediaKind = CloudFileMediaKind.VIDEO,
                    folderPath = "videos",
                ),
            )
        deleted.markDeleted(Instant.now())
        cloudFileRepository.saveAndFlush(deleted)

        assertThat(cloudFileRepository.findActiveByObjectKey(deleted.objectKey)).isNull()
        assertThat(cloudFileRepository.findByObjectKey(deleted.objectKey)?.id).isEqualTo(deleted.id)
        assertThat(cloudFileRepository.findByObjectKey(deleted.objectKey)?.deletedAt).isNotNull()
    }

    @Test
    @DisplayName("objectKey prefix 조회는 limit과 삭제 상태를 반영한다")
    fun `objectKey prefix 조회는 limit과 삭제 상태를 반영한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "cloud-prefix-admin", "1234", "클라우드 prefix 관리자"))
        val first =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/videos/a.mp4",
                    originalFilename = "a.mp4",
                    mediaKind = CloudFileMediaKind.VIDEO,
                    folderPath = "videos",
                ),
            )
        cloudFileRepository.saveAndFlush(
            cloudFile(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/videos/b.mp4",
                originalFilename = "b.mp4",
                mediaKind = CloudFileMediaKind.VIDEO,
                folderPath = "videos",
            ),
        )
        val deleted =
            cloudFileRepository.saveAndFlush(
                cloudFile(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/videos/deleted.mp4",
                    originalFilename = "deleted.mp4",
                    mediaKind = CloudFileMediaKind.VIDEO,
                    folderPath = "videos",
                ),
            )
        deleted.markDeleted(Instant.now())
        cloudFileRepository.saveAndFlush(deleted)

        val files =
            cloudFileRepository.findActiveByObjectKeyStartingWith(
                objectKeyPrefix = "cloud/${owner.id}/videos/",
                limit = 1,
            )

        assertThat(files).extracting<Long> { it.id }.containsExactly(first.id)
        assertThat(
            cloudFileRepository.findActiveByObjectKeyStartingWith(
                objectKeyPrefix = "cloud/${owner.id}/videos/",
                limit = 0,
            ),
        ).hasSize(1)
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

    @Test
    @DisplayName("getFacets는 관리자 활성 파일의 미디어 종류별 개수·바이트 합계와 고유 폴더 목록을 집계한다")
    fun `getFacets는 관리자 활성 파일의 미디어 종류별 개수와 바이트 합계를 단일 집계한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "cloud-facets-admin", "1234", "클라우드 패싯 관리자"))
        val other = memberRepository.saveAndFlush(Member(0, "cloud-facets-other", "1234", "다른 패싯 관리자"))

        val emptyFacets = cloudFileRepository.getFacets(owner.id)
        assertThat(emptyFacets.allCount).isZero()
        assertThat(emptyFacets.allBytes).isZero()
        assertThat(emptyFacets.photoCount).isZero()
        assertThat(emptyFacets.videoCount).isZero()
        assertThat(emptyFacets.documentCount).isZero()
        assertThat(emptyFacets.folders).isEmpty()

        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/photos/p1.png",
                originalFilename = "p1.png",
                contentType = "image/png",
                byteSize = 120L,
                mediaKind = CloudFileMediaKind.PHOTO,
                folderPath = "photos",
                checksumSha256 = null,
            ),
        )
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/videos/v1.mp4",
                originalFilename = "v1.mp4",
                contentType = "video/mp4",
                byteSize = 300L,
                mediaKind = CloudFileMediaKind.VIDEO,
                folderPath = "videos",
                checksumSha256 = null,
            ),
        )
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/docs/d1.pdf",
                originalFilename = "d1.pdf",
                contentType = "application/pdf",
                byteSize = 80L,
                mediaKind = CloudFileMediaKind.DOCUMENT,
                folderPath = "docs",
                checksumSha256 = null,
            ),
        )
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/docs/2026/d2.pdf",
                originalFilename = "d2.pdf",
                contentType = "application/pdf",
                byteSize = 20L,
                mediaKind = CloudFileMediaKind.DOCUMENT,
                folderPath = "docs/2026",
                checksumSha256 = null,
            ),
        )
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/docs/2026/d3.pdf",
                originalFilename = "d3.pdf",
                contentType = "application/pdf",
                byteSize = 10L,
                mediaKind = CloudFileMediaKind.DOCUMENT,
                folderPath = "docs/2026",
                checksumSha256 = null,
            ),
        )
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/root/r1.txt",
                originalFilename = "r1.txt",
                contentType = "text/plain",
                byteSize = 5L,
                mediaKind = CloudFileMediaKind.DOCUMENT,
                folderPath = "",
                checksumSha256 = null,
            ),
        )
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = owner.id,
                objectKey = "cloud/${owner.id}/blank/r2.txt",
                originalFilename = "r2.txt",
                contentType = "text/plain",
                byteSize = 5L,
                mediaKind = CloudFileMediaKind.DOCUMENT,
                folderPath = "   ",
                checksumSha256 = null,
            ),
        )
        val deleted =
            cloudFileRepository.saveAndFlush(
                CloudFile.create(
                    ownerMemberId = owner.id,
                    objectKey = "cloud/${owner.id}/deleted-only/deleted.png",
                    originalFilename = "deleted.png",
                    contentType = "image/png",
                    byteSize = 999L,
                    mediaKind = CloudFileMediaKind.PHOTO,
                    folderPath = "deleted-only",
                    checksumSha256 = null,
                ),
            )
        deleted.markDeleted(Instant.now())
        cloudFileRepository.saveAndFlush(deleted)

        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = other.id,
                objectKey = "cloud/${other.id}/other-secret/other.pdf",
                originalFilename = "other.pdf",
                contentType = "application/pdf",
                byteSize = 555L,
                mediaKind = CloudFileMediaKind.DOCUMENT,
                folderPath = "other-secret",
                checksumSha256 = null,
            ),
        )

        val facets = cloudFileRepository.getFacets(owner.id)
        assertThat(facets.allCount).isEqualTo(7L)
        assertThat(facets.allBytes).isEqualTo(540L)
        assertThat(facets.photoCount).isEqualTo(1L)
        assertThat(facets.photoBytes).isEqualTo(120L)
        assertThat(facets.videoCount).isEqualTo(1L)
        assertThat(facets.videoBytes).isEqualTo(300L)
        assertThat(facets.documentCount).isEqualTo(5L)
        assertThat(facets.documentBytes).isEqualTo(120L)
        assertThat(facets.folders).containsExactly("docs", "docs/2026", "photos", "videos")
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
