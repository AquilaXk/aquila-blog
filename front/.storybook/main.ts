import type { StorybookConfig } from "@storybook/nextjs"

// Next.js bundled webpack 경로 오염을 막아 Storybook webpack 인스턴스를 단일화한다.
process.env.__NEXT_PRIVATE_RENDER_WORKER ??= "defined"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  staticDirs: ["../public"],
  docs: {
    autodocs: "tag",
  },
}

export default config
