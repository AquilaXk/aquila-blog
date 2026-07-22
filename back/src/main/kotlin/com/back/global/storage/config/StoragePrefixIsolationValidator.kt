package com.back.global.storage.config

import com.back.boundedContexts.post.config.PostImageStorageProperties
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component

/**
 * post/cloud storage prefix 상호 배타 기동 가드.
 * #1232 한도 가드와 같은 storage config 지점에 후속 확장할 수 있다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class StoragePrefixIsolationValidator(
    private val postImageStorageProperties: PostImageStorageProperties,
    private val cloudStorageProperties: CloudStorageProperties,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        StoragePrefixIsolation.validate(
            postKeyPrefix = postImageStorageProperties.keyPrefix,
            cloudKeyPrefix = cloudStorageProperties.cloudKeyPrefix,
        )
    }
}
