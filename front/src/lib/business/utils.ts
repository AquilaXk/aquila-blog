export * from "./markdownUtils";

// URL에서 쿼리 파라미터를 추출하는 유틸리티 함수
export function getParamsFromUrl(url: string): Record<string, string> {
  if (!url.includes("?")) return {};

  if (!url.startsWith("http")) url = `https://localhost/${url}`;

  const urlObj = new URL(url);

  const searchParams = new URLSearchParams(urlObj.search);
  return Object.fromEntries(searchParams.entries());
}

// 객체에서 특정 키만 필터링하는 유틸리티 함수
export function filterObjectKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: { [key: string]: any },
  allowedKeys: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys(obj).reduce((filtered: { [key: string]: any }, key) => {
    if (allowedKeys.includes(key)) {
      filtered[key] = obj[key];
    }
    return filtered;
  }, {});
}

export function isExternalUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("//")
  );
}
