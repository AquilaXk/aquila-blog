package com.back.global.security.config.oauth2

import com.back.global.exception.application.AppException
import com.back.global.security.config.oauth2.application.OAuth2State
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.core.AuthenticationException
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.stereotype.Component
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

private const val OAUTH_SIGNUP_REQUIRED_ERROR = "signup-required"
private const val OAUTH_SIGNUP_DISABLED_ERROR = "signup-disabled"
private const val OAUTH_FAILED_ERROR = "oauth-failed"

@Component
class CustomOAuth2LoginFailureHandler(
    @Value("\${custom.site.frontUrl}")
    private val siteFrontUrl: String,
) : AuthenticationFailureHandler {
    override fun onAuthenticationFailure(
        request: HttpServletRequest,
        response: HttpServletResponse,
        exception: AuthenticationException,
    ) {
        if (response.isCommitted) return

        response.sendRedirect(
            buildOAuth2LoginFailureRedirectUrl(
                siteFrontUrl = siteFrontUrl,
                encodedState = request.getParameter("state"),
                exception = exception,
            ),
        )
    }
}

internal fun buildOAuth2LoginFailureRedirectUrl(
    siteFrontUrl: String,
    encodedState: String?,
    exception: AuthenticationException,
): String {
    val redirectUrl = encodedState?.let { runCatching { OAuth2State.decode(it).redirectUrl }.getOrNull() }
    findOAuthSignupRequiredException(exception)?.let { signupException ->
        val parameters =
            buildList {
                add("token" to signupException.pendingToken)
                add("provider" to signupException.provider.lowercase())
                resolveNextPath(redirectUrl)?.let { add("next" to it) }
            }

        return appendFragment(resolveSignupCompleteBaseUrl(siteFrontUrl, redirectUrl), parameters)
    }

    val parameters =
        buildList {
            add("oauthError" to resolveOAuth2LoginFailureCode(exception))
            resolveNextPath(redirectUrl)?.let { add("next" to it) }
        }

    return appendQuery(resolveLoginBaseUrl(siteFrontUrl, redirectUrl), parameters)
}

private fun resolveOAuth2LoginFailureCode(exception: AuthenticationException): String =
    when {
        containsOAuthSignupDisabledException(exception) -> OAUTH_SIGNUP_DISABLED_ERROR
        containsAppExceptionCode(exception, "403-4") -> OAUTH_SIGNUP_REQUIRED_ERROR
        else -> OAUTH_FAILED_ERROR
    }

private fun findOAuthSignupRequiredException(exception: Throwable): OAuthSignupRequiredAuthenticationException? =
    generateSequence(exception as Throwable?) { it.cause }
        .filterIsInstance<OAuthSignupRequiredAuthenticationException>()
        .firstOrNull()

private fun containsOAuthSignupDisabledException(exception: Throwable): Boolean =
    generateSequence(exception as Throwable?) { it.cause }
        .any { it is OAuthSignupDisabledAuthenticationException }

private fun containsAppExceptionCode(
    throwable: Throwable,
    resultCode: String,
): Boolean =
    generateSequence(throwable as Throwable?) { it.cause }
        .any { cause -> cause is AppException && cause.rsData.resultCode == resultCode }

private fun resolveLoginBaseUrl(
    siteFrontUrl: String,
    redirectUrl: String?,
): String {
    val redirectUri = runCatching { URI(redirectUrl.orEmpty()) }.getOrNull()
    if (redirectUri != null && redirectUri.isAbsolute && !redirectUri.rawAuthority.isNullOrBlank()) {
        return "${redirectUri.scheme}://${redirectUri.rawAuthority}/login"
    }

    val normalizedFrontUrl = siteFrontUrl.trim().removeSuffix("/")
    return if (normalizedFrontUrl.isBlank()) "/login" else "$normalizedFrontUrl/login"
}

private fun resolveSignupCompleteBaseUrl(
    siteFrontUrl: String,
    redirectUrl: String?,
): String {
    val redirectUri = runCatching { URI(redirectUrl.orEmpty()) }.getOrNull()
    if (redirectUri != null && redirectUri.isAbsolute && !redirectUri.rawAuthority.isNullOrBlank()) {
        return "${redirectUri.scheme}://${redirectUri.rawAuthority}/signup/social/complete"
    }

    val normalizedFrontUrl = siteFrontUrl.trim().removeSuffix("/")
    return if (normalizedFrontUrl.isBlank()) "/signup/social/complete" else "$normalizedFrontUrl/signup/social/complete"
}

private fun resolveNextPath(redirectUrl: String?): String? {
    val redirectUri = runCatching { URI(redirectUrl.orEmpty()) }.getOrNull() ?: return null
    val rawPath =
        when {
            redirectUri.isAbsolute -> redirectUri.rawPath
            redirectUrl.orEmpty().startsWith("/") -> redirectUri.rawPath
            else -> return null
        }.orEmpty().ifBlank { "/" }

    if (rawPath == "/login") return null

    val nextPath = rawPath + redirectUri.rawQuery?.let { "?$it" }.orEmpty()
    return nextPath.takeUnless { it == "/" }
}

private fun appendQuery(
    baseUrl: String,
    parameters: List<Pair<String, String>>,
): String {
    if (parameters.isEmpty()) return baseUrl

    val separator = if (baseUrl.contains("?")) "&" else "?"
    return parameters.joinToString(
        separator = "&",
        prefix = baseUrl + separator,
    ) { (key, value) -> "${encodeQueryValue(key)}=${encodeQueryValue(value)}" }
}

private fun appendFragment(
    baseUrl: String,
    parameters: List<Pair<String, String>>,
): String {
    if (parameters.isEmpty()) return baseUrl

    return parameters.joinToString(
        separator = "&",
        prefix = "$baseUrl#",
    ) { (key, value) -> "${encodeQueryValue(key)}=${encodeQueryValue(value)}" }
}

private fun encodeQueryValue(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)
