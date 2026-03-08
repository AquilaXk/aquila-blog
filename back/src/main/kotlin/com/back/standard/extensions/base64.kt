package com.back.standard.extensions

import java.nio.charset.StandardCharsets
import kotlin.io.encoding.Base64

fun String.base64Encode(): String {
    return Base64.UrlSafe.encode(this.toByteArray(StandardCharsets.UTF_8))
}

fun String.base64Decode(): String {
    return Base64.UrlSafe.decode(this).decodeToString()
}
