import localFont from 'next/font/local'

export const pretendard = localFont({
  src: [
    {
      path: './Pretendard-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './Pretendard-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  // Home/header copy uses these weights on first paint, so preload them to avoid font-swap CLS.
  preload: true,
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'Helvetica Neue',
    'Apple SD Gothic Neo',
    'Malgun Gothic',
    'Noto Sans KR',
    'Arial',
    'sans-serif',
  ],
})
