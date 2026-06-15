package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import jakarta.persistence.criteria.Predicate
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import java.util.Locale

interface CloudFileRepository :
    JpaRepository<CloudFile, Long>,
    JpaSpecificationExecutor<CloudFile>,
    CloudFileRepositoryPort {
    override fun findActiveByOwner(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile> {
        val normalizedFolderPath = folderPath?.trim()?.takeIf(String::isNotBlank)
        val normalizedKeyword = keyword?.trim()?.lowercase(Locale.ROOT)?.takeIf(String::isNotBlank)
        val spec =
            Specification<CloudFile> { root, _, criteriaBuilder ->
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

                criteriaBuilder.and(*predicates.toTypedArray())
            }

        return findAll(
            spec,
            Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")),
        )
    }

    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.id = :id
          AND f.ownerMemberId = :ownerMemberId
          AND f.deletedAt IS NULL
        """,
    )
    override fun findActiveByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudFile?

    private fun escapeLikePattern(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
}
