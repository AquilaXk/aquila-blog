/**
 * 코드 블록 문법(```)을 Toast UI Editor 커스텀 문법($$)으로 변환
 *
 * 지원 문법:
 * - ```uml, ```plantuml  → $$uml ... $$
 * - ```mermaid            → $$mermaid ... $$
 * - ```youtube            → $$youtube ... $$
 * - ```chart              → $$chart ... $$
 * - ```codepen            → $$codepen ... $$
 * - ```katex, ```math     → $$katex ... $$
 */
export function convertCodeBlocksToDiagramSyntax(content: string): string {
  // 변환 규칙: [매칭할 코드블록 언어들, 변환될 $$ 태그명]
  const rules: [RegExp, string][] = [
    [/```(?:uml|plantuml)\s*\n([\s\S]*?)```/gi, "uml"],
    [/```mermaid\s*\n([\s\S]*?)```/gi, "mermaid"],
    [/```youtube\s*\n([\s\S]*?)```/gi, "youtube"],
    [/```chart\s*\n([\s\S]*?)```/gi, "chart"],
    [/```codepen\s*\n([\s\S]*?)```/gi, "codepen"],
    [/```(?:katex|math)\s*\n([\s\S]*?)```/gi, "katex"],
  ];

  let result = content;
  for (const [pattern, tag] of rules) {
    result = result.replace(
      pattern,
      (_, code) => `$$${tag}\n${code.trim()}\n$$`,
    );
  }

  return result;
}

export function processMarkdownContent(
  content: string,
  currentPostId: string | number,
): string {
  let processedContent = content;

  // 1. [text](surl:ppt/ID) -> [text](/p/{currentPostId}/ppt/ID)
  // Support optional hash: surl:ppt/ID#HASH
  processedContent = processedContent.replace(
    /\[([^\]]+)\]\(surl:ppt\/([^)#\s]+)(?:#([^)]+))?\)/g,
    (_, text, id, hash) => {
      const hashPart = hash ? `#${hash}` : "";
      return `[${text}](/p/${currentPostId}/ppt/${id}${hashPart})`;
    },
  );

  // 2. [text](surl:POSTID/ppt/ID) -> [text](/p/{POSTID}/ppt/ID)
  // Support optional hash: surl:POSTID/ppt/ID#HASH
  processedContent = processedContent.replace(
    /\[([^\]]+)\]\(surl:(\d+)\/ppt\/([^)#\s]+)(?:#([^)]+))?\)/g,
    (_, text, postId, id, hash) => {
      const hashPart = hash ? `#${hash}` : "";
      return `[${text}](/p/${postId}/ppt/${id}${hashPart})`;
    },
  );

  // 3. [text](surl:raw/ID) -> [text](/p/{currentPostId}/raw/ID)
  processedContent = processedContent.replace(
    /\[([^\]]+)\]\(surl:raw\/([^)\s]+)\)/g,
    (_, text, id) => {
      return `[${text}](/p/${currentPostId}/raw/${id})`;
    },
  );

  // 4. [text](surl:POSTID/raw/ID) -> [text](/p/{POSTID}/raw/ID)
  processedContent = processedContent.replace(
    /\[([^\]]+)\]\(surl:(\d+)\/raw\/([^)\s]+)\)/g,
    (_, text, postId, id) => {
      return `[${text}](/p/${postId}/raw/${id})`;
    },
  );

  // 5. [text](surl:POSTID) or [text](surl:POSTID#HASH) -> [text](/p/{POSTID}#HASH)
  processedContent = processedContent.replace(
    /\[([^\]]+)\]\(surl:(\d+)(?:#([^)]+))?\)/g,
    (_, text, postId, hash) => {
      const hashPart = hash ? `#${hash}` : "";
      return `[${text}](/p/${postId}${hashPart})`;
    },
  );

  return processedContent;
}

export function stripMarkdown(input: string): string {
  // 1. $$...$$ 또는 ```...``` 내용을 제거
  const cleanedContent = input.replace(
    /(\$\$[\s\S]*?\$\$|```[\s\S]*?```)/g,
    "",
  );

  // 2. 마크다운 링크에서 텍스트만 추출 ([text](url) -> text)
  const withoutLinks = cleanedContent.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 3. 영어, 소괄호, 한글(자음/모음 포함), 특수문자(:;/,〈〉=\-_[]), 띄워쓰기, 줄바꿈만 허용
  // 4. 연속된 공백과 줄바꿈을 하나의 공백으로 변경하고 앞뒤 공백 제거
  return withoutLinks
    .replace(/[^a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ0-9().?!:;/,〈〉=\-_\[\]\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 157)
    .replace(/(.{157}).*/, "$1...");
}

export function getSummaryFromContent(content: string): string {
  let summary = content;

  if (summary.startsWith("# 요약")) {
    const endIndex =
      summary.slice(1).search(/(\n\n|\#)/) !== -1
        ? summary.slice(1).search(/(\n\n|\#)/)
        : summary.length;

    if (endIndex !== -1) {
      summary = summary.slice(4, endIndex + 1).trim();
    }

    summary = summary
      .split("\n")
      .map((line) => line.replace(/^-\s*/, ""))
      .join("\n");

    return summary.trim();
  }

  return "";
}
