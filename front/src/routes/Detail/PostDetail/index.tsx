import React from "react"
import PostHeader from "./PostHeader"
import Footer from "./PostFooter"
import CommentBox from "./CommentBox"
import Category from "src/components/Category"
import styled from "@emotion/styled"
import NotionRenderer from "../components/NotionRenderer"
import usePostQuery from "src/hooks/usePostQuery"

type Props = {}

const PostDetail: React.FC<Props> = () => {
  const data = usePostQuery()

  if (!data) return null

  const category = (data.category && data.category?.[0]) || undefined

  return (
    <StyledWrapper>
      <article>
        <TopMetaRow>
          {category && (
            <Category readOnly={data.status?.[0] === "PublicOnDetail"}>
              {category}
            </Category>
          )}
        </TopMetaRow>
        {data.type[0] === "Post" && <PostHeader data={data} />}
        <BodyCard>
          <NotionRenderer content={data.content} />
        </BodyCard>
        {data.type[0] === "Post" && (
          <>
            <Footer />
            <CommentBox data={data} />
          </>
        )}
      </article>
    </StyledWrapper>
  )
}

export default PostDetail

const StyledWrapper = styled.div`
  max-width: 72rem;
  margin: 0 auto;

  > article {
    margin: 0 auto;
    max-width: 58rem;
  }
`

const TopMetaRow = styled.div`
  margin-bottom: 0.9rem;
`

const BodyCard = styled.div`
  margin-top: 1.2rem;
  padding: 1.1rem 1.35rem 1.5rem;
  border-radius: 28px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray1}, ${({ theme }) => theme.colors.gray2});
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);

  @media (max-width: 768px) {
    padding: 0.95rem 1rem 1.25rem;
    border-radius: 22px;
  }
`
