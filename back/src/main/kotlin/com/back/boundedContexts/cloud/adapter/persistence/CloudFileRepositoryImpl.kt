package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController.CloudFileFacetsResBody
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import jakarta.persistence.EntityManager
import jakarta.persistence.criteria.Predicate
import org.springframework.stereotype.Repository
import java.util.Locale

/**
 * 참조 구현: strapi/strapi (MIT) packages/core/upload & payloadcms/payload (MIT)
 */
@Repository
class CloudFileRepositoryImpl(
    private val entityManager: EntityManager,
) : CloudFileRepositoryCustom {
    override fun getFacets(ownerMemberId: Long): CloudFileFacetsResBody {
        val query =
            entityManager
                .createQuery(
                    """
                    SELECT
                        COUNT(f),
                        COALESCE(SUM(f.byteSize), 0L),
                        COALESCE(SUM(CASE WHEN f.mediaKind = com.back.boundedContexts.cloud.model.CloudFileMediaKind.PHOTO THEN 1L ELSE 0L END), 0L),
                        COALESCE(SUM(CASE WHEN f.mediaKind = com.back.boundedContexts.cloud.model.CloudFileMediaKind.PHOTO THEN f.byteSize ELSE 0L END), 0L),
                        COALESCE(SUM(CASE WHEN f.mediaKind = com.back.boundedContexts.cloud.model.CloudFileMediaKind.VIDEO THEN 1L ELSE 0L END), 0L),
                        COALESCE(SUM(CASE WHEN f.mediaKind = com.back.boundedContexts.cloud.model.CloudFileMediaKind.VIDEO THEN f.byteSize ELSE 0L END), 0L),
                        COALESCE(SUM(CASE WHEN f.mediaKind = com.back.boundedContexts.cloud.model.CloudFileMediaKind.DOCUMENT THEN 1L ELSE 0L END), 0L),
                        COALESCE(SUM(CASE WHEN f.mediaKind = com.back.boundedContexts.cloud.model.CloudFileMediaKind.DOCUMENT THEN f.byteSize ELSE 0L END), 0L)
                    FROM CloudFile f
                    WHERE f.ownerMemberId = :ownerMemberId
                      AND f.deletedAt IS NULL
                    """.trimIndent(),
                ).setParameter("ownerMemberId", ownerMemberId)

        val result = query.singleResult as Array<*>
        val folders =
            entityManager
                .createQuery(
                    """
                    SELECT DISTINCT f.folderPath
                    FROM CloudFile f
                    WHERE f.ownerMemberId = :ownerMemberId
                      AND f.deletedAt IS NULL
                      AND TRIM(f.folderPath) <> ''
                    ORDER BY f.folderPath ASC
                    """.trimIndent(),
                    String::class.java,
                ).setParameter("ownerMemberId", ownerMemberId)
                .resultList
        return CloudFileFacetsResBody(
            allCount = (result[0] as Number).toLong(),
            allBytes = (result[1] as Number).toLong(),
            photoCount = (result[2] as Number).toLong(),
            photoBytes = (result[3] as Number).toLong(),
            videoCount = (result[4] as Number).toLong(),
            videoBytes = (result[5] as Number).toLong(),
            documentCount = (result[6] as Number).toLong(),
            documentBytes = (result[7] as Number).toLong(),
            folders = folders,
        )
    }

    override fun findActiveByObjectKeyStartingWith(
        objectKeyPrefix: String,
        limit: Int,
    ): List<CloudFile> {
        val safeLimit = limit.coerceAtLeast(1)
        return entityManager
            .createQuery(
                """
                SELECT f
                FROM CloudFile f
                WHERE f.deletedAt IS NULL
                  AND f.objectKey LIKE CONCAT(:objectKeyPrefix, '%')
                ORDER BY f.id ASC
                """.trimIndent(),
                CloudFile::class.java,
            ).setParameter("objectKeyPrefix", objectKeyPrefix)
            .setMaxResults(safeLimit)
            .resultList
    }

    override fun findActiveByOwner(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile> {
        val normalizedFolderPath = folderPath?.trim()?.takeIf(String::isNotBlank)
        val normalizedKeyword = keyword?.trim()?.lowercase(Locale.ROOT)?.takeIf(String::isNotBlank)
        val criteriaBuilder = entityManager.criteriaBuilder
        val query = criteriaBuilder.createQuery(CloudFile::class.java)
        val root = query.from(CloudFile::class.java)
        val predicates = mutableListOf<Predicate>()

        predicates += criteriaBuilder.equal(root.get<Long>("ownerMemberId"), ownerMemberId)
        predicates += criteriaBuilder.isNull(root.get<Any>("deletedAt"))
        normalizedFolderPath?.let {
            predicates += criteriaBuilder.equal(root.get<String>("folderPath"), it)
        }
        normalizedKeyword?.let {
            predicates +=
                criteriaBuilder.like(
                    criteriaBuilder.lower(root.get("originalFilename")),
                    "%${escapeLikePattern(it)}%",
                    '\\',
                )
        }
        mediaKind?.let {
            predicates += criteriaBuilder.equal(root.get<CloudFileMediaKind>("mediaKind"), it)
        }

        query
            .where(criteriaBuilder.and(*predicates.toTypedArray()))
            .orderBy(
                criteriaBuilder.desc(root.get<java.time.Instant>("createdAt")),
                criteriaBuilder.desc(root.get<Long>("id")),
            )

        return entityManager.createQuery(query).resultList
    }

    private fun escapeLikePattern(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
}
