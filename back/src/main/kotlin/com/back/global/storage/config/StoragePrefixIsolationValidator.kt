package com.back.global.storage.config

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component

/**
 * storage config 기동 가드.
 * - post/cloud prefix 상호 배타 (#1234)
 * - 전송 경로(edge) 한도 정합 (#1232)
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class StoragePrefixIsolationValidator(
    private val storageProperties: StoragePropertiesPort,
    private val cloudStorageProperties: CloudStorageProperties,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        StoragePrefixIsolation.validate(
            postKeyPrefix = storageProperties.keyPrefix,
            cloudKeyPrefix = cloudStorageProperties.cloudKeyPrefix,
        )
        cloudStorageProperties.validateAgainstEdgeTransferLimits()
    }
}
