export type Language = "zh" | "en";

export const categories = [
  "calendar",
  "activities",
  "dining",
  "schedule",
  "transport",
  "forms",
  "policies"
] as const;

export type Category = (typeof categories)[number];

export const copy = {
  zh: {
    switchLanguage: "切换到 English",
    eyebrow: "官方来源 · 双语问答",
    title: "ISB 家长知识助手",
    subtitle: "快速查找校历、课后活动、餐饮和家长事务。每个回答都会标明来源与核验时间。",
    categoriesRegion: "快捷分类",
    categoriesTitle: "你想了解什么？",
    category: {
      calendar: "校历",
      activities: "课后活动",
      dining: "餐饮",
      schedule: "课表",
      transport: "交通",
      forms: "表格",
      policies: "政策"
    },
    questionLabel: "你的问题",
    questionPlaceholder: "例如：下一次课后活动报名什么时候开始？",
    ask: "查询官方资料",
    loading: "正在查找官方资料…",
    error: "问答服务暂时不可用，你仍可浏览下方已收录资料。",
    share: "复制分享链接",
    shared: "链接已复制",
    sources: "官方来源",
    verified: "最后核验",
    stale: "资料可能已过期，请核对来源",
    expired: "资料已超过有效期，请向学校确认",
    recent: "近期重要信息",
    recentSubtitle: "即使问答服务暂不可用，这些已收录资料仍可浏览。",
    noUpdates: "暂无已发布资料。",
    serviceCurrent: "资料已更新",
    footer: "非 ISB 官方产品。重要决定请以学校最新通知为准。"
  },
  en: {
    switchLanguage: "切换到中文",
    eyebrow: "Official sources · Bilingual answers",
    title: "ISB Family Knowledge Assistant",
    subtitle: "Find calendars, after-school activities, dining, and parent essentials—with a source and verification date for every answer.",
    categoriesRegion: "Quick categories",
    categoriesTitle: "What can we help you find?",
    category: {
      calendar: "Calendar",
      activities: "After-school activities",
      dining: "Dining",
      schedule: "Schedule",
      transport: "Transport",
      forms: "Forms",
      policies: "Policies"
    },
    questionLabel: "Your question",
    questionPlaceholder: "For example: When does the next ASA registration open?",
    ask: "Search official sources",
    loading: "Searching official sources…",
    error: "Chat is temporarily unavailable. You can still browse the saved updates below.",
    share: "Copy share link",
    shared: "Link copied",
    sources: "Official sources",
    verified: "Last verified",
    stale: "This information may be stale; please check the source",
    expired: "This information is past its validity date; please confirm with the school",
    recent: "Recent important information",
    recentSubtitle: "These saved updates remain available even if chat is temporarily offline.",
    noUpdates: "No published information yet.",
    serviceCurrent: "Knowledge current",
    footer: "This is not an official ISB product. Confirm important decisions against the latest school notice."
  }
} as const;
