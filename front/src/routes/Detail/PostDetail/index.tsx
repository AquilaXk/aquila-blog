import React from "react"
import PostHeader from "./PostHeader"
import Footer from "./PostFooter"
import CommentBox from "./CommentBox"
import styled from "@emotion/styled"
import NotionRenderer from "../components/NotionRenderer"
import usePostQuery from "src/hooks/usePostQuery"
import { TPostComment } from "src/types"

type Props = {
  initialComments?: TPostComment[] | null
}

const PostDetail: React.FC<Props> = ({ initialComments = null }) => {
  const data = usePostQuery()

  if (!data) return null

  const category = (data.category && data.category?.[0]) || undefined

  return (
    <StyledWrapper>
      <article>
        {data.type[0] === "Post" && <PostHeader data={data} category={category} />}
        <BodySection>
          <NotionRenderer content={data.content} />
        </BodySection>
        {data.type[0] === "Post" && (
          <>
            <Footer />
            <CommentBox data={data} initialComments={initialComments} />
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
    max-width: 52rem;
  }
`

const BodySection = styled.div`
  margin-top: 2rem;

  @media (max-width: 768px) {
    margin-top: 1.6rem;
  }
`
