package com.back.standard.lib

import com.back.global.security.config.CustomAuthenticationFilter
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@Component
class InternalRestClient(
    private val webApplicationContext: WebApplicationContext,
    private val customAuthenticationFilter: CustomAuthenticationFilter
) {
    private val mockMvc: MockMvc by lazy {
        MockMvcBuilders
            .webAppContextSetup(webApplicationContext)
            .addFilters<DefaultMockMvcBuilder>(customAuthenticationFilter)
            .build()
    }

    fun get(uri: String, headers: Map<String, String> = emptyMap()): Response {
        return execute("GET", uri, headers)
    }

    fun post(uri: String, headers: Map<String, String> = emptyMap(), body: String? = null): Response {
        return execute("POST", uri, headers, body)
    }

    fun put(uri: String, headers: Map<String, String> = emptyMap(), body: String? = null): Response {
        return execute("PUT", uri, headers, body)
    }

    fun delete(uri: String, headers: Map<String, String> = emptyMap()): Response {
        return execute("DELETE", uri, headers)
    }

    private fun execute(method: String, uri: String, headers: Map<String, String>, body: String? = null): Response {
        val requestBuilder = when (method) {
            "GET" -> MockMvcRequestBuilders.get(uri)
            "POST" -> MockMvcRequestBuilders.post(uri)
            "PUT" -> MockMvcRequestBuilders.put(uri)
            "DELETE" -> MockMvcRequestBuilders.delete(uri)
            else -> throw IllegalArgumentException("Unsupported method: $method")
        }.apply {
            headers.forEach { (key, value) -> header(key, value) }
            body?.let {
                content(it)
                contentType(MediaType.APPLICATION_JSON)
            }
        }

        val result = mockMvc.perform(requestBuilder).andReturn()

        return Response(result.response.status, result.response.contentAsString)
    }

    data class Response(val status: Int, val body: String)
}
