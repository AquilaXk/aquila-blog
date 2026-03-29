import { CONFIG } from "../../site.config"
import CustomError from "../routes/Error"
import MetaConfig from "src/components/MetaConfig"

const NotFoundPage = () => {
  return (
    <>
      <MetaConfig
        {...{
          title: CONFIG.blog.title,
          description: CONFIG.blog.description,
          type: "website",
          url: CONFIG.link,
        }}
      />
      <CustomError />
    </>
  )
}

export default NotFoundPage
