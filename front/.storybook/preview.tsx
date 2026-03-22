import type { Preview } from "@storybook/react"
import React from "react"
import { ThemeProvider } from "src/layouts/RootLayout/ThemeProvider"

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider scheme="dark">
        <div style={{ width: "100%", minHeight: "100vh", padding: "2rem" }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true,
    },
    a11y: {
      test: "error",
    },
  },
}

export default preview
