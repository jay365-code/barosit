/**
 * Gubid Co., Ltd. / BaroSit Legal Metadata and Interpolation System
 * Aligned with docs/saas-core-blueprint.md Section 7.
 */

export const LEGAL_METADATA = {
  COMPANY_NAME: "주식회사 구비드",
  REPRESENTATIVE: "이종현",
  BUSINESS_NUMBER: "512-88-00059",
  MAIL_ORDER_NUMBER: "제 2025-서울송파-2552 호",
  ADDRESS: "서울특별시 송파구 오금로15길 5-12, 3층 3425호 (방이동, 정환빌딩)",
  PRIVACY_OFFICER: "이종현 (대표)",
  REFUND_WINDOW: "7일",
  CONTACT_EMAIL: "support@barosit.com",
  CONTACT_PHONE: "010-8635-0058",
  RELEASE_DATE: "2026년 5월 21일",
};

/**
 * Replaces all occurrences of {{KEY}} placeholders inside legal markdown text
 * with their corresponding value from LEGAL_METADATA.
 *
 * @param rawMarkdown The raw markdown string loaded from docs/*.md
 */
export function interpolateLegalTemplate(rawMarkdown: string): string {
  let result = rawMarkdown;
  for (const [key, value] of Object.entries(LEGAL_METADATA)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    result = result.replace(regex, value);
  }
  return result;
}
