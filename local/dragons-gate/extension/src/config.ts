declare const __DG_CONFIG__: {
  allowedHosts: string[];
  startUrls: string[];
  receiverUrl: string;
  schedule: { weekday: string; hour: number; timezone: string };
};

export const dgConfig = __DG_CONFIG__;
