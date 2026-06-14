import styled from "@emotion/styled";
export const StyledWrapper = styled.div `
  max-width: 62rem;
  margin: 0 auto;
  padding: 2.25rem 0 3rem;

  .about-content {
    display: grid;
    gap: 2.6rem;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.9fr);
    gap: 2.25rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  .hero-copy {
    min-width: 0;
  }

  .about-eyebrow {
    margin: 0 0 0.9rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 1.05rem;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .profile-name {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(2.4rem, 2rem + 1vw, 3.25rem);
    line-height: 1.02;
    letter-spacing: -0.045em;
    font-weight: 800;
  }

  .profile-statement {
    margin: 1rem 0 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.18rem, 1.02rem + 0.42vw, 1.45rem);
    line-height: 1.5;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .profile-role {
    margin: 0.8rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.98rem;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .profile-bio {
    margin: 1.1rem 0 0;
    max-width: 40rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 1rem;
    line-height: 1.8;
    white-space: pre-line;
    word-break: keep-all;
  }

  .hero-rail {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 1rem;
  }

  .profile-avatar {
    position: relative;
    width: 148px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => (theme.colors.gray1)};
    box-shadow: ${({ theme }) => "0 18px 38px rgba(0, 0, 0, 0.18)"};

    &::after {
      content: "";
      display: block;
      padding-bottom: 100%;
    }
  }

  .cta-group {
    width: min(100%, 270px);
    display: flex;
    flex-wrap: wrap;
    gap: 0.56rem;

    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0.68rem 0.92rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => (theme.colors.gray1)};
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.94rem;
      font-weight: 700;
      line-height: 1;
      transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

      &:hover {
        background: ${({ theme }) => theme.colors.gray2};
        border-color: ${({ theme }) => theme.colors.gray10};
        transform: translateY(-1px);
      }
    }
  }

  .content-section {
    min-width: 0;
  }

  .section-title {
    margin: 0 0 1.1rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.38rem;
    line-height: 1.35;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .project-list,
  .timeline-list,
  .supplemental-list,
  .compact-link-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .project-list {
    display: grid;
    gap: 0.7rem;

    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(10rem, 15rem);
      gap: 1.1rem;
      padding: 1rem 1.1rem;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      border-radius: 16px;
      background: ${({ theme }) => (theme.colors.gray1)};
    }
  }

  .project-copy {
    min-width: 0;

    h3 {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1.05rem;
      line-height: 1.4;
      font-weight: 720;
    }

    p {
      margin: 0.4rem 0 0;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.96rem;
      line-height: 1.7;
      word-break: keep-all;
    }
  }

  .project-meta {
    display: grid;
    justify-items: start;
    align-content: start;
    gap: 0.5rem;

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.84rem;
      line-height: 1.4;
      font-weight: 700;
      text-align: left;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    a {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0.42rem 0.7rem;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      border-radius: 999px;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.86rem;
      line-height: 1.4;
      font-weight: 650;

      &:hover {
        border-color: ${({ theme }) => theme.colors.gray10};
        text-decoration: none;
      }
    }
  }

  .timeline-list {
    display: grid;
    gap: 0.92rem;

    li {
      display: flex;
      align-items: baseline;
      gap: 1rem;
    }
  }

  .timeline-date {
    flex: 0 0 7.2rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    line-height: 1.45rem;
    font-weight: 650;
  }

  .timeline-list strong {
    flex: 1 1 auto;
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    line-height: 1.45rem;
    font-weight: 650;
  }

  .supplemental-section[data-has-divider="true"] {
    padding-top: 1.2rem;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  .supplemental-list {
    display: grid;
    gap: 0.52rem;

    li {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.98rem;
      line-height: 1.7;
    }
  }

  .compact-link-section {
    .section-title {
      margin-bottom: 0.82rem;
    }
  }

  .compact-link-list {
    background: transparent;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};

    li + li {
      border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    }

    a {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      width: 100%;
      min-height: 44px;
      padding: 0.84rem 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.98rem;
      line-height: 1.5;

      &:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 1.05rem;
    }
  }

  @media (max-width: 900px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .hero-rail {
      justify-items: start;
    }

    .cta-group {
      width: 100%;
      max-width: 28rem;
    }

    .project-list li {
      grid-template-columns: 1fr;
    }

    .project-meta {
      justify-items: start;

      span {
        text-align: left;
      }
    }
  }

  @media (max-width: 768px) {
    padding: 1.6rem 0 2.4rem;

    .about-content {
      gap: 2.1rem;
    }

    .hero-grid {
      padding-bottom: 1.6rem;
    }

    .profile-name {
      font-size: 2.25rem;
    }

    .profile-statement {
      font-size: 1.08rem;
      line-height: 1.56;
    }

    .profile-role {
      font-size: 0.9rem;
    }

    .profile-bio {
      font-size: 0.96rem;
      line-height: 1.72;
    }

    .profile-avatar {
      width: 88px;
      box-shadow: none;
    }

    .cta-group {
      gap: 0.54rem;

      a {
        min-height: 42px;
        padding: 0.76rem 0.88rem;
        font-size: 0.95rem;
      }
    }

    .section-title {
      font-size: 1.18rem;
      margin-bottom: 0.88rem;
    }

    .timeline-list {
      gap: 0.74rem;

      li {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.18rem;
      }
    }

    .timeline-date {
      flex-basis: auto;
      font-size: 0.82rem;
    }

    .project-copy p,
    .supplemental-list li,
    .compact-link-list a {
      font-size: 0.94rem;
    }
  }
`;
