export type CalendarEntry = {
  externalId: string;
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  allDay: boolean;
};
export interface CalendarProvider {
  parse(content: string, from: Date, to: Date): CalendarEntry[];
}
export interface LearningPlatformProvider {
  listMaterials(): Promise<{ id: string; title: string }[]>;
}
export interface MailProvider {
  getWebmailUrl(): string | null;
}
export class LocalLearningProvider implements LearningPlatformProvider {
  async listMaterials() {
    return [];
  }
}
export class LocalMailProvider implements MailProvider {
  getWebmailUrl() {
    return process.env.UNI_WEBMAIL_URL?.startsWith("https://")
      ? process.env.UNI_WEBMAIL_URL
      : "https://mail.myubt.de";
  }
}
