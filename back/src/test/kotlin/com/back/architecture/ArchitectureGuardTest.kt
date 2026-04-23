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
    private val testSourceRoot: Path = Path.of("src/test/kotlin")

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

    private fun sourceText(path: Path): String = Files.readString(path)

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
            .haveFullyQualifiedName("com.back.boundedContexts.post.adapter.web.ApiV1PostController")
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
}
