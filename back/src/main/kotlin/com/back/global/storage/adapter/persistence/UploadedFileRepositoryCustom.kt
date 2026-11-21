package com.back.global.storage.adapter.persistence

import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileStatus

interface UploadedFileRepositoryCustom {
    fun saveAllUploadedFiles(entities: Collection<UploadedFile>): List<UploadedFile>

    fun countGroupedByStatus(): Map<UploadedFileStatus, Long>
}
