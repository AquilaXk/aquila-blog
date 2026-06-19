package com.back.architecture

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import jakarta.persistence.Entity
import jakarta.persistence.MappedSuperclass
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

@org.junit.jupiter.api.DisplayName("ArchitectureGuard 테스트")
class ArchitectureGuardTest {
    private val mainSourceRoot: Path = Path.of("src/main/kotlin")
    private val mainBoundedContextSourceRoot: Path = Path.of("src/main/kotlin/com/back/boundedContexts")
    private val testSourceRoot: Path = Path.of("src/test/kotlin")
    private val boundedContextPackageRegex =
        Regex("""^package\s+com\.back\.boundedContexts\.([A-Za-z][A-Za-z0-9_]*)(?:\.|$)""", RegexOption.MULTILINE)
    private val boundedContextImportRegex =
        Regex("""^import\s+com\.back\.boundedContexts\.([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z0-9_.*]+)(?:\s+as\s+\w+)?\s*$""")
    private val persistenceModelImportRegex =
        Regex(
            """^import\s+""" +
                """(com\.back\.[A-Za-z0-9_.]+\.model(?:\.[A-Za-z0-9_]+)*\.[A-Za-z][A-Za-z0-9_]*)""" +
                """(?:\s+as\s+([A-Za-z][A-Za-z0-9_]*))?\s*$""",
            RegexOption.MULTILINE,
        )
    private val persistenceModelWildcardImportRegex =
        Regex(
            """^import\s+(com\.back\.[A-Za-z0-9_.]+\.model(?:\.[A-Za-z0-9_]+)*)\.\*\s*$""",
            RegexOption.MULTILINE,
        )
    private val persistenceModelAliasTargetRegex =
        Regex("""^com\.back\.[A-Za-z0-9_.]+\.model(?:\.[A-Za-z0-9_]+)*\.[A-Za-z][A-Za-z0-9_]*$""")
    private val typeAliasRegex =
        Regex("""\btypealias\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*([A-Za-z][A-Za-z0-9_.]*)""")

    private data class PersistenceModelAlias(
        val sourcePath: String,
        val aliasName: String,
        val targetFqcn: String,
    )

    private fun importedClasses(): JavaClasses =
        ClassFileImporter()
            .withImportOption(ImportOption.DoNotIncludeTests())
            .importPackages("com.back")

    private fun kotlinTestSources(): List<Path> =
        Files
            .walk(testSourceRoot)
            .use { paths ->
                paths
                    .filter { Files.isRegularFile(it) }
                    .filter { it.toString().endsWith(".kt") }
                    .toList()
            }

    private fun kotlinMainBoundedContextSources(): List<Path> =
        Files
            .walk(mainBoundedContextSourceRoot)
            .use { paths ->
                paths
                    .filter { Files.isRegularFile(it) }
                    .filter { it.toString().endsWith(".kt") }
                    .toList()
            }

    private fun kotlinMainSources(): List<Path> =
        Files
            .walk(mainSourceRoot)
            .use { paths ->
                paths
                    .filter { Files.isRegularFile(it) }
                    .filter { it.toString().endsWith(".kt") }
                    .toList()
            }

    private fun sourceText(path: Path): String = Files.readString(path)

    private fun relativeMainSourcePath(path: Path): String =
        mainSourceRoot
            .relativize(path)
            .joinToString("/") { it.toString() }

    private fun persistenceModelAliasesIn(
        path: Path,
        source: String = sourceText(path),
    ): List<PersistenceModelAlias> {
        val importedModelTargets =
            persistenceModelImportRegex
                .findAll(source)
                .associate { match ->
                    val targetFqcn = match.groupValues[1]
                    val importedName = match.groupValues[2].ifBlank { targetFqcn.substringAfterLast(".") }

                    importedName to targetFqcn
                }
        val wildcardModelImports =
            persistenceModelWildcardImportRegex
                .findAll(source)
                .map { match -> match.groupValues[1] }
                .toList()

        return typeAliasRegex
            .findAll(source)
            .mapNotNull { match ->
                val aliasTarget = match.groupValues[2]
                val targetFqcn =
                    when {
                        persistenceModelAliasTargetRegex.matches(aliasTarget) -> aliasTarget
                        importedModelTargets.containsKey(aliasTarget) -> importedModelTargets.getValue(aliasTarget)
                        wildcardModelImports.isNotEmpty() && !aliasTarget.contains(".") ->
                            wildcardModelImports.joinToString("|") { importPath -> "$importPath.$aliasTarget" }
                        else -> return@mapNotNull null
                    }

                PersistenceModelAlias(
                    sourcePath = relativeMainSourcePath(path),
                    aliasName = match.groupValues[1],
                    targetFqcn = targetFqcn,
                )
            }.toList()
    }

    private fun sourceBoundedContextName(source: String): String? =
        boundedContextPackageRegex
            .find(source)
            ?.groupValues
            ?.get(1)

    private fun isForbiddenDirectCrossBoundedContextImport(targetMemberPath: String): Boolean =
        targetMemberPath.startsWith("model.") ||
            targetMemberPath.startsWith("application.service.")

    @Test
    fun `bounded context에서 legacy app 패키지는 제거되어야 한다`() {
        val legacyAppPackages =
            importedClasses()
                .map { it.packageName }
                .filter { packageName ->
                    packageName.contains(".boundedContexts.") &&
                        packageName.contains(".app.")
                }.toSortedSet()

        assertThat(legacyAppPackages).isEmpty()
    }

    @Test
    fun `입력 adapter layer는 출력 adapter layer를 직접 참조하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "..boundedContexts..adapter.web..",
                "..boundedContexts..adapter.bootstrap..",
                "..boundedContexts..adapter.event..",
                "..boundedContexts..adapter.scheduler..",
            ).should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..boundedContexts..adapter.persistence..",
                "..boundedContexts..adapter.external..",
                "..boundedContexts..adapter.storage..",
                "..boundedContexts..adapter.security..",
                "..boundedContexts..adapter.mail..",
            ).check(importedClasses())
    }

    @Test
    fun `domain layer는 adapter 또는 application service에 의존하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage("..boundedContexts..domain..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..boundedContexts..adapter..",
                "..boundedContexts..application.service..",
            ).check(importedClasses())
    }

    @Test
    fun `domain layer는 JPA Hibernate Spring 프레임워크에 직접 의존하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage("..boundedContexts..domain..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "jakarta.persistence..",
                "org.hibernate..",
                "org.springframework..",
            ).check(importedClasses())
    }

    @Test
    fun `JPA Entity는 domain 패키지에 두지 않는다`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "..boundedContexts..domain..",
                "..global..domain..",
            ).should()
            .beAnnotatedWith(Entity::class.java)
            .orShould()
            .beAnnotatedWith(MappedSuperclass::class.java)
            .check(importedClasses())
    }

    @Test
    fun `application service는 persistence adapter 구현체를 직접 참조하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage("..boundedContexts..application.service..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("..boundedContexts..adapter.persistence..")
            .check(importedClasses())
    }

    @Test
    fun `web controller는 persistence repository에 직접 의존하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "..boundedContexts..adapter.web..",
                "..global..adapter.web..",
            ).should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..boundedContexts..adapter.persistence..",
                "org.springframework.data.jpa.repository..",
            ).check(importedClasses())
    }

    @Test
    fun `global application layer는 persistence adapter 구현체를 직접 참조하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage("..global..application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..global..adapter.persistence..",
                "..boundedContexts..adapter.persistence..",
            ).check(importedClasses())
    }

    @Test
    fun `핵심 web controller는 application service 구현체를 직접 참조하지 않아야 한다`() {
        noClasses()
            .that()
            .haveFullyQualifiedName("com.back.boundedContexts.post.adapter.web.ApiV1PostPublicReadController")
            .or()
            .haveFullyQualifiedName("com.back.boundedContexts.post.adapter.web.ApiV1PostCommandController")
            .or()
            .haveFullyQualifiedName("com.back.boundedContexts.post.adapter.web.ApiV1PostInteractionController")
            .or()
            .haveFullyQualifiedName("com.back.boundedContexts.post.adapter.web.ApiV1PostDraftController")
            .or()
            .haveFullyQualifiedName("com.back.boundedContexts.post.adapter.web.ApiV1AdmPostController")
            .or()
            .haveFullyQualifiedName("com.back.boundedContexts.member.adapter.web.ApiV1AuthController")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("..application.service..")
            .check(importedClasses())
    }

    @Test
    fun `bounded context application port는 Spring Data 타입을 노출하지 않아야 한다`() {
        noClasses()
            .that()
            .resideInAnyPackage("..boundedContexts..application.port..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.springframework.data.domain..")
            .check(importedClasses())
    }

    @Test
    fun `bounded context dependency classifier는 직접 model service import만 차단한다`() {
        assertThat(isForbiddenDirectCrossBoundedContextImport("model.Post")).isTrue()
        assertThat(isForbiddenDirectCrossBoundedContextImport("application.service.PostApplicationService")).isTrue()
        assertThat(isForbiddenDirectCrossBoundedContextImport("event.PostWrittenEvent")).isFalse()
        assertThat(isForbiddenDirectCrossBoundedContextImport("application.port.input.PostUseCase")).isFalse()
        assertThat(isForbiddenDirectCrossBoundedContextImport("application.port.output.PostRepositoryPort")).isFalse()
        assertThat(isForbiddenDirectCrossBoundedContextImport("domain.shared.Member")).isFalse()
        assertThat(isForbiddenDirectCrossBoundedContextImport("dto.MemberDto")).isFalse()
        assertThat(isForbiddenDirectCrossBoundedContextImport("config.shared.AuthSecurityConfigurer")).isFalse()
    }

    @Test
    fun `persistence model typealias는 명시된 legacy bridge만 허용한다`() {
        val allowedAliases =
            setOf(
                PersistenceModelAlias(
                    "com/back/boundedContexts/member/domain/shared/PersistenceModelAliases.kt",
                    "Member",
                    "com.back.boundedContexts.member.model.shared.Member",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/member/domain/shared/PersistenceModelAliases.kt",
                    "MemberAttr",
                    "com.back.boundedContexts.member.model.shared.MemberAttr",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/member/subContexts/memberActionLog/domain/PersistenceModelAliases.kt",
                    "MemberActionLog",
                    "com.back.boundedContexts.member.subContexts.memberActionLog.model.MemberActionLog",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/member/subContexts/notification/domain/PersistenceModelAliases.kt",
                    "MemberNotification",
                    "com.back.boundedContexts.member.subContexts.notification.model.MemberNotification",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/member/subContexts/signupVerification/domain/PersistenceModelAliases.kt",
                    "MemberSignupVerification",
                    "com.back.boundedContexts.member.subContexts.signupVerification.model.MemberSignupVerification",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/post/domain/PersistenceModelAliases.kt",
                    "Post",
                    "com.back.boundedContexts.post.model.Post",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/post/domain/PersistenceModelAliases.kt",
                    "PostAttr",
                    "com.back.boundedContexts.post.model.PostAttr",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/post/domain/PersistenceModelAliases.kt",
                    "PostComment",
                    "com.back.boundedContexts.post.model.PostComment",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/post/domain/PersistenceModelAliases.kt",
                    "PostLike",
                    "com.back.boundedContexts.post.model.PostLike",
                ),
                PersistenceModelAlias(
                    "com/back/boundedContexts/post/domain/PersistenceModelAliases.kt",
                    "PostWriteRequestIdempotency",
                    "com.back.boundedContexts.post.model.PostWriteRequestIdempotency",
                ),
                PersistenceModelAlias(
                    "com/back/global/jpa/domain/PersistenceModelAliases.kt",
                    "BaseEntity",
                    "com.back.global.jpa.model.BaseEntity",
                ),
                PersistenceModelAlias(
                    "com/back/global/jpa/domain/PersistenceModelAliases.kt",
                    "BaseTime",
                    "com.back.global.jpa.model.BaseTime",
                ),
                PersistenceModelAlias(
                    "com/back/global/storage/domain/PersistenceModelAliases.kt",
                    "UploadedFile",
                    "com.back.global.storage.model.UploadedFile",
                ),
                PersistenceModelAlias(
                    "com/back/global/storage/domain/PersistenceModelAliases.kt",
                    "UploadedFileOwnerType",
                    "com.back.global.storage.model.UploadedFileOwnerType",
                ),
                PersistenceModelAlias(
                    "com/back/global/storage/domain/PersistenceModelAliases.kt",
                    "UploadedFilePurpose",
                    "com.back.global.storage.model.UploadedFilePurpose",
                ),
                PersistenceModelAlias(
                    "com/back/global/storage/domain/PersistenceModelAliases.kt",
                    "UploadedFileRetentionReason",
                    "com.back.global.storage.model.UploadedFileRetentionReason",
                ),
                PersistenceModelAlias(
                    "com/back/global/storage/domain/PersistenceModelAliases.kt",
                    "UploadedFileStatus",
                    "com.back.global.storage.model.UploadedFileStatus",
                ),
                PersistenceModelAlias(
                    "com/back/global/task/domain/PersistenceModelAliases.kt",
                    "Task",
                    "com.back.global.task.model.Task",
                ),
                PersistenceModelAlias(
                    "com/back/global/task/domain/PersistenceModelAliases.kt",
                    "TaskStatus",
                    "com.back.global.task.model.TaskStatus",
                ),
            )

        val aliases =
            kotlinMainSources()
                .flatMap(::persistenceModelAliasesIn)
                .toSet()

        assertThat(aliases).containsExactlyInAnyOrderElementsOf(allowedAliases)
    }

    @Test
    fun `persistence model typealias scanner는 import wildcard multiline alias 우회를 수집한다`() {
        val aliases =
            persistenceModelAliasesIn(
                path = mainSourceRoot.resolve("example/domain/PersistenceModelAliases.kt"),
                source =
                    """
                    |package com.back.example.domain
                    |
                    |import com.back.boundedContexts.post.model.Post
                    |import com.back.boundedContexts.post.model.PostAttr as ImportedPostAttr
                    |import com.back.boundedContexts.post.model.*
                    |
                    |typealias ImportedPost = Post
                    |typealias ImportedPostAttrAlias = ImportedPostAttr
                    |typealias WildcardPostComment = PostComment
                    |typealias MultilinePost =
                    |    com.back.boundedContexts.post.model.PostLike
                    """.trimMargin(),
            )

        assertThat(aliases)
            .containsExactlyInAnyOrder(
                PersistenceModelAlias(
                    "example/domain/PersistenceModelAliases.kt",
                    "ImportedPost",
                    "com.back.boundedContexts.post.model.Post",
                ),
                PersistenceModelAlias(
                    "example/domain/PersistenceModelAliases.kt",
                    "ImportedPostAttrAlias",
                    "com.back.boundedContexts.post.model.PostAttr",
                ),
                PersistenceModelAlias(
                    "example/domain/PersistenceModelAliases.kt",
                    "WildcardPostComment",
                    "com.back.boundedContexts.post.model.PostComment",
                ),
                PersistenceModelAlias(
                    "example/domain/PersistenceModelAliases.kt",
                    "MultilinePost",
                    "com.back.boundedContexts.post.model.PostLike",
                ),
            )
    }

    @Test
    fun `bounded context는 다른 context의 model 또는 application service를 직접 import하지 않는다`() {
        val violations =
            kotlinMainBoundedContextSources()
                .flatMap { path ->
                    val source = sourceText(path)
                    val sourceContext = sourceBoundedContextName(source) ?: return@flatMap emptyList()

                    source
                        .lineSequence()
                        .mapNotNull { line ->
                            val match = boundedContextImportRegex.matchEntire(line.trim()) ?: return@mapNotNull null
                            val targetContext = match.groupValues[1]
                            val targetMemberPath = match.groupValues[2]

                            if (targetContext == sourceContext) {
                                return@mapNotNull null
                            }

                            if (!isForbiddenDirectCrossBoundedContextImport(targetMemberPath)) {
                                return@mapNotNull null
                            }

                            "${mainBoundedContextSourceRoot.relativize(path)} imports $targetContext.$targetMemberPath"
                        }.toList()
                }

        assertThat(violations).isEmpty()
    }

    @Test
    fun `application port output은 interface로만 구성되어야 한다`() {
        classes()
            .that()
            .resideInAnyPackage("..boundedContexts..application.port.output..")
            .and()
            .areTopLevelClasses()
            .should()
            .beInterfaces()
            .check(importedClasses())
    }

    @Test
    fun `application port input은 interface로만 구성되어야 한다`() {
        classes()
            .that()
            .resideInAnyPackage("..boundedContexts..application.port.input..")
            .and()
            .areTopLevelClasses()
            .should()
            .beInterfaces()
            .check(importedClasses())
    }

    @Test
    fun `Spring 통합 테스트 설정은 support base에만 선언되어야 한다`() {
        val bannedAnnotations =
            listOf(
                "@SpringBootTest",
                "@DataJpaTest",
                "@WebMvcTest",
                "@ActiveProfiles",
                "@TestPropertySource",
                "@DirtiesContext",
            )

        val violations =
            kotlinTestSources()
                .filterNot { it.startsWith(testSourceRoot.resolve("com/back/support")) }
                .filterNot { it.endsWith("ArchitectureGuardTest.kt") }
                .flatMap { path ->
                    val text = sourceText(path)
                    bannedAnnotations
                        .filter { annotation -> text.contains(annotation) }
                        .map { annotation -> "${testSourceRoot.relativize(path)} uses $annotation" }
                }

        assertThat(violations).isEmpty()
    }

    @Test
    fun `Spring test bean override는 support base에만 선언되어야 한다`() {
        val bannedOverrides =
            listOf(
                "@MockBean",
                "@SpyBean",
                "@MockitoBean",
                "@MockitoSpyBean",
                "@MockkBean",
                "@SpykBean",
            )

        val violations =
            kotlinTestSources()
                .filterNot { it.startsWith(testSourceRoot.resolve("com/back/support")) }
                .filterNot { it.endsWith("ArchitectureGuardTest.kt") }
                .flatMap { path ->
                    val text = sourceText(path)
                    bannedOverrides
                        .filter { annotation -> text.contains(annotation) }
                        .map { annotation -> "${testSourceRoot.relativize(path)} uses $annotation" }
                }

        assertThat(violations).isEmpty()
    }

    @Test
    fun `backend Gradle build logic은 목적별 script plugin으로 분리되어야 한다`() {
        val buildGradle = Files.readString(Path.of("build.gradle.kts"))
        val requiredScripts =
            listOf(
                "gradle/backend-test-infra.gradle.kts",
                "gradle/backend-jacoco.gradle.kts",
                "gradle/backend-ktlint.gradle.kts",
            )

        assertThat(requiredScripts)
            .allSatisfy { scriptPath ->
                assertThat(Path.of(scriptPath)).exists()
                assertThat(buildGradle).contains("""apply(from = "$scriptPath")""")
            }

        assertThat(buildGradle)
            .doesNotContain(
                "fun Project.runTestInfraCommand",
                "fun Project.startTestInfra",
                """register<Test>("testcontainersTest")""",
                "tasks.register<JacocoReport>",
                "tasks.register<JacocoCoverageVerification>",
                "ktlint {",
            )
    }
}
