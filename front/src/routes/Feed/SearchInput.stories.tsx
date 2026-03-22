import type { Meta, StoryObj } from "@storybook/react"
import SearchInput from "./SearchInput"

const meta: Meta<typeof SearchInput> = {
  title: "Feed/SearchInput",
  component: SearchInput,
  tags: ["autodocs"],
  args: {
    defaultValue: "",
  },
}

export default meta

type Story = StoryObj<typeof SearchInput>

export const Empty: Story = {}

export const WithKeyword: Story = {
  args: {
    defaultValue: "헥사고날 아키텍처",
  },
}

export const Narrow: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  args: {
    defaultValue: "SSE",
  },
}
