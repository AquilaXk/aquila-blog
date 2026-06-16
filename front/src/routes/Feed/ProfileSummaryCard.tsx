import styled from "@emotion/styled"
import { CONFIG } from "site.config"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { usePostsTotalCountQuery } from "src/hooks/usePostsTotalCountQuery"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { resolveContactLinks, resolveServiceLinks } from "src/libs/utils/profileCardLinks"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const resolveSummaryLinks = (adminProfile: AdminProfile | null | undefined) => {
  const contactLinks = resolveContactLinks(adminProfile)
  const serviceLinks = resolveServiceLinks(adminProfile)

  return [...contactLinks.slice(0, 1), ...serviceLinks.slice(0, 1)]
}

const ProfileSummaryCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const totalPostCount = usePostsTotalCountQuery()
  const { tagEntries } = useTagsQuery()
  const imageSrc =
    adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.nickname || adminProfile?.name || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const summaryLinks = resolveSummaryLinks(adminProfile)
  const statItems = [
    ...(typeof totalPostCount === "number" ? [{ label: "Posts", value: String(totalPostCount) }] : []),
    { label: "Tags", value: tagEntries.length ? String(tagEntries.length) : "-" },
    { label: "Focus", value: "Backend" },
  ]

  return (
    <StyledWrapper data-ui="feed-profile-summary" aria-label="AquilaLog profile summary">
      <div className="identity">
        <span className="avatar" aria-hidden="true">
          <ProfileImage src={imageSrc} width={48} height={48} alt="" fillContainer />
        </span>
        <div className="copy">
          <strong>{displayName}</strong>
          <span>{displayRole}</span>
        </div>
      </div>
      <dl className="stats" aria-label="블로그 통계">
        {statItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="links">
        {summaryLinks.map((link) => (
          <a key={`${link.label}:${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ))}
      </div>
    </StyledWrapper>
  )
}

export default ProfileSummaryCard

const StyledWrapper = styled.aside`
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(48, 54, 61, 0.92);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(33, 38, 45, 0.72), rgba(22, 27, 34, 0.94)),
    #161b22;
  box-shadow: 0 18px 44px rgba(1, 4, 9, 0.34);
  padding: 1rem;
  color: #f0f6fc;

  .identity {
    display: flex;
    align-items: center;
    gap: 0.78rem;
    min-width: 0;
  }

  .avatar {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 999px;
    overflow: hidden;
    flex: 0 0 auto;
    border: 1px solid rgba(240, 246, 252, 0.14);
    background: #21262d;

    img {
      object-fit: cover;
      object-position: center 38%;
    }
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.14rem;

    strong {
      color: #f0f6fc;
      font-size: 1.02rem;
      line-height: 1.2;
      font-weight: 850;
      letter-spacing: -0.03em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      color: #8b949e;
      font-size: 0.78rem;
      line-height: 1.35;
      font-weight: 720;
    }
  }

  .stats {
    margin: 1rem 0 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.48rem;
  }

  .stats div {
    min-width: 0;
    border: 1px solid rgba(48, 54, 61, 0.78);
    border-radius: 12px;
    background: rgba(13, 17, 23, 0.58);
    padding: 0.64rem 0.62rem;
  }

  dt {
    margin: 0;
    color: #6e7681;
    font-size: 0.64rem;
    line-height: 1.2;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  dd {
    margin: 0.18rem 0 0;
    color: #f0f6fc;
    font-size: 1.05rem;
    line-height: 1.1;
    font-weight: 860;
    letter-spacing: -0.035em;
  }

  .links {
    margin-top: 0.82rem;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 0.48rem;
    flex-wrap: wrap;
  }

  .links a {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0 0.76rem;
    border: 1px solid rgba(88, 166, 255, 0.42);
    background: rgba(88, 166, 255, 0.1);
    color: #c9e7ff;
    text-decoration: none;
    font-size: 0.75rem;
    font-weight: 820;
  }
`
