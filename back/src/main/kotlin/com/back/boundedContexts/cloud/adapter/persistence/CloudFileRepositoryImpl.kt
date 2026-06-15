package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import jakarta.persistence.EntityManager
import jakarta.persistence.criteria.Predicate
import org.springframework.stereotype.Repository
import java.util.Locale

@Repository
class CloudFileRepositoryImpl(
    private val entityManager: EntityManager,
) : CloudFileRepositoryCustom {
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
