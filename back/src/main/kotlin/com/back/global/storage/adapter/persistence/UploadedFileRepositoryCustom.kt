package com.back.global.storage.adapter.persistence

import com.back.global.storage.domain.UploadedFile

interface UploadedFileRepositoryCustom {
    fun saveAllUploadedFiles(entities: Collection<UploadedFile>): List<UploadedFile>
}
