package com.back.global.exception.config

import jakarta.validation.constraints.Min
import org.springframework.context.MessageSourceResolvable
import org.springframework.context.annotation.Profile
import org.springframework.context.support.DefaultMessageSourceResolvable
import org.springframework.core.MethodParameter
import org.springframework.http.MediaType
import org.springframework.validation.annotation.Validated
import org.springframework.validation.method.MethodValidationResult
import org.springframework.validation.method.ParameterValidationResult
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.method.annotation.HandlerMethodValidationException
import java.util.function.BiFunction

/**
 * MockMvc standaloneSetup 전용 fixture.
 * 기본 profile에서는 빈으로 등록되지 않아 OpenAPI/통합 테스트에 노출되지 않는다.
 *
 * standaloneSetup에는 `@Validated` AOP/method validation interceptor가 없어
 * `@RequestParam @Min`이 HandlerMethodValidationException으로 승격되지 않는다.
 * 대신 Spring이 실제 파라미터 제약에서 만드는 MessageSourceResolvable(비-FieldError) 형태를
 * 그대로 재현해 ExceptionHandler 메시지 보존 경로를 검증한다.
 */
@Profile("mvc-exception-fixture")
@RestController
@Validated
@RequestMapping("/mvc-exception-fixture")
class MvcExceptionFixtureController {
    @GetMapping("/ok")
    fun ok(): Map<String, String> = mapOf("status" to "ok")

    @GetMapping("/type-mismatch/{id}")
    fun typeMismatch(
        @PathVariable id: Long,
    ): Map<String, Long> = mapOf("id" to id)

    @GetMapping("/missing-param")
    fun missingParam(
        @RequestParam required: String,
    ): Map<String, String> = mapOf("required" to required)

    @GetMapping("/method-validation")
    fun methodValidation(
        @RequestParam @Min(1) id: Int,
    ): Nothing {
        val method =
            MvcExceptionFixtureController::class.java.getDeclaredMethod(
                "methodValidation",
                Int::class.javaPrimitiveType,
            )
        val parameter = MethodParameter(method, 0)
        val resolvable: MessageSourceResolvable =
            DefaultMessageSourceResolvable(
                arrayOf("Min.id", "Min.java.lang.Integer", "Min"),
                arrayOf(1),
                "must be greater than or equal to 1",
            )
        val parameterResult =
            ParameterValidationResult(
                parameter,
                id,
                listOf(resolvable),
                null,
                null,
                null,
                BiFunction<MessageSourceResolvable, Class<*>, Any> { message, _ -> message },
            )
        val validationResult = MethodValidationResult.create(this, method, listOf(parameterResult))
        throw HandlerMethodValidationException(validationResult)
    }

    @PostMapping("/json-only", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun jsonOnly(
        @RequestBody body: Map<String, Any>,
    ): Map<String, Any> = body

    @GetMapping("/json-response", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun jsonResponse(): Map<String, String> = mapOf("status" to "ok")
}
