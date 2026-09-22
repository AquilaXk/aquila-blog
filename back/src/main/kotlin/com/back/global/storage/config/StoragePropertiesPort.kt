package com.back.global.storage.config

interface StoragePropertiesPort {
    val enabled: Boolean
    val endpoint: String
    val region: String
    val bucket: String
    val accessKey: String
    val secretKey: String
    val credentialVersion: String
    val pathStyleAccess: Boolean
    val keyPrefix: String
    val maxFileSizeBytes: Long
}
