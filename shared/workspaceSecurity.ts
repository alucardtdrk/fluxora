export const WORKSPACE_SECURITY_SOURCES = [
  "alert_center", "login", "admin", "oauth_token", "drive", "groups", "mobile",
  "rules", "gmail", "user_accounts", "saml", "calendar", "chat", "meet",
] as const;

export type WorkspaceSecuritySource = typeof WORKSPACE_SECURITY_SOURCES[number];

export type WorkspaceEventCursor = { occurredAt: string; documentName: string };

export const WORKSPACE_SECURITY_CATEGORIES = {
  administration: "Administração", collaboration: "Colaboração", data_protection: "Proteção de dados",
  device_security: "Segurança de dispositivos", email_security: "Segurança de e-mail", identity: "Identidade",
  oauth: "Aplicativos e permissões", security_policy: "Políticas de segurança", workspace_security: "Segurança do Workspace",
} as const;
export type WorkspaceSecurityCategory = keyof typeof WORKSPACE_SECURITY_CATEGORIES;
