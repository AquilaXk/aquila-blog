package com.back.global.storage.application

import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.jpa.application.ProdSequenceGuardService
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFilePurpose
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant

@Service
class UploadedFileRegistrationService(
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val storageProperties: PostImageStorageProperties,
    private val retentionProperties: UploadedFileRetentionProperties,
    private val transactionManager: PlatformTransactionManager,
    private val clock: Clock,
    @param:Autowired(required = false)
    private val prodSequenceGuardService: ProdSequenceGuardService? = null,
) {
    private val logger = LoggerFactory.getLogger(UploadedFileRegistrationService::class.java)
    private val registerRetryLimit = 2
    private val requiresNewTransactionTemplate =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }

    fun registerTempUpload(
        objectKey: String,
        contentType: String,
        fileSize: Long,
        purpose: UploadedFilePurpose,
    ) {
        val normalizedContentType = contentType.ifBlank { "application/octet-stream" }
        val safeFileSize = fileSize.coerceAtLeast(0)
        val purgeAfter = now().plusSeconds(retentionProperties.tempUploadSeconds)

        var attempt = 1
        while (true) {
            try {
                saveTempUploadInRequiresNewTransaction(
                    objectKey = objectKey,
                    normalizedContentType = normalizedContentType,
                    safeFileSize = safeFileSize,
                    purpose = purpose,
                    purgeAfter = purgeAfter,
                )
                return
            } catch (exception: DataIntegrityViolationException) {
                if (
                    recoverTempUploadFromExistingObjectKey(
                        objectKey = objectKey,
                        normalizedContentType = normalizedContentType,
                        safeFileSize = safeFileSize,
                        purpose = purpose,
                        purgeAfter = purgeAfter,
                    )
                ) {
                    return
                }

                val repaired = repairSequenceDriftInRequiresNewTransaction(exception)
                logger.warn(
                    "uploaded_file_register_conflict objectKey={} attempt={} repaired={}",
                    objectKey,
                    attempt,
                    repaired,
                )
                if (!repaired || attempt >= registerRetryLimit) throw exception
                attempt += 1
            }
        }
    }

    private fun saveTempUploadInRequiresNewTransaction(
        objectKey: String,
        normalizedContentType: String,
        safeFileSize: Long,
        purpose: UploadedFilePurpose,
        purgeAfter: Instant,
    ) {
        requiresNewTransactionTemplate.executeWithoutResult {
            val uploadedFile =
                findOrCreate(objectKey).apply {
                    bucket = storageProperties.bucket
                    contentType = normalizedContentType
                    fileSize = safeFileSize
                    markTemporary(purpose, purgeAfter)
                }
            uploadedFileRepository.save(uploadedFile)
            uploadedFileRepository.flush()
        }
    }

    private fun recoverTempUploadFromExistingObjectKey(
        objectKey: String,
        normalizedContentType: String,
        safeFileSize: Long,
        purpose: UploadedFilePurpose,
        purgeAfter: Instant,
    ): Boolean =
        requiresNewTransactionTemplate.execute<Boolean> {
            val existing = uploadedFileRepository.findByObjectKey(objectKey) ?: return@execute false
            existing.bucket = storageProperties.bucket
            existing.contentType = normalizedContentType
            existing.fileSize = safeFileSize
            existing.markTemporary(purpose, purgeAfter)
            uploadedFileRepository.save(existing)
            uploadedFileRepository.flush()
            true
        } ?: false

    private fun repairSequenceDriftInRequiresNewTransaction(exception: DataIntegrityViolationException): Boolean =
        requiresNewTransactionTemplate.execute<Boolean> {
            val repairedByConstraint = prodSequenceGuardService?.repairIfSequenceDrift(exception) == true
            if (repairedByConstraint) {
                return@execute true
            }

            prodSequenceGuardService?.repairUploadedFileSequence() == true
        } ?: false

    private fun findOrCreate(objectKey: String): UploadedFile =
        uploadedFileRepository.findByObjectKey(objectKey)
            ?: UploadedFile(
                objectKey = objectKey,
                bucket = storageProperties.bucket,
                contentType = "application/octet-stream",
                fileSize = 0,
            )

    private fun now(): Instant = Instant.now(clock)
}
