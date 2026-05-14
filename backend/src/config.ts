import "dotenv/config";

export type AIProviderName = "mock" | "azure_openai" | "openai_compatible";

export interface AppConfig {
  nodeEnv: string;
  port: number;
  appName: string;
  appEnv: string;
  logLevel: string;
  ai: {
    provider: AIProviderName;
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    maxHistoryMessages: number;
    maxInputChars: number;
    azureOpenAI: {
      endpoint: string;
      apiKey: string;
      deployment: string;
      apiVersion: string;
    };
    openAI: {
      apiKey: string;
      baseUrl: string;
      model: string;
    };
  };
  sql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    enabled: boolean;
  };
  flags: {
    authEnabled: boolean;
    customLogIngestionEnabled: boolean;
    runMigrationsOnStartup: boolean;
  };
}

function str(name: string, defaultValue = ""): string {
  return process.env[name] ?? defaultValue;
}

function num(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function bool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw.toLowerCase() === "true";
}

function parseProvider(raw: string): AIProviderName {
  if (raw === "azure_openai" || raw === "openai_compatible" || raw === "mock") {
    return raw;
  }
  return "mock";
}

export function loadConfig(): AppConfig {
  const pgHost = str("PG_HOST");
  const pgDatabase = str("PG_DATABASE");
  const pgUser = str("PG_USER");
  const pgPassword = str("PG_PASSWORD");

  return {
    nodeEnv: str("NODE_ENV", "development"),
    port: num("PORT", 3000),
    appName: str("APP_NAME", "Azure AI Chat"),
    appEnv: str("APP_ENV", "local"),
    logLevel: str("LOG_LEVEL", "info"),
    ai: {
      provider: parseProvider(str("AI_PROVIDER", "mock")),
      model: str("AI_MODEL", "mock-gpt"),
      systemPrompt: str("AI_SYSTEM_PROMPT", "You are a helpful AI assistant."),
      temperature: num("AI_TEMPERATURE", 0.2),
      maxTokens: num("AI_MAX_TOKENS", 1000),
      maxHistoryMessages: num("AI_MAX_HISTORY_MESSAGES", 20),
      maxInputChars: num("AI_MAX_INPUT_CHARS", 12_000),
      azureOpenAI: {
        endpoint: str("AZURE_OPENAI_ENDPOINT"),
        apiKey: str("AZURE_OPENAI_API_KEY"),
        deployment: str("AZURE_OPENAI_DEPLOYMENT"),
        apiVersion: str("AZURE_OPENAI_API_VERSION", "2024-10-21"),
      },
      openAI: {
        apiKey: str("OPENAI_API_KEY"),
        baseUrl: str("OPENAI_BASE_URL"),
        model: str("OPENAI_MODEL"),
      },
    },
    sql: {
      host: pgHost,
      port: num("PG_PORT", 5432),
      database: pgDatabase,
      user: pgUser,
      password: pgPassword,
      ssl: bool("PG_SSL", false),
      // Postgres is enabled when minimum config is set. Otherwise the app falls
      // back to in-memory storage so smoke tests pass without a database.
      enabled: Boolean(pgHost && pgDatabase && pgUser && pgPassword),
    },
    flags: {
      authEnabled: bool("AUTH_ENABLED", false),
      customLogIngestionEnabled: bool("CUSTOM_LOG_INGESTION_ENABLED", false),
      runMigrationsOnStartup: bool("RUN_MIGRATIONS_ON_STARTUP", true),
    },
  };
}

export const config = loadConfig();
