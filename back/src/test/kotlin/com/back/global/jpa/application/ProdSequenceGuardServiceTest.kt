package com.back.global.jpa.application

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.contains
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate

class ProdSequenceGuardServiceTest {
    @Test
    fun `post_pkey 충돌이면 allocation 정렬 setval로 보정한다`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val service = ProdSequenceGuardService(jdbcTemplate, sequenceGuardOnStartup = false)

        val repaired =
            service.repairIfSequenceDrift(
                DataIntegrityViolationException("duplicate key value violates unique constraint \"post_pkey\""),
            )

        assertThat(repaired).isTrue()
        verify(jdbcTemplate).execute("ALTER SEQUENCE IF EXISTS public.post_seq INCREMENT BY 50")
        verify(jdbcTemplate).execute(
            "SELECT setval('public.post_seq', COALESCE((SELECT MAX(id) FROM public.post), 0) + 50, false)",
        )
    }

    @Test
    fun `pk_member_signup_verification 별칭도 보정 타깃으로 인식한다`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val service = ProdSequenceGuardService(jdbcTemplate, sequenceGuardOnStartup = false)

        val repaired =
            service.repairIfSequenceDrift(
                DataIntegrityViolationException(
                    "duplicate key value violates unique constraint \"pk_member_signup_verification\"",
                ),
            )

        assertThat(repaired).isTrue()
        verify(jdbcTemplate).execute("ALTER SEQUENCE IF EXISTS public.member_signup_verification_seq INCREMENT BY 20")
        verify(jdbcTemplate).execute(
            "SELECT setval('public.member_signup_verification_seq', COALESCE((SELECT MAX(id) FROM public.member_signup_verification), 0) + 20, false)",
        )
    }

    @Test
    fun `한글 로케일 duplicate 메시지도 uploaded_file 시퀀스 보정 타깃으로 인식한다`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val service = ProdSequenceGuardService(jdbcTemplate, sequenceGuardOnStartup = false)

        val repaired =
            service.repairIfSequenceDrift(
                DataIntegrityViolationException("중복 키 값이 고유 제약 조건 \"uploaded_file_pkey\"을 위반했습니다."),
            )

        assertThat(repaired).isTrue()
        verify(jdbcTemplate).execute("ALTER SEQUENCE IF EXISTS public.uploaded_file_seq INCREMENT BY 1")
        verify(jdbcTemplate).execute(
            "SELECT setval('public.uploaded_file_seq', COALESCE((SELECT MAX(id) FROM public.uploaded_file), 0) + 1, false)",
        )
    }

    @Test
    fun `uploaded_file 전용 보정은 ALTER 실패 시 setval-only fallback으로 복구한다`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        doThrow(RuntimeException("permission denied for sequence uploaded_file_seq"))
            .`when`(jdbcTemplate)
            .execute(contains("ALTER SEQUENCE IF EXISTS public.uploaded_file_seq"))
        val service = ProdSequenceGuardService(jdbcTemplate, sequenceGuardOnStartup = false)

        val repaired = service.repairUploadedFileSequence()

        assertThat(repaired).isTrue()
        verify(jdbcTemplate).execute("ALTER SEQUENCE IF EXISTS public.uploaded_file_seq INCREMENT BY 1")
        verify(jdbcTemplate).execute(
            "SELECT setval('public.uploaded_file_seq', COALESCE((SELECT MAX(id) FROM public.uploaded_file), 0) + 1, false)",
        )
    }

    @Test
    fun `시퀀스 대상이 아닌 unique 충돌은 보정하지 않는다`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val service = ProdSequenceGuardService(jdbcTemplate, sequenceGuardOnStartup = false)

        val repaired =
            service.repairIfSequenceDrift(
                DataIntegrityViolationException("duplicate key value violates unique constraint \"uk_post_like_liker_post\""),
            )

        assertThat(repaired).isFalse()
        verifyNoInteractions(jdbcTemplate)
    }
}
