package com.back.boundedContexts.post

import tools.jackson.databind.JsonNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.nio.file.Path

object CanonicalSummaryFixture {
    private val document = jacksonObjectMapper().readTree(Path.of("../contracts/public-api/summary-fixtures.json").toFile())
    private val resolves = setOf("create", "modify", "read")
    private val outcomes = setOf("RESOLVED", "MANUAL_SUMMARY_REQUIRED")
    private val modes = setOf("MANUAL", "AUTO")
    private val sources = setOf("MANUAL", "LEADING_BLOCK", "EXTRACTED", "NONE", "MIGRATED")

    fun fixture(id: String): Fixture {
        check(exactKeys(document, setOf("version", "contract", "fixtures"))) { "canonical summary fixture root is invalid" }
        val version = document.path("version")
        check(version.isNumber && version.doubleValue() == 2.0) { "canonical summary fixture version must be 2" }
        check(document.path("contract").asString() == "aquila-canonical-summary-fixtures") {
            "canonical summary fixture identity is invalid"
        }
        val fixtures = document.path("fixtures")
        check(fixtures.isArray) { "canonical summary fixtures must be an array" }
        val ids = mutableSetOf<String>()
        fixtures.forEach { validate(it, ids) }
        val node =
            fixtures.firstOrNull { it.path("id").asString() == id }
                ?: error("canonical summary fixture is missing: $id")
        return Fixture(
            id = requiredText(node, "id"),
            resolve = requiredText(node, "resolve"),
            title = requiredText(node, "title"),
            content = requiredText(node, "content"),
            request = node.path("request").takeIf { it.isObject }?.let(::request),
            existing = node.path("existing").takeIf { it.isObject }?.let(::existing),
            persisted = node.path("persisted").takeIf { it.isObject }?.let(::expected),
            outcome = requiredText(node, "outcome"),
            expected = node.path("expected").takeIf { it.isObject }?.let(::expected),
            retry = node.path("retry").takeIf { it.isObject }?.let(::request),
        )
    }

    private fun request(node: JsonNode): Request {
        check(exactKeys(node, setOf("summaryMode", "summary"))) { "canonical summary fixture request is invalid" }
        val summaryMode = nullableText(node, "summaryMode")
        check(summaryMode == null || summaryMode in modes) { "canonical summary fixture request mode is invalid" }
        return Request(summaryMode = summaryMode, summary = nullableText(node, "summary"))
    }

    private fun existing(node: JsonNode) = Existing(summary = requiredText(node, "summary"), source = source(node, "source"))

    private fun expected(node: JsonNode) =
        Expected(
            summary = requiredText(node, "summary"),
            source = source(node, "source"),
            algorithmVersion =
                requiredText(node, "algorithmVersion").also {
                    check(it.isNotEmpty()) { "canonical summary fixture algorithm version is empty" }
                },
        )

    private fun requiredText(
        node: JsonNode,
        field: String,
    ): String =
        node.path(field).takeIf { it.isString }?.asString()
            ?: error("canonical summary fixture field is invalid: $field")

    private fun nullableText(
        node: JsonNode,
        field: String,
    ): String? {
        val value = node.path(field)
        check(value.isNull || value.isString) { "canonical summary fixture nullable text is invalid: $field" }
        return value.takeIf { it.isString }?.asString()
    }

    private fun source(
        node: JsonNode,
        field: String,
    ): String = requiredText(node, field).also { check(it in sources) { "canonical summary fixture source is invalid" } }

    private fun validate(
        node: JsonNode,
        ids: MutableSet<String>,
    ) {
        val keys = mutableSetOf("id", "resolve", "title", "content", "outcome")
        if (node.has("request")) keys += "request"
        if (node.has("expected")) keys += "expected"
        if (node.has("existing")) keys += "existing"
        if (node.has("persisted")) keys += "persisted"
        if (node.has("retry")) keys += "retry"
        check(exactKeys(node, keys)) { "canonical summary fixture is invalid" }
        val id = requiredText(node, "id")
        check(id.isNotEmpty()) { "canonical summary fixture ID is empty" }
        check(ids.add(id)) { "canonical summary fixture ID is duplicated: $id" }
        val resolve = requiredText(node, "resolve")
        check(resolve in resolves) { "canonical summary fixture resolve is invalid" }
        requiredText(node, "title")
        requiredText(node, "content")
        if (resolve == "read") {
            check(!node.has("request") && !node.has("existing") && !node.has("retry")) {
                "read fixture must not define executable input"
            }
            check(node.path("persisted").isObject) { "read fixture persisted value is required" }
            check(exactKeys(node.path("persisted"), setOf("summary", "source", "algorithmVersion"))) {
                "read fixture persisted value is invalid"
            }
            val persisted = expected(node.path("persisted"))
            check(persisted.source == "MIGRATED") { "read fixture persisted source must be MIGRATED" }
        } else {
            check(node.path("request").isObject) { "executable fixture request is required" }
            request(node.path("request"))
            check(!node.has("persisted")) { "executable fixture must not define persisted value" }
        }
        if (node.has("existing")) {
            check(requiredText(node, "resolve") == "modify") { "existing value requires modify resolve" }
            check(node.path("existing").isObject) { "canonical summary fixture existing value is invalid" }
            check(exactKeys(node.path("existing"), setOf("summary", "source"))) { "canonical summary fixture existing value is invalid" }
            existing(node.path("existing"))
        }
        val outcome = requiredText(node, "outcome")
        check(outcome in outcomes) { "canonical summary fixture outcome is invalid" }
        if (resolve == "read") check(outcome == "RESOLVED") { "read fixture must be resolved" }
        val expected = node.path("expected")
        if (outcome == "RESOLVED") {
            check(exactKeys(expected, setOf("summary", "source", "algorithmVersion"))) { "resolved fixture expected value is required" }
        }
        if (outcome != "RESOLVED") check(expected.isMissingNode) { "rejected fixture must not define an expected value" }
        if (expected.isObject) {
            val expectedValue = expected(expected)
            if (resolve == "read") {
                check(expectedValue == expected(node.path("persisted"))) {
                    "read fixture persisted and expected values must match"
                }
            }
        }
        if (node.has("retry")) {
            check(requiredText(node, "resolve") == "create") { "retry requires create resolve" }
            check(node.path("retry").isObject) { "canonical summary fixture retry is invalid" }
            request(node.path("retry"))
        }
        if (resolve == "modify") {
            check(node.has("existing")) { "modified fixture requires an existing value" }
        }
    }

    private fun exactKeys(
        node: JsonNode,
        expected: Set<String>,
    ): Boolean = node.isObject && node.propertyNames().toSet() == expected

    data class Fixture(
        val id: String,
        val resolve: String,
        val title: String,
        val content: String,
        val request: Request?,
        val existing: Existing?,
        val persisted: Expected?,
        val outcome: String,
        val expected: Expected?,
        val retry: Request?,
    )

    data class Request(
        val summaryMode: String?,
        val summary: String?,
    )

    data class Existing(
        val summary: String,
        val source: String,
    )

    data class Expected(
        val summary: String,
        val source: String,
        val algorithmVersion: String,
    )
}
