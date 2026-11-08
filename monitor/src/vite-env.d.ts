/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIME_URI?: string;
  readonly VITE_SPACETIME_DB?: string;
  /** The text agent's local server. The Neighborhood agent tab sends drafted messages through it. */
  readonly VITE_AGENT_URL?: string;
}
