package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.support.BaseMemberControllerWebMvcTest
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import java.time.Instant
import java.util.Optional

@org.junit.jupiter.api.DisplayName("ApiV1MemberControllerWebMvc 테스트")
class ApiV1MemberControllerWebMvcTest : BaseMemberControllerWebMvcTest() {
    @Nested
    inner class AdminProfile {
        @Test
        fun `관리자 프로필 조회는 잘못된 인증 정보가 있어도 공개 응답을 반환한다`() {
            val adminMember = sampleMember(id = 1, username = "admin", nickname = "관리자")
            adminMember.profileRole = "블로그 운영자"
            adminMember.profileBio = "소개"
            adminMember.aboutRole = "Platform Engineer"
            adminMember.aboutBio = "상세 About 소개"
            adminMember.blogTitle = "aquilaXk's Archive"
            adminMember.homeIntroTitle = "aquilaXk's Blog"
            adminMember.homeIntroDescription = "welcome to my backend dev log!"
            given(memberUseCase.findByEmail("admin@test.com")).willReturn(adminMember)
            given(currentMemberProfileQueryUseCase.getPublishedById(adminMember.id))
                .willReturn(MemberWithUsernameDto(adminMember))

            mvc
                .get("/member/api/v1/members/adminProfile") {
                    cookie(Cookie("apiKey", "invalid-api-key"))
                    cookie(Cookie("accessToken", "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1MemberController::class.java))
                    match(handler().methodName("getAdminProfile"))
                    jsonPath("$.username") { value(adminMember.name) }
                    jsonPath("$.nickname") { value(adminMember.nickname) }
                    jsonPath("$.profileRole") { value("블로그 운영자") }
                    jsonPath("$.profileBio") { value("소개") }
                    jsonPath("$.aboutRole") { value("Platform Engineer") }
                    jsonPath("$.aboutBio") { value("상세 About 소개") }
                    jsonPath("$.blogTitle") { value("aquilaXk's Archive") }
                    jsonPath("$.homeIntroTitle") { value("aquilaXk's Blog") }
                    jsonPath("$.homeIntroDescription") { value("welcome to my backend dev log!") }
                    jsonPath("$.profileImageUrl") { value(startsWith(adminMember.redirectToProfileImgUrlOrDefault)) }
                }
        }
    }

    @Nested
    inner class RedirectToProfileImg {
        @Test
        fun `프로필 이미지 리다이렉트 요청이 성공하면 Location 헤더와 함께 302를 반환한다`() {
            val member = sampleMember(id = 7, username = "user1", nickname = "user1")
            member.profileImgUrl = "https://cdn.example.com/profile/user1.png"
            given(memberUseCase.findById(member.id)).willReturn(Optional.of(member))

            mvc
                .get("/member/api/v1/members/${member.id}/redirectToProfileImg")
                .andExpect {
                    status { isFound() }
                    match(handler().handlerType(ApiV1MemberController::class.java))
                    match(handler().methodName("redirectToProfileImg"))
                    header { exists(HttpHeaders.LOCATION) }
                    header { string(HttpHeaders.LOCATION, member.profileImgUrlOrDefault) }
                }
        }

        @Test
        fun `프로필 이미지 리다이렉트 요청에서 없는 회원 id 를 보내면 404를 반환한다`() {
            given(memberUseCase.findById(999999)).willReturn(Optional.empty())

            mvc
                .get("/member/api/v1/members/999999/redirectToProfileImg")
                .andExpect {
                    status { isNotFound() }
                    match(handler().handlerType(ApiV1MemberController::class.java))
                    match(handler().methodName("redirectToProfileImg"))
                    jsonPath("$.resultCode") { value("404-1") }
                    jsonPath("$.msg") { value("해당 데이터가 존재하지 않습니다.") }
                }
        }
    }

    @Nested
    inner class RandomSecureTip {
        @Test
        fun `랜덤 보안 팁 조회는 보안 안내 문구를 반환한다`() {
            given(securityTipProvider.signupPasswordTip()).willReturn("비밀번호는 영문, 숫자, 특수문자를 조합하여 8자 이상으로 설정하세요.")

            mvc
                .get("/member/api/v1/members/randomSecureTip")
                .andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1MemberController::class.java))
                    match(handler().methodName("randomSecureTip"))
                    header { string(HttpHeaders.CONTENT_TYPE, startsWith(MediaType.TEXT_PLAIN_VALUE)) }
                    content {
                        string("비밀번호는 영문, 숫자, 특수문자를 조합하여 8자 이상으로 설정하세요.")
                    }
                }
        }
    }

    private fun sampleMember(
        id: Long,
        username: String,
        nickname: String,
    ): Member {
        val member =
            Member(
                id = id,
                username = username,
                password = null,
                nickname = nickname,
                email = "$username@test.com",
            )
        member.createdAt = Instant.parse("2026-03-13T00:00:00Z")
        member.modifiedAt = Instant.parse("2026-03-13T00:01:00Z")
        return member
    }
}
