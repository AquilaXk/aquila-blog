package com.back.architecture

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ArchitectureGuardTest {
    private fun importedClasses(): JavaClasses =
        ClassFileImporter()
            .withImportOption(ImportOption.DoNotIncludeTests())
            .importPackages("com.back")

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
}
