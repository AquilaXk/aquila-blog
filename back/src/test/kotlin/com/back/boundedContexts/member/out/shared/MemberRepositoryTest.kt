package com.back.boundedContexts.member.out.shared

import com.back.boundedContexts.member.app.MemberFacade
import com.back.boundedContexts.member.domain.shared.Member
import com.back.standard.dto.member.type1.MemberSearchSortType1
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@Transactional
class MemberRepositoryTest {

    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var memberFacade: MemberFacade

    private fun join(username: String, nickname: String): Member =
        memberFacade.join(username, "1234", nickname, null)

    private fun search(kw: String): Page<Member> =
        memberRepository.findQPagedByKw(
            kw,
            PageRequest.of(0, 100, MemberSearchSortType1.CREATED_AT.sortBy)
        )

    private fun usernamesBy(kw: String): List<String> =
        search(kw).content.map(Member::username)

    private fun nicknamesBy(kw: String): List<String> =
        search(kw).content.map(Member::nickname)

    @Nested
    inner class `1 기본 검색` {
        @Test
        fun `단일 키워드는 username 에 포함되어 있으면 검색된다`() {
            join("zzalpha-user", "평범한닉네임")
            join("zzbeta-user", "다른닉네임")

            assertThat(usernamesBy("zzalpha"))
                .contains("zzalpha-user")
                .doesNotContain("zzbeta-user")
        }

        @Test
        fun `단일 키워드는 nickname 에 포함되어 있으면 검색된다`() {
            join("plain-user-a", "망고 연구회")
            join("plain-user-b", "사과 연구회")

            assertThat(nicknamesBy("망고"))
                .contains("망고 연구회")
                .doesNotContain("사과 연구회")
        }

        @Test
        fun `단일 키워드는 username 과 nickname 중 한쪽에만 있어도 검색된다`() {
            join("papaya-user", "여름모임")
            join("summer-user", "papaya club")

            assertThat(usernamesBy("papaya"))
                .contains("summer-user", "papaya-user")
        }
    }

    @Nested
    inner class `2 AND OR 검색` {
        @Test
        fun `공백으로 구분한 두 키워드는 둘 다 포함한 회원만 검색된다`() {
            join("android-a", "안드로이드 가이드")
            join("android-only", "안드로이드 레시피")
            join("guide-only", "개발 가이드")

            assertThat(usernamesBy("안드로이드 가이드"))
                .containsExactly("android-a")
        }

        @Test
        fun `플러스로 명시한 AND 검색은 두 키워드를 모두 포함한 회원만 검색한다`() {
            join("cloud-aws", "클러스터 운영")
            join("cloud-only", "클라우드 운영")
            join("cluster-only", "클러스터 운영팀")

            assertThat(usernamesBy("+cloud +클러스터"))
                .containsExactly("cloud-aws")
        }

        @Test
        fun `OR 검색은 둘 중 하나라도 포함한 회원을 검색한다`() {
            join("python-user", "데이터 분석")
            join("javascript-user", "웹 개발")
            join("java-user", "백엔드 개발")

            assertThat(usernamesBy("python OR javascript"))
                .containsExactlyInAnyOrder("python-user", "javascript-user")
        }
    }

    @Nested
    inner class `3 NOT 검색` {
        @Test
        fun `마이너스 검색어를 붙이면 제외 단어를 포함한 회원은 검색 결과에서 빠진다`() {
            join("apple-banana", "과일 연구회")
            join("apple-only", "과일 스터디")

            assertThat(usernamesBy("apple -banana"))
                .containsExactly("apple-only")
        }

        @Test
        fun `제외 단어가 nickname 에 있으면 username 이 매칭되어도 결과에서 빠진다`() {
            join("search-hit", "제외단어 포함")
            join("search-pass", "정상 회원")

            assertThat(usernamesBy("search -제외단어"))
                .containsExactly("search-pass")
        }

        @Test
        fun `여러 마이너스 검색어를 함께 주면 모든 제외 조건을 동시에 적용한다`() {
            join("fruit-apple", "바나나 동호회")
            join("fruit-orange", "오렌지 동호회")
            join("fruit-kiwi", "키위 동호회")

            assertThat(usernamesBy("fruit -바나나 -오렌지"))
                .containsExactly("fruit-kiwi")
        }
    }

    @Nested
    inner class `4 구문 전위 그룹 검색` {
        @Test
        fun `구문 검색은 따옴표 안 문구가 정확히 이어져 있을 때만 검색된다`() {
            join("phrase-hit", "빠른 정렬 연구회")
            join("phrase-miss", "빠른 알고리즘 정렬 연구회")

            assertThat(usernamesBy("\"빠른 정렬\""))
                .containsExactly("phrase-hit")
        }

        @Test
        fun `전위 검색은 영문 prefix 와 일치하는 username 을 검색한다`() {
            join("spring-guide", "프레임워크")
            join("springboot-lab", "자동설정")
            join("hibernate-lab", "ORM")

            assertThat(usernamesBy("spring*"))
                .containsExactlyInAnyOrder("spring-guide", "springboot-lab")
        }

        @Test
        fun `괄호로 묶은 OR 조건 뒤에 AND 키워드를 붙이면 두 조건을 함께 만족한 회원만 검색된다`() {
            join("mysql-designer", "스키마 설계")
            join("postgres-designer", "데이터 설계")
            join("mysql-backup", "백업 운영")

            assertThat(usernamesBy("(mysql OR postgres) 설계"))
                .containsExactlyInAnyOrder("mysql-designer", "postgres-designer")
        }

        @Test
        fun `괄호로 묶은 OR 조건에 마이너스 검색어를 더하면 제외 조건까지 함께 적용한다`() {
            join("python-crawler", "데이터 수집")
            join("r-visualizer", "데이터 시각화")
            join("python-ml", "머신러닝 실험실")
            join("r-ml", "통계 머신러닝")

            assertThat(usernamesBy("(python OR r) -머신러닝"))
                .containsExactlyInAnyOrder("python-crawler", "r-visualizer")
        }
    }
}
