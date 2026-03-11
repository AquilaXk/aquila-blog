package com.back.architecture

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ArchitectureGuardTest {
    @Test
    fun `domain layer에서 outbound repository 직접 의존은 허용 목록만 유지되어야 한다`() {
        val importedClasses = ClassFileImporter()
            .withImportOption(ImportOption.DoNotIncludeTests())
            .importPackages("com.back")

        val offendingOrigins = importedClasses
            .filter { javaClass ->
                javaClass.packageName.contains(".boundedContexts.") &&
                    javaClass.packageName.contains(".domain.")
            }
            .flatMap { javaClass ->
                javaClass.directDependenciesFromSelf
                    .filter { dependency ->
                        dependency.targetClass.packageName.contains(".boundedContexts.") &&
                            dependency.targetClass.packageName.contains(".out.")
                    }
                    .map { javaClass.name }
            }
            .toSortedSet()

        // 현재 기술부채 스냅샷. 새 의존이 생기면 테스트를 실패시켜 아키텍처 악화를 차단한다.
        val allowedLegacyOrigins = sortedSetOf(
            "com.back.boundedContexts.member.domain.shared.Member",
            "com.back.boundedContexts.member.domain.shared.Member\$Companion",
            "com.back.boundedContexts.member.domain.shared.memberMixin.MemberHasProfileImgUrl",
        )

        assertThat(offendingOrigins).isEqualTo(allowedLegacyOrigins)
    }
}
