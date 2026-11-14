package com.back.global.storage.adapter.persistence

import com.back.global.storage.domain.UploadedFile
import org.springframework.beans.factory.ObjectProvider

class UploadedFileRepositoryImpl(
    private val uploadedFileRepositoryProvider: ObjectProvider<UploadedFileRepository>,
) : UploadedFileRepositoryCustom {
    override fun saveAllUploadedFiles(entities: Collection<UploadedFile>): List<UploadedFile> =
        uploadedFileRepositoryProvider.getObject().saveAll(entities)
}
