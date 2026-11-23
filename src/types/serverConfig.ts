/** Read-only settings from the backend's config file (`GET /server-config`). */
export interface ServerConfig {
  /** IANA time zone that decides what "today" is, e.g. `America/Chicago`. */
  timezone: string;
}
