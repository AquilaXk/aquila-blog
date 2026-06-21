import { CONFIG } from "site.config"
import MetaConfig from "src/components/MetaConfig"
import { ErrorFallbackView } from "src/components/error/ErrorFallbackView"

const ServerErrorPage = () => (
  <>
    <MetaConfig
      title="문제가 발생했습니다"
      description="요청한 화면을 표시하지 못했습니다."
      type="website"
      url={CONFIG.link}
      robots="noindex, follow"
      canonicalUrl={null}
    />
    <ErrorFallbackView variant="global" errorId="err_server_500" />
  </>
)

export default ServerErrorPage
