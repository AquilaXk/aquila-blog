package com.back.global.storage.adapter.persistence

import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileStatus
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import jakarta.persistence.Tuple
import org.springframework.beans.factory.ObjectProvider
import java.util.EnumMap

class UploadedFileRepositoryImpl(
    private val uploadedFileRepositoryProvider: ObjectProvider<UploadedFileRepository>,
) : UploadedFileRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun saveAllUploadedFiles(entities: Collection<UploadedFile>): List<UploadedFile> =
        uploadedFileRepositoryProvider.getObject().saveAll(entities)

    override fun countGroupedByStatus(): Map<UploadedFileStatus, Long> {
        val counts = EnumMap<UploadedFileStatus, Long>(UploadedFileStatus::class.java)
        entityManager
            .createQuery(
                "select uf.status, count(uf) from UploadedFile uf group by uf.status",
                Tuple::class.java,
            ).resultList
            .forEach { row ->
                counts[row.get(0, UploadedFileStatus::class.java)] = row.get(1, Number::class.java).toLong()
            }
        return counts
    }
}
